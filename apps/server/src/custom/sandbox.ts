import { newQuickJSWASMModuleFromVariant, shouldInterruptAfterDeadline, type QuickJSContext, type QuickJSHandle, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-singlefile-mjs-release-sync';

/**
 * Özel sayfaların sunucu kodu için yalıtılmış JavaScript ortamı (QuickJS, WebAssembly).
 *
 * Kod Node.js'e hiç dokunamaz: `require`, `process`, dosya sistemi, ağ yoktur. Dış dünyaya yalnızca
 * burada verilen köprüler açılır (fetch, kv, secrets…); her biri sunucu tarafında denetlenir.
 * Her istek yeni bir çalışma ortamında, bellek, işlemci süresi ve toplam süre sınırıyla çalışır.
 */

export interface SandboxLimits {
  /** İşlemci süresi (ms) — sonsuz döngüleri keser */
  cpuMs: number;
  /** Toplam süre (ms) — bekleyen fetch'ler dahil */
  totalMs: number;
  memoryBytes: number;
}

export const DEFAULT_LIMITS: SandboxLimits = { cpuMs: 1000, totalMs: 10_000, memoryBytes: 32 * 1024 * 1024 };

/** Köprü işlevi: JSON alır, JSON (ya da Promise) döner */
export type Bridge = (...args: unknown[]) => unknown;

export interface SandboxResult {
  ok: boolean;
  /** handle() dönüş değeri (JSON'a çevrilebilir) */
  value?: unknown;
  error?: string;
  logs: string[];
  ms: number;
}

let modulePromise: Promise<QuickJSWASMModule> | null = null;
function quickjs(): Promise<QuickJSWASMModule> {
  modulePromise ??= newQuickJSWASMModuleFromVariant(variant);
  return modulePromise;
}

/** Kodun başına eklenen yardımcılar: yanıt kurucular ve fetch/kv sarmalayıcıları */
const PRELUDE = `
const json = (data, status = 200, headers = {}) => ({ type: 'json', status, headers, body: data });
const text = (body, status = 200, headers = {}) => ({ type: 'text', status, headers, body: String(body) });
const html = (body, status = 200, headers = {}) => ({ type: 'html', status, headers, body: String(body) });
const redirect = (url, status = 302) => ({ type: 'redirect', status, url: String(url) });
const notFound = () => ({ type: 'status', status: 404 });
const forbidden = () => ({ type: 'status', status: 403 });
const fetch = async (url, init = {}) => {
  const r = await __bridge.fetch(String(url), JSON.stringify(init));
  const res = JSON.parse(r);
  return { ...res, ok: res.status >= 200 && res.status < 300, text: async () => res.body, json: async () => JSON.parse(res.body) };
};
const kv = {
  get: async (key) => { const v = await __bridge.kvGet(String(key)); return v === null ? null : JSON.parse(v); },
  set: async (key, value, ttlSeconds) => { await __bridge.kvSet(String(key), JSON.stringify(value === undefined ? null : value), ttlSeconds ?? 0); },
  delete: async (key) => { await __bridge.kvDelete(String(key)); },
  list: async (prefix = '') => JSON.parse(await __bridge.kvList(String(prefix))),
};
const __call = async (name, ...args) => JSON.parse(await __bridge[name](...args));
const forum = {
  site: typeof __site === 'undefined' ? null : __site,
  token: async (audience) => __bridge.token(audience ? String(audience) : ''),
  stats: () => __call('fStats'),
  online: () => __call('fOnline'),
  user: (idOrName) => __call('fUser', typeof idOrName === 'number' ? idOrName : String(idOrName ?? '')),
  members: (opts = {}) => __call('fMembers', JSON.stringify(opts)),
  groups: () => __call('fGroups'),
  groupMembers: (id, limit = 30) => __call('fGroupMembers', Number(id), Number(limit)),
  boards: () => __call('fBoards'),
  topics: (opts = {}) => __call('fTopics', JSON.stringify(opts)),
  topic: (id) => __call('fTopic', Number(id)),
  userTopics: (idOrName, limit = 10) => __call('fUserTopics', typeof idOrName === 'number' ? idOrName : String(idOrName ?? ''), Number(limit)),
  search: (query, opts = {}) => __call('fSearch', String(query ?? ''), JSON.stringify(opts)),
};
const console = { log: (...a) => __bridge.log(a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')) };
console.error = console.log; console.warn = console.log; console.info = console.log;
`;

/**
 * `code` içinde tanımlı `handle(req)` işlevini çalıştırır.
 * `bridges`: fetch, kvGet, kvSet, kvDelete, kvList, token, user (async olabilir); `globals`: req, secrets…
 */
export async function runHandler(code: string, globals: Record<string, unknown>, bridges: Record<string, Bridge>, limits: SandboxLimits = DEFAULT_LIMITS): Promise<SandboxResult> {
  const started = Date.now();
  const logs: string[] = [];
  const QuickJS = await quickjs();
  const rt = QuickJS.newRuntime();
  rt.setMemoryLimit(limits.memoryBytes);
  rt.setMaxStackSize(512 * 1024);
  const ctx = rt.newContext();
  const pending = new Set<Promise<unknown>>();
  let cpuUsed = 0;
  // İşlemci süresi yalnızca kod çalışırken sayılır (bekleyen fetch'ler sayılmaz)
  const runTimed = <T>(fn: () => T): T => {
    const t0 = Date.now();
    rt.setInterruptHandler(shouldInterruptAfterDeadline(t0 + Math.max(10, limits.cpuMs - cpuUsed)));
    try {
      return fn();
    } finally {
      cpuUsed += Date.now() - t0;
    }
  };

  try {
    const bridge = ctx.newObject();
    const all: Record<string, Bridge> = { ...bridges, log: (msg: unknown) => void (logs.length < 200 && logs.push(String(msg).slice(0, 2000))) };
    for (const [name, fn] of Object.entries(all)) {
      const h = ctx.newFunction(name, (...args: QuickJSHandle[]) => {
        const values = args.map((a) => ctx.dump(a));
        let out: unknown;
        try {
          out = fn(...values);
        } catch (err) {
          return { error: ctx.newError(err instanceof Error ? err.message : String(err)) };
        }
        if (out instanceof Promise) {
          const d = ctx.newPromise();
          const p = out.then(
            (v) => {
              if (!ctx.alive) return;
              const vh = toHandle(ctx, v);
              d.resolve(vh);
              vh.dispose();
            },
            (err: unknown) => {
              if (!ctx.alive) return;
              const eh = ctx.newError(err instanceof Error ? err.message : String(err));
              d.reject(eh);
              eh.dispose();
            },
          );
          pending.add(p);
          void p.finally(() => pending.delete(p));
          return d.handle;
        }
        return toHandle(ctx, out);
      });
      ctx.setProp(bridge, name, h);
      h.dispose();
    }
    ctx.setProp(ctx.global, '__bridge', bridge);
    bridge.dispose();
    for (const [name, value] of Object.entries(globals)) {
      const h = toHandle(ctx, value);
      ctx.setProp(ctx.global, name, h);
      h.dispose();
    }

    const evaluated = runTimed(() => ctx.evalCode(`${PRELUDE}\n${code}\n;typeof handle === 'function' ? Promise.resolve(handle(req)) : Promise.reject(new Error('handle(req) işlevi tanımlı değil.'))`, 'page-handler.js'));
    if (evaluated.error) {
      const err = ctx.dump(evaluated.error);
      evaluated.error.dispose();
      return { ok: false, error: describe(err), logs, ms: Date.now() - started };
    }
    const promise = evaluated.value;
    let state = ctx.getPromiseState(promise);
    const deadline = started + limits.totalMs;
    // Bekleyen işler bitene ya da süre dolana kadar VM'in iş kuyruğu çalıştırılır
    while (state.type === 'pending') {
      const jobs = runTimed(() => rt.executePendingJobs());
      if (jobs.error) {
        const err = ctx.dump(jobs.error);
        jobs.error.dispose();
        promise.dispose();
        return { ok: false, error: describe(err), logs, ms: Date.now() - started };
      }
      state = ctx.getPromiseState(promise);
      if (state.type !== 'pending') break;
      if (cpuUsed >= limits.cpuMs) {
        promise.dispose();
        return { ok: false, error: 'İşlemci süresi sınırı aşıldı.', logs, ms: Date.now() - started };
      }
      if (!pending.size) {
        promise.dispose();
        return { ok: false, error: 'handle() hiç sonuçlanmadı (beklenen bir Promise çözülmedi).', logs, ms: Date.now() - started };
      }
      const left = deadline - Date.now();
      if (left <= 0) {
        promise.dispose();
        return { ok: false, error: `Süre sınırı (${limits.totalMs} ms) aşıldı.`, logs, ms: Date.now() - started };
      }
      await Promise.race([Promise.race(pending), new Promise((r) => setTimeout(r, left))]);
    }
    if (state.type === 'rejected') {
      const err = ctx.dump(state.error);
      state.error.dispose();
      promise.dispose();
      return { ok: false, error: describe(err), logs, ms: Date.now() - started };
    }
    const value = ctx.dump(state.value);
    state.value.dispose();
    promise.dispose();
    return { ok: true, value, logs, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), logs, ms: Date.now() - started };
  } finally {
    try {
      ctx.dispose();
      rt.dispose();
    } catch {
      /* bellek sınırında kalan tutamaçlar: çalışma ortamı zaten atılıyor */
    }
  }
}

function toHandle(ctx: QuickJSContext, v: unknown): QuickJSHandle {
  if (v === undefined) return ctx.undefined;
  if (v === null) return ctx.null;
  if (typeof v === 'string') return ctx.newString(v);
  if (typeof v === 'number') return ctx.newNumber(v);
  if (typeof v === 'boolean') return v ? ctx.true : ctx.false;
  // Nesneler kopyalanır (sunucu nesnelerine başvuru sızmaz); JSON'a çevrilemeyenler atlanır
  if (Array.isArray(v)) {
    const arr = ctx.newArray();
    v.forEach((item, i) => {
      const h = toHandle(ctx, item);
      ctx.setProp(arr, i, h);
      h.dispose();
    });
    return arr;
  }
  if (typeof v === 'object') {
    const obj = ctx.newObject();
    for (const [k, item] of Object.entries(v as Record<string, unknown>)) {
      if (typeof item === 'function' || item === undefined) continue;
      const h = toHandle(ctx, item);
      ctx.setProp(obj, k, h);
      h.dispose();
    }
    return obj;
  }
  return ctx.undefined;
}

function describe(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { name?: string; message?: string; stack?: string };
    if (e.message === 'interrupted') return 'İşlemci süresi sınırı aşıldı.';
    const where = /page-handler\.js:(\d+)/.exec(e.stack ?? '')?.[1];
    // Satır numarası kullanıcının kodundaki satıra çevrilir (başa eklenen yardımcılar düşülür)
    const line = where ? Number(where) - PRELUDE.split('\n').length : null;
    return `${e.name ?? 'Error'}: ${e.message ?? String(err)}${line && line > 0 ? ` (satır ${line})` : ''}`;
  }
  return String(err);
}
