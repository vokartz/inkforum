/**
 * InkForum güncelleyici (Docker yardımcı kapsayıcısı).
 *
 * Uygulama kapsayıcısı Docker soketine erişmez; güncelleme isteğini iç ağdaki bu küçük servise
 * paylaşılan bir anahtarla iletir. Güncelleyici:
 *   1. ghcr.io/vokartz/inkforum:<sürüm> imajını çeker (yalnızca yapılandırılmış imaj deposundan),
 *   2. `inkforum.role=app` etiketli kapsayıcıları aynı ayarlarla yeni imajdan yeniden oluşturur,
 *   3. sağlık denetimi geçmezse eski kapsayıcıya geri döner,
 *   4. en sonda kendini de günceller.
 *
 * Ortam: UPDATER_TOKEN (yoksa uygulamanın ürettiği UPDATER_TOKEN_FILE okunur), UPDATER_IMAGE, UPDATER_PORT (9000),
 * DOCKER_SOCKET.
 * Nest'e bağımlı değildir; sürüm paketinde `updater.mjs` olarak çalışır.
 */
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';

type State = 'idle' | 'backup' | 'download' | 'install' | 'restart' | 'verify' | 'done' | 'failed' | 'rolledback';

interface Job {
  state: State;
  version: string | null;
  from: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  log: Array<{ at: number; message: string; level: 'info' | 'warn' | 'error' }>;
  error: string | null;
}

const TOKEN_FILE = process.env.UPDATER_TOKEN_FILE ?? '/app/storage/.updater-token';

/** Ortamdaki anahtar ya da uygulamanın paylaşılan depolamaya yazdığı anahtar (uygulama sonra açılabilir) */
function token(): string {
  if (process.env.UPDATER_TOKEN) return process.env.UPDATER_TOKEN;
  try {
    return readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}
const IMAGE = (process.env.UPDATER_IMAGE ?? 'ghcr.io/vokartz/inkforum').replace(/:.*$/, '');
const PORT = Number(process.env.UPDATER_PORT ?? 9000);
const SOCKET = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
const APP_LABEL = 'inkforum.role';
const HEALTH_TIMEOUT_MS = Number(process.env.UPDATER_HEALTH_TIMEOUT ?? 240) * 1000;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

let job: Job = { state: 'idle', version: null, from: null, startedAt: null, finishedAt: null, log: [], error: null };

function log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  job.log.push({ at: Date.now(), message, level });
  if (job.log.length > 300) job.log.splice(0, job.log.length - 300);
  console[level === 'info' ? 'log' : level](`[updater] ${message}`);
}

// ---------- Docker Engine API (Unix soketi) ----------

interface DockerResponse {
  status: number;
  body: string;
}

function docker(method: string, path: string, body?: unknown, onChunk?: (line: string) => void): Promise<DockerResponse> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      { socketPath: SOCKET, method, path, headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {} },
      (res) => {
        let data = '';
        let pending = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => {
          if (onChunk) {
            pending += c;
            const lines = pending.split('\n');
            pending = lines.pop() ?? '';
            for (const l of lines) if (l.trim()) onChunk(l);
          } else data += c;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(15 * 60_000, () => req.destroy(new Error('Docker isteği zaman aşımına uğradı.')));
    if (payload) req.write(payload);
    req.end();
  });
}

async function dockerJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await docker(method, path, body);
  if (r.status >= 300) throw new Error(`Docker ${method} ${path.split('?')[0]}: ${r.status} ${r.body.slice(0, 300)}`);
  return (r.body ? JSON.parse(r.body) : {}) as T;
}

async function dockerOk(method: string, path: string, body?: unknown, allow: number[] = []): Promise<void> {
  const r = await docker(method, path, body);
  if (r.status >= 300 && !allow.includes(r.status)) throw new Error(`Docker ${method} ${path.split('?')[0]}: ${r.status} ${r.body.slice(0, 300)}`);
}

interface ContainerSummary {
  Id: string;
  Names: string[];
  Labels: Record<string, string>;
  State: string;
}

interface ContainerInspect {
  Id: string;
  Name: string;
  Image: string;
  Config: {
    Env: string[] | null;
    Labels: Record<string, string> | null;
    Cmd: string[] | null;
    Entrypoint: string[] | null;
    WorkingDir: string;
    User: string;
    ExposedPorts: Record<string, object> | null;
    Healthcheck?: unknown;
    Volumes: Record<string, object> | null;
    Image: string;
    [k: string]: unknown;
  };
  HostConfig: Record<string, unknown>;
  Mounts?: Array<{ Type: string; Name?: string; Destination: string }>;
  NetworkSettings: { Networks: Record<string, { Aliases: string[] | null; IPAMConfig: unknown; Links: string[] | null }> };
  State: { Health?: { Status: string }; Running: boolean };
}

interface ImageInspect {
  Id: string;
  Config: ContainerInspect['Config'];
}

async function pull(tag: string): Promise<void> {
  let last = '';
  const r = await docker('POST', `/images/create?fromImage=${encodeURIComponent(IMAGE)}&tag=${encodeURIComponent(tag)}`, undefined, (line) => {
    try {
      const m = JSON.parse(line) as { status?: string; error?: string; progress?: string; id?: string };
      if (m.error) throw new Error(m.error);
      const s = m.status ?? '';
      if (s && s !== last && !/Downloading|Extracting|Waiting/.test(s)) {
        log(`${m.id ? `${m.id}: ` : ''}${s}`);
        last = s;
      }
    } catch (err) {
      if (err instanceof SyntaxError) return;
      throw err;
    }
  });
  if (r.status >= 300) throw new Error(`İmaj indirilemedi (${r.status}).`);
}

/** Eski imajın varsayılanlarıyla aynı olan alanlar yeni imajın varsayılanlarına bırakılır. */
function carryConfig(c: ContainerInspect, oldImage: ImageInspect, newImageRef: string) {
  const oldEnv = new Set(oldImage.Config.Env ?? []);
  const env = (c.Config.Env ?? []).filter((e) => !oldEnv.has(e));
  const oldLabels = oldImage.Config.Labels ?? {};
  const labels = Object.fromEntries(Object.entries(c.Config.Labels ?? {}).filter(([k, v]) => oldLabels[k] !== v));
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const cfg: Record<string, unknown> = {
    ...c.Config,
    Image: newImageRef,
    Env: env,
    Labels: labels,
    Hostname: undefined,
  };
  for (const k of ['Cmd', 'Entrypoint', 'WorkingDir', 'User', 'ExposedPorts', 'Healthcheck', 'Volumes'] as const) {
    if (same(c.Config[k], oldImage.Config[k])) delete cfg[k];
  }
  return cfg;
}

/**
 * İmajdaki VOLUME için platform kalıcı birim bağlamadıysa Docker isimsiz bir birim açar; HostConfig'te yer almadığından
 * yeni kapsayıcı boş bir birimle başlardı. Bu birimler yeni kapsayıcıya aynen bağlanır, veriler korunur.
 */
function keepAnonymousVolumes(c: ContainerInspect): Record<string, unknown> {
  const host = { ...c.HostConfig };
  const binds = (host.Binds as string[] | null | undefined) ?? [];
  const mounts = ((host.Mounts as Array<{ Target: string }> | null | undefined) ?? []).slice();
  const covered = new Set([...binds.map((b) => b.split(':')[1]), ...mounts.map((m) => m.Target)]);
  for (const m of c.Mounts ?? []) {
    if (m.Type !== 'volume' || !m.Name || covered.has(m.Destination)) continue;
    mounts.push({ Type: 'volume', Source: m.Name, Target: m.Destination } as { Target: string });
    log(`İsimsiz birim korunuyor: ${m.Destination}`, 'warn');
  }
  if (mounts.length) host.Mounts = mounts;
  return host;
}

async function waitHealthy(id: string): Promise<void> {
  const until = Date.now() + HEALTH_TIMEOUT_MS;
  let lastStatus = '';
  while (Date.now() < until) {
    const c = await dockerJson<ContainerInspect>('GET', `/containers/${id}/json`);
    if (!c.State.Running) throw new Error('Yeni kapsayıcı çalışmayı durdurdu.');
    const status = c.State.Health?.Status ?? 'none';
    if (status !== lastStatus) {
      log(`Sağlık durumu: ${status}`);
      lastStatus = status;
    }
    if (status === 'healthy') return;
    if (status === 'none' && Date.now() > until - HEALTH_TIMEOUT_MS + 20_000) return; // sağlık denetimi tanımsız: 20 sn çalıştıysa kabul
    if (status === 'unhealthy') throw new Error('Yeni kapsayıcı sağlık denetiminden geçemedi.');
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Yeni kapsayıcı zamanında hazır olmadı.');
}

/** Tek kapsayıcıyı yeni imajla yeniden oluşturur; hata olursa eskisine döner. */
async function recreate(summary: ContainerSummary, newRef: string, waitForHealth: boolean): Promise<void> {
  const c = await dockerJson<ContainerInspect>('GET', `/containers/${summary.Id}/json`);
  const name = c.Name.replace(/^\//, '');
  const oldImage = await dockerJson<ImageInspect>('GET', `/images/${encodeURIComponent(c.Image)}/json`);
  const networks = Object.entries(c.NetworkSettings.Networks ?? {});
  const [first, ...rest] = networks;
  const body = {
    ...carryConfig(c, oldImage, newRef),
    HostConfig: keepAnonymousVolumes(c),
    NetworkingConfig: first ? { EndpointsConfig: { [first[0]]: { Aliases: first[1].Aliases, IPAMConfig: first[1].IPAMConfig, Links: first[1].Links } } } : undefined,
  };
  const backupName = `${name}-old-${Date.now()}`;
  log(`${name}: yeniden oluşturuluyor…`);
  await dockerOk('POST', `/containers/${c.Id}/rename?name=${encodeURIComponent(backupName)}`);
  let created: string | null = null;
  try {
    const res = await dockerJson<{ Id: string }>('POST', `/containers/create?name=${encodeURIComponent(name)}`, body);
    created = res.Id;
    for (const [net, cfg] of rest) {
      await dockerOk('POST', `/networks/${encodeURIComponent(net)}/connect`, { Container: created, EndpointConfig: { Aliases: cfg.Aliases } });
    }
    await dockerOk('POST', `/containers/${c.Id}/stop?t=30`, undefined, [304]);
    await dockerOk('POST', `/containers/${created}/start`, undefined, [304]);
    if (waitForHealth) {
      job.state = 'verify';
      log(`${name}: sağlık denetimi bekleniyor (veritabanı güncellemeleri birkaç dakika sürebilir)…`);
      await waitHealthy(created);
    }
    await dockerOk('DELETE', `/containers/${c.Id}?v=false&force=true`, undefined, [404]);
    log(`${name}: güncellendi.`);
  } catch (err) {
    log(`${name}: hata — eski sürüme dönülüyor: ${(err as Error).message}`, 'error');
    if (created) await dockerOk('DELETE', `/containers/${created}?force=true`, undefined, [404]).catch(() => undefined);
    await dockerOk('POST', `/containers/${c.Id}/rename?name=${encodeURIComponent(name)}`).catch(() => undefined);
    await dockerOk('POST', `/containers/${c.Id}/start`, undefined, [304]).catch(() => undefined);
    throw Object.assign(err as Error, { rolledBack: true });
  }
}

async function containers(role: 'app' | 'updater'): Promise<ContainerSummary[]> {
  const filters = encodeURIComponent(JSON.stringify({ label: [`${APP_LABEL}=${role}`] }));
  return dockerJson<ContainerSummary[]>('GET', `/containers/json?all=true&filters=${filters}`);
}

async function runUpdate(version: string): Promise<void> {
  const ref = `${IMAGE}:${version}`;
  try {
    job.state = 'download';
    log(`${ref} indiriliyor…`);
    await pull(version);
    log('İmaj hazır.');

    job.state = 'install';
    const apps = (await containers('app')).filter((c) => !c.Names.some((n) => /-old-\d+$/.test(n)));
    if (!apps.length) throw new Error(`"${APP_LABEL}=app" etiketli kapsayıcı bulunamadı.`);
    for (const app of apps) await recreate(app, ref, true);

    job.state = 'done';
    job.finishedAt = Date.now();
    log(`InkForum v${version} kuruldu.`);

    // En son güncelleyicinin kendisi: yeni kopya açılınca eskisini (bu süreç) kaldırır
    const self = (await containers('updater')).find((c) => c.Id.startsWith(process.env.HOSTNAME ?? '~'));
    if (self) {
      log('Güncelleyici de yenileniyor…');
      await selfReplace(self, ref).catch((err: Error) => log(`Güncelleyici yenilenemedi: ${err.message}`, 'warn'));
    }
  } catch (err) {
    job.state = (err as { rolledBack?: boolean }).rolledBack ? 'rolledback' : 'failed';
    job.error = (err as Error).message;
    job.finishedAt = Date.now();
    log(`Güncelleme tamamlanamadı: ${job.error}`, 'error');
  }
}

async function selfReplace(self: ContainerSummary, ref: string): Promise<void> {
  const c = await dockerJson<ContainerInspect>('GET', `/containers/${self.Id}/json`);
  if (c.Config.Image === ref) return;
  const name = c.Name.replace(/^\//, '');
  const oldImage = await dockerJson<ImageInspect>('GET', `/images/${encodeURIComponent(c.Image)}/json`);
  const networks = Object.entries(c.NetworkSettings.Networks ?? {});
  const [first] = networks;
  await dockerOk('POST', `/containers/${c.Id}/rename?name=${encodeURIComponent(`${name}-old-${Date.now()}`)}`);
  const created = await dockerJson<{ Id: string }>('POST', `/containers/create?name=${encodeURIComponent(name)}`, {
    ...carryConfig(c, oldImage, ref),
    HostConfig: c.HostConfig,
    NetworkingConfig: first ? { EndpointsConfig: { [first[0]]: { Aliases: first[1].Aliases } } } : undefined,
  });
  await dockerOk('POST', `/containers/${created.Id}/start`);
}

/** Açılışta: önceki güncelleyici kopyalarını ve yarım kalmış "-old-" kapsayıcılarını temizle */
async function cleanup(): Promise<void> {
  try {
    const me = process.env.HOSTNAME ?? '';
    for (const c of await containers('updater')) {
      if (!c.Id.startsWith(me)) await dockerOk('DELETE', `/containers/${c.Id}?force=true`, undefined, [404]);
    }
    for (const c of await containers('app')) {
      if (c.Names.some((n) => /-old-\d+$/.test(n)) && c.State !== 'running') await dockerOk('DELETE', `/containers/${c.Id}?force=true`, undefined, [404]);
    }
  } catch (err) {
    console.warn(`[updater] temizlik atlandı: ${(err as Error).message}`);
  }
}

// ---------- HTTP ----------

function authorized(req: IncomingMessage): boolean {
  const given = Buffer.from(String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
  const current = token();
  const expected = Buffer.from(current);
  return current.length >= 16 && given.length === expected.length && timingSafeEqual(given, expected);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 4096) throw new Error('İstek çok büyük.');
  }
  return data ? JSON.parse(data) : {};
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://updater');
    if (url.pathname === '/v1/health') return send(res, 200, { ok: true });
    if (!authorized(req)) return send(res, 401, { error: 'Yetkisiz.' });
    if (req.method === 'GET' && url.pathname === '/v1/status') return send(res, 200, job);
    if (req.method === 'POST' && url.pathname === '/v1/update') {
      const body = (await readBody(req)) as { version?: unknown };
      const version = typeof body.version === 'string' ? body.version.replace(/^v/, '') : '';
      if (!VERSION_RE.test(version)) return send(res, 400, { error: 'Geçersiz sürüm.' });
      if (!['idle', 'done', 'failed', 'rolledback'].includes(job.state)) return send(res, 409, { error: 'Bir güncelleme zaten sürüyor.' });
      const current = (await containers('app'))[0];
      const from = current ? ((await dockerJson<ContainerInspect>('GET', `/containers/${current.Id}/json`)).Config.Image.split(':')[1] ?? null) : null;
      job = { state: 'download', version, from, startedAt: Date.now(), finishedAt: null, log: [], error: null };
      void runUpdate(version);
      return send(res, 202, job);
    }
    return send(res, 404, { error: 'Bulunamadı.' });
  })().catch((err: Error) => send(res, 500, { error: err.message }));
});

if (process.env.UPDATER_TOKEN && process.env.UPDATER_TOKEN.length < 16) {
  console.error('[updater] UPDATER_TOKEN en az 16 karakter olmalı.');
  process.exit(1);
}
void cleanup();
server.listen(PORT, '0.0.0.0', () => console.log(`[updater] ${IMAGE} için hazır (port ${PORT})`));
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => server.close(() => process.exit(0)));
