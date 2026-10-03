import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  PRODUCT_NAME,
  autoInstallAllows,
  cleanVersion,
  compareVersions,
  isVersion,
  parseVersion,
  pickReleaseNotes,
  renderMarkdown,
  updateKind,
  updateSettingsInput,
  type ReleaseInfo,
  type UpdateJob,
  type UpdateSettingsInput,
  type CoolifyUpdateInput,
  type UpdateStatus,
} from '@forum/shared';
import { CONFIG, type AppConfig } from '../config/config.js';
import { Db } from '../database/db.service.js';
import { Clock, HOUR, MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BackupService } from '../maintenance/backup.service.js';
import { requestRestart } from '../common/restart.js';
import { CryptoService } from '../security/crypto.service.js';
import { I18nService } from '../i18n/i18n.service.js';
import { storageWarning } from '../storage/persistence.js';

const CACHE_KEY = 'updates:cache';
const NOTIFIED_KEY = 'updates:notified';
const PLATFORM_PENDING_KEY = 'updates:platform-pending';
const JOB_KEY = 'updates:job';
const CHECK_EVERY = 6 * HOUR;

interface Cache {
  checkedAt: number | null;
  error: string | null;
  etag: string | null;
  releases: Array<Omit<ReleaseInfo, 'notesHtml'>>;
}

interface GithubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
  assets: Array<{ name: string; browser_download_url: string; size: number }>;
}

const EMPTY_JOB: UpdateJob = { state: 'idle', version: null, from: null, startedAt: null, finishedAt: null, log: [], error: null };

@Injectable()
export class UpdatesService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Güncelleme');
  private checking: Promise<void> | null = null;
  private localJob: UpdateJob | null = null;

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
    private readonly groups: GroupCacheService,
    private readonly audit: AuditService,
    private readonly backups: BackupService,
    private readonly crypto: CryptoService,
    private readonly i18n: I18nService,
  ) {}

  private updaterFailure: { code: string; host: string; at: number } | null = null;

  async onApplicationBootstrap(): Promise<void> {
    this.jobs.schedule('updates.tick', 30 * MINUTE, () => this.tick());
    await this.finishPendingRelease();
    await this.finishPendingPlatform();
  }

  prefs(): UpdateSettingsInput {
    return updateSettingsInput.parse(this.settings.get('updates.config') ?? {});
  }

  async saveSettings(input: UpdateSettingsInput, actorId: number): Promise<void> {
    await this.settings.update({ 'updates.config': input }, actorId, { allowHidden: true });
  }

  private async state<T>(key: string, fallback: T): Promise<T> {
    const row = await this.db.q.selectFrom('system_state').select('value').where('key', '=', key).executeTakeFirst();
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  private async setState(key: string, value: unknown): Promise<void> {
    const now = this.clock.now();
    const v = JSON.stringify(value);
    await this.db.q
      .insertInto('system_state')
      .values({ key, value: v, updated_at: now })
      .onConflict((oc) => oc.column('key').doUpdateSet({ value: v, updated_at: now }))
      .execute();
  }

  private cache(): Promise<Cache> {
    return this.state<Cache>(CACHE_KEY, { checkedAt: null, error: null, etag: null, releases: [] });
  }

  private latestFor(releases: Cache['releases'], s: UpdateSettingsInput) {
    return releases.find((r) => (s.channel === 'beta' || !r.prerelease) && compareVersions(r.version, this.config.version) > 0) ?? null;
  }

  private withHtml(r: Omit<ReleaseInfo, 'notesHtml'>, locale: string): ReleaseInfo {
    return { ...r, notesHtml: renderMarkdown(pickReleaseNotes(r.notes, locale)) };
  }

  installBlocker(): string | null {
    if (this.config.updates.disabled) return 'Güncelleme denetimi kapalı (UPDATES_DISABLED).';
    if (this.config.deploy === 'source') return 'Kaynak koddan çalışan kurulumlar git ile güncellenir (git pull, pnpm install, pnpm build).';
    if (this.config.deploy === 'docker' && this.coolify().configured && storageWarning(this.config)) {
      return 'Depolama klasörüne kalıcı disk bağlı değil; Coolify ile güncellemek tüm verileri siler. Önce Coolify → Persistent Storage bölümünden /app/storage için bir birim ekleyin.';
    }
    if (this.config.deploy === 'docker' && !this.coolify().configured && (!this.config.updates.updaterUrl || !this.config.updates.updaterToken)) {
      return 'Güncelleyici kapsayıcı ayarlı değil (UPDATER_URL / UPDATER_TOKEN). Resmi docker-compose.yml dosyasını kullanın.';
    }
    return null;
  }

  async status(refresh = false, locale = 'tr'): Promise<UpdateStatus> {
    if (refresh) await this.check(true);
    const s = this.prefs();
    const c = await this.cache();
    const latest = this.latestFor(c.releases, s);
    const blocker = this.installBlocker();
    return {
      product: PRODUCT_NAME,
      current: { version: this.config.version, build: this.config.build, deploy: this.config.deploy, node: process.version },
      repo: this.config.updates.repo,
      checkedAt: c.checkedAt,
      checkError: c.error,
      latest: latest ? this.withHtml(latest, locale) : null,
      available: !!latest,
      kind: latest ? updateKind(this.config.version, latest.version) : null,
      releases: c.releases.filter((r) => s.channel === 'beta' || !r.prerelease || r.version === this.config.version).map((r) => this.withHtml(r, locale)),
      canInstall: !blocker,
      installBlocker: blocker ? this.i18n.message(this.i18n.resolve({ preference: locale }), blocker) : null,
      job: await this.job(),
      settings: s,
      updater:
        this.config.deploy === 'docker' && this.config.updates.updaterUrl
          ? { reachable: !this.updaterFailure, error: this.updaterFailure ? this.describeUpdaterError(this.updaterFailure, locale) : null }
          : null,
      coolify:
        this.config.deploy === 'docker'
          ? { detected: this.config.coolify, configured: this.coolify().configured, webhookUrl: this.coolify().webhookUrl, hasToken: !!this.coolify().tokenEnc }
          : null,
    };
  }

  async summary(): Promise<{ current: string; available: string | null }> {
    const latest = this.latestFor((await this.cache()).releases, this.prefs());
    return { current: this.config.version, available: latest?.version ?? null };
  }

  async check(force = false): Promise<void> {
    if (this.config.updates.disabled) return;
    this.checking ??= this.doCheck(force).finally(() => (this.checking = null));
    return this.checking;
  }

  private async doCheck(force: boolean): Promise<void> {
    const c = await this.cache();
    const url = `${this.config.updates.apiUrl}/repos/${this.config.updates.repo}/releases?per_page=30`;
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': `${PRODUCT_NAME}/${this.config.version}`,
    };
    if (c.etag && !force) headers['if-none-match'] = c.etag;
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000), redirect: 'follow' });
      if (res.status === 304) {
        await this.setState(CACHE_KEY, { ...c, checkedAt: this.clock.now(), error: null });
        return;
      }
      if (res.status === 404) throw new Error(`Güncelleme deposu bulunamadı (${this.config.updates.repo}). Depo henüz oluşturulmamış ya da gizli olabilir.`);
      if (res.status === 403 || res.status === 429) throw new Error('GitHub istek sınırına ulaşıldı; bir saat sonra tekrar denenecek.');
      if (!res.ok) throw new Error(`GitHub yanıtı: HTTP ${res.status}`);
      const data = (await res.json()) as GithubRelease[];
      const releases = (Array.isArray(data) ? data : [])
        .filter((r) => !r.draft && isVersion(r.tag_name))
        .map((r) => ({
          version: cleanVersion(r.tag_name),
          name: (r.name ?? '').slice(0, 200) || `${PRODUCT_NAME} ${cleanVersion(r.tag_name)}`,
          notes: (r.body ?? '').slice(0, 60_000),
          publishedAt: r.published_at ? Date.parse(r.published_at) : 0,
          prerelease: r.prerelease || !!parseVersion(r.tag_name)?.pre,
          url: /^https:\/\/github\.com\//.test(r.html_url) ? r.html_url : `https://github.com/${this.config.updates.repo}/releases`,
          assets: (r.assets ?? []).slice(0, 20).map((a) => ({ name: a.name.slice(0, 200), url: a.browser_download_url, size: a.size })),
        }))
        .sort((a, b) => compareVersions(b.version, a.version));
      await this.setState(CACHE_KEY, { checkedAt: this.clock.now(), error: null, etag: res.headers.get('etag'), releases } satisfies Cache);
    } catch (err) {
      const message = err instanceof Error ? (err.name === 'TimeoutError' ? 'GitHub’a ulaşılamadı (zaman aşımı).' : err.message) : String(err);
      await this.setState(CACHE_KEY, { ...c, checkedAt: this.clock.now(), error: message.slice(0, 300) });
      this.logger.warn(`Sürüm denetimi başarısız: ${message}`);
    }
  }

  async tick(): Promise<void> {
    const s = this.prefs();
    if (!s.autoCheck || this.config.updates.disabled) return;
    const c = await this.cache();
    if (!c.checkedAt || this.clock.now() - c.checkedAt >= CHECK_EVERY) await this.check();
    const latest = this.latestFor((await this.cache()).releases, s);
    if (!latest) return;

    if (s.notifyAdmins && (await this.state<string | null>(NOTIFIED_KEY, null)) !== latest.version) {
      await this.setState(NOTIFIED_KEY, latest.version);
      for (const id of await this.adminIds()) await this.notifications.notify(id, 'system.update', { version: latest.version, name: latest.name });
    }

    const kind = updateKind(this.config.version, latest.version);
    const job = await this.job();
    const busy = this.isBusy(job);
    if (autoInstallAllows(s.autoInstall, kind) && new Date(this.clock.now()).getHours() === s.installHour && !busy && !this.installBlocker()) {
      if (job?.version === latest.version && job.state === 'failed') return;
      this.logger.log(`Otomatik güncelleme başlıyor: v${latest.version}`);
      await this.install(latest.version, null).catch((err) => this.logger.error(`Otomatik güncelleme başarısız: ${String(err)}`));
    }
  }

  private async adminIds(): Promise<number[]> {
    const g = await this.groups.bySystemKey('admin');
    const rows = await this.db.q
      .selectFrom('users')
      .select('id')
      .where('deleted_at', 'is', null)
      .where((eb) => eb.or([eb('primary_group_id', '=', g.id), eb.exists(eb.selectFrom('group_members').select('user_id').whereRef('group_members.user_id', '=', 'users.id').where('group_id', '=', g.id))]))
      .execute();
    return rows.map((r) => r.id);
  }

  async job(): Promise<UpdateJob | null> {
    if (this.config.deploy === 'docker' && !this.coolify().configured && this.config.updates.updaterUrl && this.config.updates.updaterToken) {
      if (this.updaterFailure && this.clock.now() - this.updaterFailure.at < MINUTE) return this.localJob ?? (await this.state<UpdateJob | null>(JOB_KEY, null));
      try {
        const res = await this.updater('GET', '/v1/status', undefined, 3_000);
        return (await res.json()) as UpdateJob;
      } catch {
        return this.localJob ?? (await this.state<UpdateJob | null>(JOB_KEY, null));
      }
    }
    return this.localJob ?? (await this.state<UpdateJob | null>(JOB_KEY, null));
  }

  private isBusy(job: UpdateJob | null): boolean {
    if (!job || ['idle', 'done', 'failed', 'rolledback'].includes(job.state)) return false;
    return !job.startedAt || this.clock.now() - job.startedAt < 30 * MINUTE;
  }

  private updater(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 10_000): Promise<Response> {
    return fetch(`${this.config.updates.updaterUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.config.updates.updaterToken}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    }).then(
      async (res) => {
        this.updaterFailure = null;
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw Errors.badRequest(`Güncelleyici: ${text.slice(0, 200) || `HTTP ${res.status}`}`);
        }
        return res;
      },
      (err: unknown) => {
        const e = err as { name?: string; cause?: { code?: string } };
        let host = 'updater';
        try {
          host = new URL(this.config.updates.updaterUrl ?? '').host;
        } catch {
        }
        this.updaterFailure = { code: e?.cause?.code ?? (e?.name === 'TimeoutError' ? 'TIMEOUT' : ''), host, at: this.clock.now() };
        throw new UpdaterUnreachable();
      },
    );
  }

  private describeUpdaterError(f: { code: string; host: string }, locale?: string | null): string {
    const lang = this.i18n.resolve({ preference: locale });
    const tr = (text: string, params?: Record<string, string>) => this.i18n.t(lang, text, params);
    const hint = this.config.coolify
      ? tr('Coolify’da forumu tek imaj olarak kurduysanız güncelleyici kapsayıcısı yoktur: "Coolify ile güncelleme" bölümüne Deploy Webhook adresini ve API anahtarını girin.')
      : tr('Resmi docker-compose.yml dosyasındaki "updater" servisinin çalıştığından emin olun (docker compose up -d).');
    const reason =
      f.code === 'ENOTFOUND' || f.code === 'EAI_AGAIN'
        ? tr('Güncelleyici kapsayıcısı bulunamadı ({host}).', { host: f.host })
        : f.code === 'ECONNREFUSED'
          ? tr('Güncelleyici kapsayıcısı çalışmıyor ({host} bağlantıyı reddetti).', { host: f.host })
          : f.code === 'TIMEOUT' || f.code === 'UND_ERR_CONNECT_TIMEOUT'
            ? tr('Güncelleyici kapsayıcısı yanıt vermiyor ({host}).', { host: f.host })
            : tr('Güncelleyiciye bağlanılamadı ({host}).', { host: f.code ? `${f.host}, ${f.code}` : f.host });
    return `${reason} ${hint}`;
  }

  private coolify(): { configured: boolean; webhookUrl: string; tokenEnc: string } {
    const v = (this.settings.get('updates.coolify') ?? {}) as { webhookUrl?: unknown; tokenEnc?: unknown };
    const webhookUrl = typeof v.webhookUrl === 'string' ? v.webhookUrl : '';
    const tokenEnc = typeof v.tokenEnc === 'string' ? v.tokenEnc : '';
    return { configured: !!webhookUrl && !!tokenEnc, webhookUrl, tokenEnc };
  }

  async saveCoolify(input: CoolifyUpdateInput, actorId: number): Promise<void> {
    const prev = this.coolify();
    const tokenEnc = input.token ? this.crypto.encrypt(input.token) : input.webhookUrl ? prev.tokenEnc : '';
    if (input.webhookUrl && !tokenEnc) throw Errors.field('token', 'Coolify API anahtarı gerekli.');
    await this.settings.update({ 'updates.coolify': { webhookUrl: input.webhookUrl, tokenEnc } }, actorId, { allowHidden: true });
    await this.audit.log({ type: 'admin', action: 'updates.coolify', actorId, data: { configured: !!input.webhookUrl } });
  }

  private async deployWithCoolify(job: UpdateJob): Promise<void> {
    const c = this.coolify();
    let token: string;
    try {
      token = this.crypto.decrypt(c.tokenEnc);
    } catch {
      throw Errors.badRequest('Coolify API anahtarı çözülemedi; anahtarı yeniden kaydedin.');
    }
    const res = await fetch(c.webhookUrl, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'user-agent': `${PRODUCT_NAME}/${this.config.version}` },
      signal: AbortSignal.timeout(20_000),
    }).catch((err: unknown) => {
      const code = (err as { cause?: { code?: string } })?.cause?.code;
      throw Errors.badRequest(`Coolify’a bağlanılamadı${code ? ` (${code})` : ''}. Deploy Webhook adresinin forum sunucusundan erişilebildiğinden emin olun.`);
    });
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) throw Errors.badRequest('Coolify API anahtarı reddedildi. Anahtarın "deploy" yetkisi olduğundan emin olun.');
    if (!res.ok) throw Errors.badRequest(`Coolify yeniden dağıtımı başlatılamadı: HTTP ${res.status} ${text.slice(0, 200)}`);
    this.log(job, 'Coolify yeniden dağıtımı başlatıldı; yeni imaj çekiliyor, forum birazdan yeniden başlayacak.');
  }

  private async finishPendingPlatform(): Promise<void> {
    const p = await this.state<{ from: string; to: string } | null>(PLATFORM_PENDING_KEY, null);
    if (!p || compareVersions(this.config.version, p.from) === 0) return;
    const job = await this.state<UpdateJob>(JOB_KEY, { ...EMPTY_JOB });
    const ok = compareVersions(this.config.version, p.to) >= 0;
    job.state = ok ? 'done' : 'failed';
    job.finishedAt = this.clock.now();
    job.error = ok ? null : `Beklenen sürüm v${p.to}, çalışan v${this.config.version}. Coolify’da imaj etiketinin "latest" olduğundan emin olun.`;
    job.log.push({ at: this.clock.now(), message: ok ? `v${this.config.version} sürümüne güncellendi.` : (job.error ?? ''), level: ok ? 'info' : 'error' });
    await this.setState(JOB_KEY, job);
    await this.db.q.deleteFrom('system_state').where('key', '=', PLATFORM_PENDING_KEY).execute();
    if (ok) for (const id of await this.adminIds()) await this.notifications.notify(id, 'system.updated', { version: this.config.version });
  }

  private log(job: UpdateJob, message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    job.log.push({ at: this.clock.now(), message, level });
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
    this.logger[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](message);
  }

  async install(version: string, actorId: number | null, locale?: string | null): Promise<UpdateJob> {
    const blocker = this.installBlocker();
    if (blocker) throw Errors.badRequest(blocker);
    const target = cleanVersion(version);
    const release = (await this.cache()).releases.find((r) => r.version === target);
    if (!release) throw Errors.badRequest('Bu sürüm yayın listesinde yok. Önce "Şimdi denetle" ile listeyi yenileyin.');
    if (compareVersions(target, this.config.version) === 0) throw Errors.badRequest('Bu sürüm zaten kurulu.');
    const current = await this.job();
    if (this.isBusy(current)) throw Errors.conflict('Bir güncelleme zaten sürüyor.');

    const job: UpdateJob = { ...EMPTY_JOB, log: [], state: 'backup', version: target, from: this.config.version, startedAt: this.clock.now() };
    this.localJob = job;
    await this.audit.log({ type: 'admin', action: 'updates.install', actorId, data: { from: this.config.version, to: target } });

    try {
      if (this.backups.supported().ok) {
        this.log(job, 'Veritabanı yedeği alınıyor…');
        const b = await this.backups.create('db', `pre-update-${target.replace(/[^a-z0-9]+/gi, '-')}`);
        this.log(job, `Yedek hazır: ${b.name}`);
      } else this.log(job, `Yedek alınamadı: ${this.backups.supported().reason}`, 'warn');

      if (this.config.deploy === 'docker' && this.coolify().configured) {
        job.state = 'restart';
        this.log(job, 'Coolify’a yeniden dağıtım isteği gönderiliyor…');
        await this.deployWithCoolify(job);
        await this.setState(PLATFORM_PENDING_KEY, { from: this.config.version, to: target });
        await this.setState(JOB_KEY, job);
        return job;
      }

      if (this.config.deploy === 'docker') {
        job.state = 'download';
        this.log(job, 'Güncelleyici kapsayıcıya iletiliyor…');
        await this.updater('POST', '/v1/update', { version: target });
        this.log(job, 'Yeni imaj indiriliyor; uygulama birazdan yeniden başlayacak.');
        this.localJob = null;
        return (await this.job()) ?? job;
      }

      void this.installRelease(job, release).catch(async (err) => {
        job.state = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
        job.finishedAt = this.clock.now();
        this.log(job, `Güncelleme başarısız: ${job.error}`, 'error');
        await this.setState(JOB_KEY, job);
      });
      return job;
    } catch (err) {
      const unreachable = err instanceof UpdaterUnreachable && this.updaterFailure;
      job.state = 'failed';
      job.error = unreachable ? this.describeUpdaterError(this.updaterFailure!, locale) : err instanceof Error ? err.message : String(err);
      job.finishedAt = this.clock.now();
      this.log(job, `Güncelleme başlatılamadı: ${job.error}`, 'error');
      await this.setState(JOB_KEY, job);
      throw unreachable ? Errors.badRequest(job.error) : err;
    }
  }

  private updateDir(): string {
    return join(this.config.root, '.update');
  }

  private async download(url: string, file: string, maxBytes: number): Promise<void> {
    if (!/^https:\/\/(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)\//.test(url)) throw new Error(`Beklenmeyen indirme adresi: ${url}`);
    const res = await fetch(url, { headers: { 'user-agent': `${PRODUCT_NAME}/${this.config.version}`, accept: 'application/octet-stream' }, signal: AbortSignal.timeout(10 * 60_000), redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`İndirme başarısız: HTTP ${res.status}`);
    let size = 0;
    const body = Readable.fromWeb(res.body as never);
    body.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) body.destroy(new Error('Paket beklenenden büyük.'));
    });
    await pipeline(body, createWriteStream(file));
  }

  private run(cmd: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'], shell: process.platform === 'win32' });
      let err = '';
      child.stderr.on('data', (c: Buffer) => (err = (err + c.toString()).slice(-2000)));
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0] ?? ''} başarısız: ${err.trim().split('\n').pop() ?? code}`))));
    });
  }

  private async installRelease(job: UpdateJob, release: Cache['releases'][number]): Promise<void> {
    const platform = `${process.platform}-${process.arch}`;
    const asset =
      release.assets.find((a) => a.name === `inkforum-${release.version}-${platform}.tar.gz`) ?? release.assets.find((a) => a.name === `inkforum-${release.version}.tar.gz`);
    const sums = release.assets.find((a) => a.name === 'SHA256SUMS');
    if (!asset || !sums) throw new Error('Yayında sürüm paketi ya da SHA256SUMS dosyası yok.');

    const dir = this.updateDir();
    const staging = join(dir, `staging-${release.version}`);
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });

    job.state = 'download';
    this.log(job, `İndiriliyor: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`);
    const archive = join(dir, asset.name);
    await this.download(asset.url, archive, 400 * 1024 * 1024);
    const sumsFile = join(dir, `SHA256SUMS-${release.version}`);
    await this.download(sums.url, sumsFile, 64 * 1024);

    const expected = readFileSync(sumsFile, 'utf8')
      .split('\n')
      .map((l) => l.trim().split(/\s+\*?/))
      .find(([, name]) => name === asset.name)?.[0];
    const actual = createHash('sha256').update(readFileSync(archive)).digest('hex');
    if (!expected || expected.toLowerCase() !== actual) throw new Error('Paket doğrulanamadı (SHA-256 eşleşmedi). Güncelleme iptal edildi.');
    this.log(job, 'Paket doğrulandı (SHA-256).');

    job.state = 'install';
    await this.run('tar', ['-xzf', archive, '-C', staging, '--strip-components=1'], dir);
    if (!existsSync(join(staging, 'server.mjs')) || !existsSync(join(staging, 'forum.release'))) throw new Error('Paket içeriği beklenen yapıda değil.');
    if (!existsSync(join(staging, 'node_modules'))) {
      this.log(job, 'Bağımlılıklar kuruluyor (npm)…');
      await this.run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], staging);
    }

    this.log(job, 'Dosyalar değiştiriliyor…');
    const previous = join(dir, 'previous');
    rmSync(previous, { recursive: true, force: true });
    mkdirSync(previous, { recursive: true });
    const keep = new Set(['storage', '.env', '.update', 'tmp', 'public']);
    for (const entry of readdirSync(staging)) {
      if (keep.has(entry)) continue;
      const live = join(this.config.root, entry);
      if (existsSync(live)) renameSync(live, join(previous, entry));
      renameSync(join(staging, entry), live);
    }
    writeFileSync(join(dir, 'pending.json'), JSON.stringify({ from: job.from, to: release.version, at: this.clock.now() }));
    rmSync(staging, { recursive: true, force: true });
    rmSync(archive, { force: true });

    job.state = 'restart';
    this.log(job, 'Uygulama yeniden başlatılıyor…');
    await this.setState(JOB_KEY, job);
    this.restartProcess();
  }

  private restartProcess(): void {
    requestRestart(this.config.root);
  }

  private async finishPendingRelease(): Promise<void> {
    const file = join(this.updateDir(), 'pending.json');
    if (!existsSync(file)) return;
    try {
      const p = JSON.parse(readFileSync(file, 'utf8')) as { from: string; to: string };
      const job = await this.state<UpdateJob>(JOB_KEY, { ...EMPTY_JOB });
      const ok = compareVersions(this.config.version, p.to) === 0;
      job.state = ok ? 'done' : 'failed';
      job.finishedAt = this.clock.now();
      job.error = ok ? null : `Beklenen sürüm v${p.to}, çalışan v${this.config.version}.`;
      job.log.push({ at: this.clock.now(), message: ok ? `v${p.to} sürümüne güncellendi.` : (job.error ?? ''), level: ok ? 'info' : 'error' });
      await this.setState(JOB_KEY, job);
      if (ok) for (const id of await this.adminIds()) await this.notifications.notify(id, 'system.updated', { version: p.to });
    } finally {
      rmSync(file, { force: true });
    }
  }

  async rollback(actorId: number): Promise<void> {
    if (this.config.deploy !== 'release') throw Errors.badRequest('Geri alma yalnızca sunucu paketi kurulumlarında buradan yapılır; Docker’da önceki imaj etiketini kurun.');
    const previous = join(this.updateDir(), 'previous');
    if (!existsSync(join(previous, 'server.mjs'))) throw Errors.badRequest('Saklanan önceki sürüm yok.');
    const swap = join(this.updateDir(), `rollback-${Date.now()}`);
    mkdirSync(swap, { recursive: true });
    for (const entry of readdirSync(previous)) {
      const live = join(this.config.root, entry);
      if (existsSync(live)) renameSync(live, join(swap, entry));
      renameSync(join(previous, entry), live);
    }
    rmSync(previous, { recursive: true, force: true });
    renameSync(swap, previous);
    await this.audit.log({ type: 'admin', action: 'updates.rollback', actorId, data: { from: this.config.version } });
    this.restartProcess();
  }

  hasPrevious(): boolean {
    return this.config.deploy === 'release' && existsSync(join(this.updateDir(), 'previous', 'server.mjs'));
  }
}

class UpdaterUnreachable extends Error {
  constructor() {
    super('updater unreachable');
  }
}
