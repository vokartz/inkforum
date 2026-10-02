import { Injectable, Logger } from '@nestjs/common';
import type { PageServerResponse } from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import { CryptoService } from '../security/crypto.service.js';
import { safeFetch } from '../security/safe-fetch.js';
import type { RequestViewer } from '../common/request-context.js';
import { runHandler, type SandboxResult } from './sandbox.js';
import { PageForumApi } from './page-forum-api.js';

type PageRow = Row<'custom_pages'>;

/** Sunucu kodunun gördüğü istek */
export interface PageRequest {
  kind: 'page' | 'api';
  method: string;
  /** Sayfa adresinden sonraki kısım ("/" = sayfanın kendisi) */
  path: string;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

const MAX_FETCHES = 10;
const MAX_KV_KEYS = 5000;
const MAX_KV_VALUE = 64 * 1024;
/** Sunucu kodunun yanıta ekleyebileceği başlıklar */
const SAFE_HEADER = /^(cache-control|content-type|content-language|x-[a-z0-9-]+)$/i;

function parseJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** Joker destekli alan adı eşleşmesi: "*.ornek.com" → "api.ornek.com" (ornek.com'un kendisi değil) */
export function hostAllowed(host: string, patterns: string[]): boolean {
  const h = host.toLowerCase();
  return patterns.some((p) => (p.startsWith('*.') ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : h === p));
}

/**
 * Özel sayfaların sunucu kodunu çalıştırır: istek nesnesini hazırlar, köprüleri (fetch, kv, secrets,
 * token, user) sunucu tarafında denetler ve dönen yanıtı güvenli bir biçime indirger.
 */
@Injectable()
export class PageRuntimeService {
  private readonly logger = new Logger('Pages');

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly crypto: CryptoService,
    private readonly forumApi: PageForumApi,
  ) {}

  /** Sunucu kodu bu sayfada çalışmalı mı (özel kod kapalıyken hiçbiri çalışmaz) */
  active(page: PageRow): boolean {
    return page.server_enabled === 1 && !!page.server_code.trim() && this.settings.get('custom.enabled');
  }

  secrets(page: PageRow): Record<string, string> {
    if (!page.secrets_enc) return {};
    try {
      return JSON.parse(this.crypto.decrypt(page.secrets_enc)) as Record<string, string>;
    } catch {
      return {};
    }
  }

  encryptSecrets(map: Record<string, string>): string {
    return Object.keys(map).length ? this.crypto.encrypt(JSON.stringify(map)) : '';
  }

  async run(
    page: PageRow,
    viewer: RequestViewer,
    req: PageRequest,
    opts: { code?: string; token?: () => string } = {},
  ): Promise<SandboxResult & { response: PageServerResponse | null }> {
    const hosts = parseJson<string[]>(page.allowed_hosts_json, []);
    let fetches = 0;
    const user = await this.forumApi.viewerInfo(viewer);
    const pageInfo = { id: page.id, slug: page.slug, route: page.route, title: page.title, url: page.route ? `/${page.route}` : `/pages/${page.slug}` };

    const result = await runHandler(
      opts.code ?? page.server_code,
      { req: { ...req, user, ip: viewer.ip, page: pageInfo }, secrets: this.secrets(page), __site: this.forumApi.site() },
      {
        ...this.forumApi.bridges(viewer),
        fetch: async (url: unknown, initJson: unknown) => {
          if (++fetches > MAX_FETCHES) throw new Error(`Bir istekte en fazla ${MAX_FETCHES} fetch yapılabilir.`);
          let u: URL;
          try {
            u = new URL(String(url));
          } catch {
            throw new Error(`Geçersiz adres: ${String(url)}`);
          }
          if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Yalnızca http(s) adresleri.');
          if (!hostAllowed(u.host, hosts) && !hostAllowed(u.hostname, hosts)) throw new Error(`${u.host} izinli alan adları listesinde değil (Sunucu → İzinli alan adları).`);
          const init = parseJson<{ method?: string; headers?: Record<string, string>; body?: unknown }>(String(initJson ?? '{}'), {});
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(init.headers ?? {})) if (typeof v === 'string' && !/^(host|content-length|connection)$/i.test(k)) headers[k] = v;
          const body = init.body === undefined || init.body === null ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
          if (body && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type') && typeof init.body !== 'string') headers['content-type'] = 'application/json';
          const res = await safeFetch(u.toString(), { method: (init.method ?? 'GET').toUpperCase(), headers, body, timeoutMs: 8000, maxBytes: 1024 * 1024 });
          return JSON.stringify({ status: res.status, headers: { 'content-type': res.contentType }, body: res.text });
        },
        kvGet: async (key: unknown) => {
          const r = await this.db.q.selectFrom('page_kv').select(['value_json', 'expires_at']).where('page_id', '=', page.id).where('key', '=', String(key)).executeTakeFirst();
          if (!r || (r.expires_at && r.expires_at < this.clock.now())) return null;
          return r.value_json;
        },
        kvSet: async (key: unknown, value: unknown, ttl: unknown) => {
          const k = String(key);
          const v = String(value);
          if (!k || k.length > 200) throw new Error('Anahtar 1–200 karakter olmalı.');
          if (v.length > MAX_KV_VALUE) throw new Error('Değer en fazla 64 KB olabilir.');
          const now = this.clock.now();
          const expires = Number(ttl) > 0 ? now + Number(ttl) * 1000 : null;
          const exists = await this.db.q.selectFrom('page_kv').select('key').where('page_id', '=', page.id).where('key', '=', k).executeTakeFirst();
          if (exists) {
            await this.db.q.updateTable('page_kv').set({ value_json: v, expires_at: expires, updated_at: now }).where('page_id', '=', page.id).where('key', '=', k).execute();
          } else {
            const count = await this.db.q.selectFrom('page_kv').select((eb) => eb.fn.countAll().as('n')).where('page_id', '=', page.id).executeTakeFirst();
            if (Number(count?.n ?? 0) >= MAX_KV_KEYS) throw new Error(`Sayfa başına en fazla ${MAX_KV_KEYS} anahtar saklanabilir.`);
            await this.db.q.insertInto('page_kv').values({ page_id: page.id, key: k, value_json: v, expires_at: expires, updated_at: now }).execute();
          }
        },
        kvDelete: async (key: unknown) => {
          await this.db.q.deleteFrom('page_kv').where('page_id', '=', page.id).where('key', '=', String(key)).execute();
        },
        kvList: async (prefix: unknown) => {
          const p = String(prefix ?? '');
          let q = this.db.q.selectFrom('page_kv').select(['key', 'value_json', 'expires_at']).where('page_id', '=', page.id);
          if (p) q = q.where('key', '>=', p).where('key', '<', `${p}￿`);
          const now = this.clock.now();
          const rows = (await q.orderBy('key').limit(1000).execute()).filter((r) => !r.expires_at || r.expires_at >= now);
          return JSON.stringify(rows.map((r) => ({ key: r.key, value: parseJson(r.value_json, null), expiresAt: r.expires_at })));
        },
        token: () => {
          if (!viewer.user || !opts.token) return '';
          try {
            return opts.token();
          } catch {
            return '';
          }
        },
      },
    );
    if (!result.ok) this.logger.warn(`${pageInfo.url} sunucu kodu hatası: ${result.error}`);
    return { ...result, response: result.ok ? this.normalize(result.value) : null };
  }

  /** handle() dönüşünü güvenli bir yanıta çevirir */
  normalize(v: unknown): PageServerResponse {
    if (v === undefined || v === null) return { type: 'none' };
    const status = (x: unknown, d: number) => (Number.isInteger(x) && (x as number) >= 100 && (x as number) <= 599 ? (x as number) : d);
    const headers = (h: unknown): Record<string, string> => {
      const out: Record<string, string> = {};
      if (h && typeof h === 'object') for (const [k, val] of Object.entries(h)) if (SAFE_HEADER.test(k) && typeof val === 'string' && !/[\r\n]/.test(val)) out[k.toLowerCase()] = val.slice(0, 500);
      return out;
    };
    if (typeof v === 'object' && !Array.isArray(v) && 'type' in v) {
      const r = v as Record<string, unknown>;
      switch (r.type) {
        case 'json':
          return { type: 'json', status: status(r.status, 200), headers: headers(r.headers), body: r.body ?? null };
        case 'text':
        case 'html':
          return { type: r.type, status: status(r.status, 200), headers: headers(r.headers), body: String(r.body ?? '') };
        case 'redirect': {
          const url = String(r.url ?? '');
          // Yalnızca sitenin kendi yolları ya da http(s) adresleri (javascript: vb. değil)
          if (!/^(\/(?!\/)|https?:\/\/)/i.test(url) || /[\r\n]/.test(url)) return { type: 'status', status: 500 };
          const s = status(r.status, 302);
          return { type: 'redirect', status: [301, 302, 303, 307, 308].includes(s) ? s : 302, url };
        }
        case 'status':
          return { type: 'status', status: status(r.status, 200) };
      }
    }
    return { type: 'json', status: 200, headers: {}, body: v };
  }
}
