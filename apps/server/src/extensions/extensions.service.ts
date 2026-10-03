import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Request, Response } from 'express';
import { sql, type Kysely } from 'kysely';
import {
  EXTENSION_ID,
  EXTENSION_SLOTS,
  ErrorCode,
  clearExtraPermissions,
  registerExtraPermissions,
  renderMarkdown,
  routeReserved,
  versionSatisfies,
  type AdminExtension,
  type AdminExtensionDetail,
  type CspSources,
  type ExtensionAdminMenu,
  type ExtensionAdminPageView,
  type ExtensionCapabilities,
  type ExtensionClientBundle,
  type ExtensionManifest,
  type ExtensionPackagePreview,
  type ExtensionPageView,
  type ExtensionProfileSlots,
  type ExtensionSettingField,
  type ExtensionSlot,
  type ExtensionSlotItem,
  type ExtensionTopicSlots,
  type ExtensionAccountMenuItem,
  type ExtensionRouteOverride,
  type ExtensionsOverview,
  type ExtensionSample,
  type PermissionDefinition,
} from '@forum/shared';
import { migrationHelpers, type Row } from '@forum/db';
import type {
  ExtensionContext,
  ExtensionDefinition,
  ExtensionRequest,
  ExtensionViewer,
  PageResult,
  RouteOptions,
  SchemaHelpers,
  SlotRequest,
} from '@inkforum/sdk';
import { Db } from '../database/db.service.js';
import { Clock, MINUTE } from '../common/clock.js';
import { AppError, Errors } from '../common/errors.js';
import { CONFIG, type AppConfig } from '../config/config.js';
import { can, type RequestViewer } from '../common/request-context.js';
import { SettingsService } from '../settings/settings.service.js';
import { CryptoService } from '../security/crypto.service.js';
import { EventsService, type AppEventName } from '../events/events.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { RateLimitService } from '../security/rate-limit.service.js';
import { InstallService } from '../install/install.service.js';
import { CacheService } from '../cache/cache.service.js';
import { StorageService } from '../storage/storage.service.js';
import { PostRenderService } from '../forum/post-render.service.js';
import { ensureSdkRuntime } from './sdk-runtime.js';
import { SdkBundle } from './sdk-bundle.js';
import { iconNode } from '../common/icons.js';
import { parseManifest, parsePackage, downloadNpm, writeFiles, PackageError, type ParsedPackage } from './package.js';
import {
  compileRoute,
  isExtResponse,
  matchRoute,
  normalizePagePath,
  respond,
  withTimeout,
  ExtHttpError,
  type LoadedExtension,
  type LogEntry,
  type PageEntry,
} from './registry.js';

type ExtRow = Row<'extensions'>;
type SlotContext = Partial<Pick<SlotRequest, 'profile' | 'board' | 'topic' | 'post'>>;

const NO_OVERRIDE = new Set(['admin', 'api', 'install', 'ext', 'ext-assets', 'uploads', 'emoji', '_app', 'login', 'logout', 'register', 'oauth', 'reset-password', 'forgot-password', 'change-password', 'confirm-email', 'verify-email', 'banned', 'settings', 'brand', 'health', 'favicon.ico', 'robots.txt', 'manifest.webmanifest']);

const MAX_LOGS = 300;
const SLOT_TIMEOUT = 2000;
const RENDER_TIMEOUT = 15_000;
const SETUP_TIMEOUT = 30_000;
const SECRET_MASK = '••••••••';
const ENC = '__enc';

const STATUS_CODES: Record<number, (typeof ErrorCode)[keyof typeof ErrorCode]> = {
  400: ErrorCode.VALIDATION,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  422: ErrorCode.VALIDATION,
  429: ErrorCode.RATE_LIMITED,
};

function parse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

const assetUrl = (id: string, file: string) => `/ext-assets/${id}/${file.replace(/^\/+/, '').replace(/^public\//, '')}`;
const SAFE_ASSET = /^(?!.*\.\.)[a-zA-Z0-9._/-]{1,200}$/;

@Injectable()
export class ExtensionsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Extensions');
  private readonly loaded = new Map<string, LoadedExtension>();
  private readonly logs = new Map<string, LogEntry[]>();
  private readonly settingValues = new Map<string, Record<string, unknown>>();
  private loadSeq = 0;
  readonly root: string;
  readonly dataRoot: string;
  private readonly incoming: string;
  readonly sdk: SdkBundle;
  private readonly backups: string;

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly events: EventsService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
    private readonly groups: GroupCacheService,
    private readonly rateLimit: RateLimitService,
    private readonly install: InstallService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
    private readonly render: PostRenderService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {
    this.root = join(config.storageDir, 'extensions');
    this.dataRoot = join(config.storageDir, 'extension-data');
    this.incoming = join(this.root, '.incoming');
    this.backups = join(this.root, '.backup');
    this.sdk = new SdkBundle(config.root);
  }

  get safeMode(): boolean {
    return process.env.INKFORUM_SAFE_MODE === '1' || existsSync(join(this.root, '.safemode'));
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.install.installed) return;
    try {
      await this.loadAll();
    } catch (e) {
      this.logger.error(`Eklentiler yüklenemedi: ${e instanceof Error ? e.stack : String(e)}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    for (const id of [...this.loaded.keys()]) await this.unload(id).catch(() => undefined);
  }

  private rows(): Promise<ExtRow[]> {
    return this.db.q.selectFrom('extensions').selectAll().orderBy('name').execute();
  }

  private row(id: string): Promise<ExtRow | undefined> {
    return this.db.q.selectFrom('extensions').selectAll().where('id', '=', id).executeTakeFirst();
  }

  private dirOf(id: string): string {
    return join(this.root, id);
  }

  private readManifest(dir: string): ExtensionManifest | null {
    const files = new Map<string, Buffer>();
    for (const f of ['inkforum.json', 'package.json']) {
      const p = join(dir, f);
      if (existsSync(p)) files.set(f, readFileSync(p));
    }
    if (!files.size) return null;
    return parseManifest(files).manifest;
  }

  async loadAll(): Promise<void> {
    mkdirSync(this.root, { recursive: true });
    ensureSdkRuntime(this.root, this.config.version);
    await this.scan();
    if (this.safeMode) {
      this.logger.warn('Eklenti güvenli modu açık: hiçbir eklenti yüklenmedi.');
      return;
    }
    for (const r of await this.rows()) if (r.is_enabled === 1) await this.load(r.id);
  }

  async scan(): Promise<string[]> {
    if (!existsSync(this.root)) return [];
    const known = new Set((await this.rows()).map((r) => r.id));
    const found: string[] = [];
    for (const name of readdirSync(this.root)) {
      if (name.startsWith('.') || known.has(name) || !EXTENSION_ID.test(name)) continue;
      const dir = this.dirOf(name);
      try {
        if (!statSync(dir).isDirectory()) continue;
        const manifest = this.readManifest(dir);
        if (!manifest) continue;
        if (manifest.id !== name) {
          this.logger.warn(`"${name}" klasöründeki eklentinin kimliği "${manifest.id}"; klasör adı kimlikle aynı olmalı.`);
          continue;
        }
        const now = this.clock.now();
        await this.db.q
          .insertInto('extensions')
          .values({ id: manifest.id, name: manifest.name, version: manifest.version, is_enabled: 0, source: 'local', package_name: null, manifest_json: JSON.stringify(manifest), installed_by: null, installed_at: now, updated_at: now })
          .execute();
        found.push(manifest.id);
      } catch (e) {
        this.logger.warn(`"${name}" klasöründeki eklenti okunamadı: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return found;
  }

  async load(id: string): Promise<void> {
    if (this.loaded.has(id)) await this.unload(id);
    const row = await this.row(id);
    if (!row) throw Errors.notFound('Eklenti bulunamadı.');
    const dir = this.dirOf(id);
    let ext: LoadedExtension | null = null;
    try {
      ensureSdkRuntime(this.root, this.config.version);
      if (!existsSync(dir)) throw new Error(`Eklenti klasörü bulunamadı: storage/extensions/${id}`);
      const manifest = this.readManifest(dir) ?? parse<ExtensionManifest>(row.manifest_json, null as never);
      if (!manifest) throw new Error('inkforum.json okunamadı.');
      if (!versionSatisfies(this.config.version, manifest.inkforum)) {
        throw new Error(`Bu eklenti InkForum ${manifest.inkforum} gerektiriyor (kurulu sürüm ${this.config.version}).`);
      }
      if (manifest.version !== row.version || JSON.stringify(manifest) !== row.manifest_json) {
        await this.db.q
          .updateTable('extensions')
          .set({ name: manifest.name, version: manifest.version, manifest_json: JSON.stringify(manifest), updated_at: this.clock.now() })
          .where('id', '=', id)
          .execute();
      }
      this.settingValues.set(id, parse<Record<string, unknown>>(row.settings_json, {}));

      let def: ExtensionDefinition | null = null;
      if (manifest.server) {
        const entry = normalize(join(dir, manifest.server));
        if (!entry.startsWith(normalize(dir) + sep)) throw new Error('Geçersiz sunucu dosyası yolu.');
        const mod = (await import(`${pathToFileURL(entry).href}?v=${row.updated_at}-${++this.loadSeq}`)) as { default?: unknown };
        const exported = (mod.default ?? mod) as unknown;
        def = typeof exported === 'function' ? { setup: exported as ExtensionDefinition['setup'] } : (exported as ExtensionDefinition);
        if (!def || typeof def.setup !== 'function') throw new Error(`${manifest.server} bir eklenti tanımı dışa aktarmıyor (export default defineExtension({ setup(ctx) {…} })).`);
      }

      ext = {
        id,
        manifest,
        dir,
        def,
        ctx: null as unknown as ExtensionContext,
        routes: [],
        pages: [],
        adminPages: new Map(),
        accountPages: new Map(),
        slots: [],
        events: [],
        jobTypes: [],
        tasks: [],
        teardowns: [],
        settingsListeners: [],
      };
      ext.ctx = this.createContext(ext);

      const perms: PermissionDefinition[] = manifest.permissions.map((p) => ({
        key: `ext.${id}.${p.key}`,
        scope: 'global',
        category: 'extensions',
        label: `${manifest.name}: ${p.label}`,
        description: p.description,
        defaults: p.defaults,
        guestGrantable: p.guestGrantable,
        dangerous: p.dangerous,
      }));
      registerExtraPermissions(id, perms);
      await this.applyPermissionDefaults(id, perms);

      if (def?.migrations) await this.migrate(ext, def.migrations);
      if (def) await withTimeout(Promise.resolve(def.setup(ext.ctx)), SETUP_TIMEOUT, 'setup()');

      this.loaded.set(id, ext);
      if (row.error) await this.db.q.updateTable('extensions').set({ error: null }).where('id', '=', id).execute();
      this.log(id, 'info', `Yüklendi (v${manifest.version}).`);
      await this.changed();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.log(id, 'error', `Yüklenemedi: ${e instanceof Error && e.stack ? e.stack : message}`);
      if (ext) await this.teardown(ext).catch(() => undefined);
      clearExtraPermissions(id);
      await this.db.q.updateTable('extensions').set({ error: message.slice(0, 2000) }).where('id', '=', id).execute();
      await this.changed();
      throw Errors.code(ErrorCode.INTERNAL, `"${row.name}" eklentisi yüklenemedi: ${message}`, 500);
    }
  }

  private async teardown(ext: LoadedExtension): Promise<void> {
    try {
      if (ext.def?.teardown) await withTimeout(Promise.resolve(ext.def.teardown(ext.ctx)), 10_000, 'teardown()');
    } catch (e) {
      this.log(ext.id, 'warn', `teardown() hata verdi: ${String(e)}`);
    }
    for (const fn of ext.teardowns.splice(0)) {
      try {
        await fn();
      } catch (e) {
        this.log(ext.id, 'warn', `Temizlik işlevi hata verdi: ${String(e)}`);
      }
    }
    for (const e of ext.events) this.events.off(e.name as AppEventName, e.handler as never);
    for (const t of ext.jobTypes) this.jobs.unregister(t);
    for (const t of ext.tasks) this.jobs.unschedule(t);
    ext.routes.length = 0;
    ext.pages.length = 0;
    ext.slots.length = 0;
    ext.adminPages.clear();
    ext.accountPages.clear();
  }

  async unload(id: string): Promise<void> {
    const ext = this.loaded.get(id);
    if (!ext) return;
    this.loaded.delete(id);
    await this.teardown(ext);
    clearExtraPermissions(id);
    this.log(id, 'info', 'Kapatıldı.');
    await this.changed();
  }

  private async changed(): Promise<void> {
    await this.permissions.invalidate();
    await this.cache.invalidate('appearance');
  }

  private async applyPermissionDefaults(id: string, perms: PermissionDefinition[]): Promise<void> {
    if (!perms.length) return;
    const key = `ext-permissions:${id}`;
    const state = await this.db.q.selectFrom('system_state').select('value').where('key', '=', key).executeTakeFirst();
    const applied = new Set(parse<string[]>(state?.value, []));
    const pending = perms.filter((p) => !applied.has(p.key));
    if (!pending.length) return;
    const groups = await this.groups.all();
    await this.db.tx(async () => {
      for (const p of pending) {
        for (const [sys, value] of Object.entries(p.defaults)) {
          const g = groups.find((x) => x.system_key === sys);
          if (!g || !value) continue;
          await this.db.q
            .insertInto('group_permissions')
            .values({ group_id: g.id, permission: p.key, value })
            .onConflict((oc) => oc.columns(['group_id', 'permission']).doNothing())
            .execute();
        }
        applied.add(p.key);
      }
      const value = JSON.stringify([...applied]);
      await this.db.q
        .insertInto('system_state')
        .values({ key, value, updated_at: this.clock.now() })
        .onConflict((oc) => oc.column('key').doUpdateSet({ value, updated_at: this.clock.now() }))
        .execute();
    });
  }

  private schemaHelpers(db: Kysely<any>): SchemaHelpers {
    const h = migrationHelpers.helpers(db);
    return {
      sqlite: h.sqlite,
      table: h.table,
      plainTable: h.plainTable,
      notNull: migrationHelpers.notNull,
      flag: migrationHelpers.flag,
      intDefault: migrationHelpers.intDefault,
      textDefault: migrationHelpers.textDefault,
      ref: migrationHelpers.ref,
    };
  }

  private async migrate(ext: LoadedExtension, migrations: NonNullable<ExtensionDefinition['migrations']>): Promise<void> {
    const done = new Set(
      (await this.db.q.selectFrom('extension_migrations').select('name').where('ext_id', '=', ext.id).execute()).map((r) => r.name),
    );
    for (const name of Object.keys(migrations).sort()) {
      if (done.has(name)) continue;
      const m = migrations[name]!;
      if (typeof m?.up !== 'function') throw new Error(`Migration "${name}" up() içermiyor.`);
      await this.db.tx(async () => {
        const q = this.db.q as unknown as Kysely<any>;
        await m.up(q, this.schemaHelpers(q));
        await this.db.q.insertInto('extension_migrations').values({ ext_id: ext.id, name, applied_at: this.clock.now() }).execute();
      });
      this.log(ext.id, 'info', `Migration uygulandı: ${name}`);
    }
  }

  log(id: string, level: LogEntry['level'], message: string): void {
    const list = this.logs.get(id) ?? [];
    list.push({ at: this.clock.now(), level, message: message.slice(0, 4000) });
    if (list.length > MAX_LOGS) list.splice(0, list.length - MAX_LOGS);
    this.logs.set(id, list);
    const line = `[${id}] ${message}`;
    if (level === 'error') this.logger.error(line);
    else if (level === 'warn') this.logger.warn(line);
    else this.logger.log(line);
  }

  private fields(ext: { manifest: ExtensionManifest }): ExtensionSettingField[] {
    return ext.manifest.settings;
  }

  private settingValue(id: string, field: ExtensionSettingField): unknown {
    const stored = this.settingValues.get(id)?.[field.key];
    if (stored === undefined) return field.default ?? (field.type === 'boolean' ? false : field.type === 'number' ? 0 : field.type === 'groups' ? [] : '');
    if (field.type === 'secret' && stored && typeof stored === 'object' && ENC in (stored as object)) {
      try {
        return this.crypto.decrypt(String((stored as Record<string, unknown>)[ENC]));
      } catch {
        return '';
      }
    }
    return stored;
  }

  private allSettings(ext: { id: string; manifest: ExtensionManifest }): Record<string, unknown> {
    return Object.fromEntries(this.fields(ext).map((f) => [f.key, this.settingValue(ext.id, f)]));
  }

  private permKey(ext: { id: string }, p: string): string {
    return p.includes('.') ? p : `ext.${ext.id}.${p}`;
  }

  private createContext(ext: LoadedExtension): ExtensionContext {
    const id = ext.id;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const svc = this;
    const dataDir = join(this.dataRoot, id);
    mkdirSync(dataDir, { recursive: true });
    const route = (method: string) => (path: string, handler: ExtensionRequestHandler, opts: RouteOptions = {}) => {
      if (typeof handler !== 'function') throw new Error(`${method} ${path}: işleyici bir işlev olmalı.`);
      const c = compileRoute(path);
      ext.routes.push({ method, path: c.path, re: c.re, keys: c.keys, handler, opts });
    };
    const ctx: ExtensionContext = {
      id,
      manifest: { id, name: ext.manifest.name, version: ext.manifest.version, description: ext.manifest.description, author: ext.manifest.author, homepage: ext.manifest.homepage },
      coreVersion: this.config.version,
      appUrl: this.config.appUrl,
      dir: ext.dir,
      dataDir,
      log: {
        info: (m, ...a) => svc.log(id, 'info', [m, ...a.map(String)].join(' ')),
        warn: (m, ...a) => svc.log(id, 'warn', [m, ...a.map(String)].join(' ')),
        error: (m, ...a) => svc.log(id, 'error', [m, ...a.map((x) => (x instanceof Error ? (x.stack ?? x.message) : String(x)))].join(' ')),
      },
      get db() {
        return svc.db.q as unknown as Kysely<any>;
      },
      sql,
      tx: (fn) => svc.db.tx(fn),
      table: (name) => `ext_${id.replace(/-/g, '_')}_${name}`,
      settings: {
        get: <T>(key: string) => {
          const f = svc.fields(ext).find((x) => x.key === key);
          return (f ? svc.settingValue(id, f) : svc.settingValues.get(id)?.[key]) as T;
        },
        all: () => svc.allSettings(ext),
        set: async (key, value) => {
          await svc.saveSettings(id, { [key]: value }, null, false);
        },
        onChange: (fn) => void ext.settingsListeners.push(fn),
      },
      kv: {
        get: async <T>(key: string) => {
          const r = await svc.db.q.selectFrom('extension_kv').select(['value_json', 'expires_at']).where('ext_id', '=', id).where('key', '=', key).executeTakeFirst();
          if (!r || (r.expires_at && r.expires_at < svc.clock.now())) return null;
          return parse<T | null>(r.value_json, null);
        },
        set: async (key, value, ttlSeconds) => {
          const now = svc.clock.now();
          const values = { value_json: JSON.stringify(value ?? null), expires_at: ttlSeconds ? now + ttlSeconds * 1000 : null, updated_at: now };
          await svc.db.q
            .insertInto('extension_kv')
            .values({ ext_id: id, key: String(key).slice(0, 200), ...values })
            .onConflict((oc) => oc.columns(['ext_id', 'key']).doUpdateSet(values))
            .execute();
        },
        delete: async (key) => {
          await svc.db.q.deleteFrom('extension_kv').where('ext_id', '=', id).where('key', '=', key).execute();
        },
        list: async <T>(prefix = '') => {
          let q = svc.db.q.selectFrom('extension_kv').select(['key', 'value_json', 'expires_at']).where('ext_id', '=', id);
          if (prefix) q = q.where('key', '>=', prefix).where('key', '<', `${prefix}￿`);
          const now = svc.clock.now();
          return (await q.orderBy('key').limit(5000).execute())
            .filter((r) => !r.expires_at || r.expires_at >= now)
            .map((r) => ({ key: r.key, value: parse<T>(r.value_json, null as T), expiresAt: r.expires_at }));
        },
      },
      routes: {
        get: route('GET'),
        post: route('POST'),
        put: route('PUT'),
        patch: route('PATCH'),
        delete: route('DELETE'),
        all: route('ALL'),
      },
      pages: {
        add: (page) => {
          if (typeof page?.render !== 'function') throw new Error('pages.add: render() gerekli.');
          const { base, wildcard } = normalizePagePath(page.path);
          const core = base === '' || routeReserved(base);
          if (core && !page.override) throw new Error(`"/${base}" forumun kendi adresi; başka bir adres seçin ya da yerine geçmek için override: true verin.`);
          if (page.override && NO_OVERRIDE.has(base.split('/')[0] ?? '')) throw new Error(`"/${base}" adresinin yerine geçilemez (yönetim, giriş ve sistem adresleri).`);
          for (const other of svc.loaded.values())
            if (other.id !== id && other.pages.some((p) => p.base === base)) throw new Error(`"/${base}" adresi "${other.manifest.name}" eklentisinde kullanılıyor.`);
          ext.pages.push({ def: page, base, wildcard, override: !!page.override && core });
        },
      },
      admin: {
        page: (page) => {
          if (!/^[a-z0-9-]{1,40}$/.test(page?.key ?? '')) throw new Error('admin.page: key küçük harf, rakam ve - olmalı.');
          if (typeof page.render !== 'function') throw new Error('admin.page: render() gerekli.');
          ext.adminPages.set(page.key, page);
        },
      },
      account: {
        page: (page) => {
          if (!/^[a-z0-9-]{1,40}$/.test(page?.key ?? '')) throw new Error('account.page: key küçük harf, rakam ve - olmalı.');
          if (typeof page.render !== 'function') throw new Error('account.page: render() gerekli.');
          ext.accountPages.set(page.key, page);
        },
      },
      slots: {
        add: (slot, def) => {
          if (!(EXTENSION_SLOTS as readonly string[]).includes(slot)) throw new Error(`Bilinmeyen yer: ${slot}`);
          if (typeof def?.render !== 'function') throw new Error('slots.add: render() gerekli.');
          ext.slots.push({ slot: slot as ExtensionSlot, def, key: def.key ?? `${slot}-${ext.slots.length}` });
        },
      },
      events: {
        on: (name, handler) => {
          const wrapped = async (payload: unknown) => {
            try {
              await handler(payload as never);
            } catch (e) {
              svc.log(id, 'error', `"${name}" olayı işlenirken hata: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
            }
          };
          svc.events.on(name as AppEventName, wrapped as never);
          ext.events.push({ name, handler: wrapped });
        },
      },
      jobs: {
        register: (type, handler) => {
          const full = `ext:${id}:${type}`;
          svc.jobs.register(full, handler as (p: unknown) => Promise<void>);
          ext.jobTypes.push(full);
        },
        enqueue: (type, payload, opts) => svc.jobs.enqueue(`ext:${id}:${type}`, payload, opts),
        schedule: (name, intervalMs, handler) => {
          const full = `ext:${id}:${name}`;
          svc.jobs.schedule(full, Math.max(MINUTE, intervalMs), async () => {
            try {
              await handler();
            } catch (e) {
              svc.log(id, 'error', `"${name}" görevi hata verdi: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
              throw e;
            }
          });
          ext.tasks.push(full);
        },
      },
      forum: this.forumApi(id),
      http: {
        json: (body, status = 200, headers) => respond('json', body, status, headers),
        html: (body, status = 200, headers) => respond('html', String(body), status, headers),
        text: (body, status = 200, headers) => respond('text', String(body), status, headers),
        redirect: (url, status = 302) => respond('redirect', url, status),
        empty: () => respond('empty', null, 204),
        error: (status, message, code) => new ExtHttpError(status, message, code),
      },
      onTeardown: (fn) => void ext.teardowns.push(fn),
    };
    return ctx;
  }

  private forumApi(id: string): ExtensionContext['forum'] {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const svc = this;
    const groupIdsOf = async (userId: number, primary: number | null, post: number | null) => {
      const now = svc.clock.now();
      const extra = await svc.db.q
        .selectFrom('group_members')
        .select('group_id')
        .where('user_id', '=', userId)
        .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]))
        .execute();
      return [...new Set([...(primary ? [primary] : []), ...(post ? [post] : []), ...extra.map((r) => r.group_id)])];
    };
    return {
      async user(idOrName) {
        let q = svc.db.q.selectFrom('users').leftJoin('files', 'files.id', 'users.avatar_file_id').selectAll('users').select('files.path as avatar_path').where('users.deleted_at', 'is', null);
        q = typeof idOrName === 'number' ? q.where('users.id', '=', idOrName) : q.where('users.username_canonical', '=', String(idOrName).trim().toLowerCase());
        const u = await q.executeTakeFirst();
        if (!u) return null;
        return {
          id: u.id,
          username: u.username,
          displayName: u.display_name,
          avatarUrl: svc.storage.publicUrl(u.avatar_path ? { path: u.avatar_path } : null),
          email: u.email,
          emailVerified: u.email_verified_at != null,
          status: u.status,
          primaryGroupId: u.primary_group_id,
          groupIds: await groupIdsOf(u.id, u.primary_group_id, u.post_group_id),
          postCount: u.post_count,
          createdAt: u.created_at,
          lastSeenAt: u.last_active_at ?? null,
        };
      },
      async groups() {
        return (await svc.groups.all()).map((g) => ({ id: g.id, name: g.name, systemKey: g.system_key, color: g.color ?? null }));
      },
      async addToGroup(userId, groupId, opts) {
        const g = await svc.groups.get(groupId);
        if (!g || g.system_key === 'guest' || g.system_key === 'member') throw new Error('Bu gruba üye eklenemez.');
        await svc.db.q
          .insertInto('group_members')
          .values({ user_id: userId, group_id: groupId, source: 'manual', added_by: null, added_at: svc.clock.now(), expires_at: opts?.expiresAt ?? null })
          .onConflict((oc) => oc.columns(['user_id', 'group_id']).doUpdateSet({ expires_at: opts?.expiresAt ?? null }))
          .execute();
        svc.events.emit('user.groupsChanged', { userId });
      },
      async removeFromGroup(userId, groupId) {
        await svc.db.q.deleteFrom('group_members').where('user_id', '=', userId).where('group_id', '=', groupId).execute();
        svc.events.emit('user.groupsChanged', { userId });
      },
      async notify(userId, message, opts) {
        await svc.notifications.notify(userId, 'system.message', { message: String(message).slice(0, 500), url: opts?.url ?? null, ext: id });
      },
      async mail(to, subject, body) {
        await svc.mail.send(to, { subject, html: body.html, text: body.text ?? body.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
      },
      async audit(action, data, actorId) {
        await svc.audit.log({ type: 'admin', action: `ext.${id}.${action}`, actorId: actorId ?? null, data: data ?? null });
      },
      setting<T>(key: string) {
        return (svc.settings.publicSettings() as Record<string, unknown>)[key] as T | undefined;
      },
      renderBBCode: (source) => svc.render.post(String(source ?? '')).html,
      encrypt: (value) => svc.crypto.encrypt(value),
      decrypt: (value) => {
        try {
          return svc.crypto.decrypt(value);
        } catch {
          return null;
        }
      },
    };
  }

  private toViewer(ext: { id: string }, v: RequestViewer): ExtensionViewer {
    const u = v.user;
    return {
      id: u?.id ?? 0,
      username: u?.username ?? null,
      displayName: u?.display_name ?? null,
      avatarUrl: null,
      isGuest: !u,
      isAdmin: v.isAdmin,
      groupIds: v.groupIds,
      primaryGroupId: u?.primary_group_id ?? null,
      email: u?.email ?? null,
      emailVerified: !!u?.email_verified_at,
      locale: v.locale ?? 'tr',
      can: (p: string) => can(v, this.permKey(ext, p)),
    };
  }

  private toRequest(ext: LoadedExtension, v: RequestViewer, init: { req?: Request; res?: Response; method: string; path: string; params?: Record<string, string>; query?: Record<string, string>; body?: unknown }): ExtensionRequest {
    const headers: Record<string, string> = {};
    if (init.req) for (const [k, val] of Object.entries(init.req.headers)) if (typeof val === 'string' && k !== 'cookie' && k !== 'authorization') headers[k] = val;
    return {
      method: init.method,
      path: init.path,
      params: init.params ?? {},
      query: init.query ?? {},
      body: init.body ?? null,
      headers,
      ip: v.ip,
      viewer: this.toViewer(ext, v),
      raw: { req: init.req, res: init.res },
    };
  }

  private checkAccess(ext: LoadedExtension, v: RequestViewer, opts: { auth?: boolean; permission?: string | string[]; admin?: boolean }): void {
    if ((opts.auth || opts.admin) && !v.user) throw Errors.unauthenticated();
    if (opts.admin) {
      if (!can(v, 'admin.access')) throw Errors.forbidden();
      if (!v.token && (v.session?.elevated_until ?? 0) <= this.clock.now()) throw Errors.code(ErrorCode.ELEVATION_REQUIRED, 'Bu işlem için şifrenizi yeniden girmeniz gerekiyor.', 403);
    }
    const perms = opts.permission ? (Array.isArray(opts.permission) ? opts.permission : [opts.permission]) : [];
    for (const p of perms) if (!can(v, this.permKey(ext, p))) throw v.user ? Errors.forbidden() : Errors.unauthenticated();
  }

  private toAppError(ext: LoadedExtension, e: unknown, what: string): Error {
    if (e instanceof ExtHttpError) return Errors.code(STATUS_CODES[e.status] ?? ErrorCode.INTERNAL, e.message, e.status >= 400 && e.status < 600 ? e.status : 500);
    if (e instanceof AppError) return e;
    this.log(ext.id, 'error', `${what}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    return Errors.code(ErrorCode.INTERNAL, `"${ext.manifest.name}" eklentisi bir hata verdi.`, 500);
  }

  async dispatch(id: string, rest: string, req: Request, res: Response, v: RequestViewer): Promise<void> {
    const ext = this.loaded.get(id);
    if (!ext) throw Errors.notFound('Eklenti bulunamadı ya da kapalı.');
    const path = `/${rest.replace(/^\/+/, '')}`;
    const method = req.method.toUpperCase() === 'HEAD' ? 'GET' : req.method.toUpperCase();
    let allowed = false;
    for (const r of ext.routes) {
      const params = matchRoute(r, path);
      if (!params) continue;
      allowed = true;
      if (r.method !== 'ALL' && r.method !== method) continue;
      this.checkAccess(ext, v, r.opts);
      if (r.opts.rateLimit) {
        const who = r.opts.rateLimit.by === 'user' && v.user ? `u${v.user.id}` : `ip${v.ip ?? '?'}`;
        this.rateLimit.hit(`ext:${id}:${r.method}:${r.path}:${who}`, r.opts.rateLimit.limit, r.opts.rateLimit.windowMs ?? MINUTE);
      }
      const query: Record<string, string> = {};
      for (const [k, val] of Object.entries(req.query ?? {})) {
        const x = Array.isArray(val) ? val[0] : val;
        if (typeof x === 'string') query[k] = x;
      }
      let result: unknown;
      try {
        result = await r.handler(this.toRequest(ext, v, { req, res, method, path, params, query, body: req.body }));
      } catch (e) {
        throw this.toAppError(ext, e, `${method} ${path}`);
      }
      if (res.headersSent) return;
      this.send(res, result);
      return;
    }
    if (allowed) throw Errors.code(ErrorCode.NOT_FOUND, 'Bu yöntem desteklenmiyor.', 405);
    throw Errors.notFound('Uç nokta bulunamadı.');
  }

  private send(res: Response, out: unknown): void {
    if (out === undefined) return void res.status(204).end();
    if (!isExtResponse(out)) return void res.status(200).json(out);
    for (const [k, val] of Object.entries(out.headers)) if (!/^(set-cookie|content-security-policy)$/i.test(k)) res.setHeader(k, val);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    switch (out.kind) {
      case 'redirect':
        return res.redirect(out.status, String(out.body));
      case 'empty':
        return void res.status(204).end();
      case 'json':
        return void res.status(out.status).json(out.body);
      case 'html':
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src * data:; style-src 'unsafe-inline'; font-src *; form-action 'self'");
        if (!res.getHeader('content-type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return void res.status(out.status).send(String(out.body));
      default:
        if (!res.getHeader('content-type')) res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return void res.status(out.status).send(String(out.body));
    }
  }

  private files(ext: LoadedExtension, list: string[] | undefined): string[] {
    return (list ?? []).filter((f) => typeof f === 'string' && SAFE_ASSET.test(f.replace(/^public\//, ''))).map((f) => assetUrl(ext.id, f));
  }

  findPage(path: string): { ext: LoadedExtension; page: PageEntry; rest: string } | null {
    const clean = path.replace(/^\/+|\/+$/g, '').toLowerCase();
    let best: { ext: LoadedExtension; page: PageEntry; rest: string } | null = null;
    for (const ext of this.loaded.values()) {
      for (const page of ext.pages) {
        const exact = clean === page.base;
        const under = page.wildcard && (page.base === '' ? clean !== '' : clean.startsWith(`${page.base}/`));
        if (!exact && !under) continue;
        if (best && best.page.base.length >= page.base.length) continue;
        best = { ext, page, rest: exact ? '' : page.base === '' ? clean : clean.slice(page.base.length + 1) };
      }
    }
    return best;
  }

  async renderPage(v: RequestViewer, path: string, query: Record<string, string>): Promise<ExtensionPageView | { redirect: string; status: number } | null> {
    const hit = this.findPage(path);
    if (!hit) return null;
    const { ext, page, rest } = hit;
    if (page.def.auth && !v.user) return { redirect: `/login?next=${encodeURIComponent(`/${path.replace(/^\/+/, '')}`)}`, status: 302 };
    this.checkAccess(ext, v, { permission: page.def.permission });
    let out: PageResult;
    try {
      out = (await withTimeout(Promise.resolve(page.def.render(this.toRequest(ext, v, { method: 'GET', path: `/${rest}`, params: { rest }, query }))), RENDER_TIMEOUT, 'render()')) ?? {};
    } catch (e) {
      throw this.toAppError(ext, e, `Sayfa /${page.base}`);
    }
    if (out.redirect) return { redirect: out.redirect, status: 302 };
    if (out.status === 404) throw Errors.notFound('Sayfa bulunamadı.');
    if (out.status === 403) throw Errors.forbidden('Bu sayfayı görme yetkin yok.');
    return {
      kind: 'extension',
      ext: ext.id,
      extName: ext.manifest.name,
      path: `/${page.base}${rest ? `/${rest}` : ''}`,
      title: out.title ?? page.def.title,
      html: String(out.html ?? ''),
      layout: page.def.layout ?? 'default',
      showTitle: page.def.showTitle ?? true,
      description: out.description ?? null,
      scripts: this.files(ext, out.scripts),
      styles: this.files(ext, out.styles),
      data: out.data ?? null,
    };
  }

  async renderAdminPage(v: RequestViewer, id: string, key: string, query: Record<string, string>): Promise<ExtensionAdminPageView> {
    const ext = this.loaded.get(id);
    const page = ext?.adminPages.get(key);
    if (!ext || !page) throw Errors.notFound('Sayfa bulunamadı.');
    this.checkAccess(ext, v, { permission: page.permission });
    let out: PageResult;
    try {
      out = (await withTimeout(Promise.resolve(page.render(this.toRequest(ext, v, { method: 'GET', path: '/', query }))), RENDER_TIMEOUT, 'render()')) ?? {};
    } catch (e) {
      throw this.toAppError(ext, e, `Yönetim sayfası ${key}`);
    }
    return { ext: ext.id, extName: ext.manifest.name, key, title: out.title ?? page.title, html: String(out.html ?? ''), scripts: this.files(ext, out.scripts), styles: this.files(ext, out.styles), data: out.data ?? null };
  }

  private async renderSlots(v: RequestViewer, slots: ExtensionSlot[], context: SlotContext = {}): Promise<Partial<Record<ExtensionSlot, ExtensionSlotItem[]>>> {
    const out: Partial<Record<ExtensionSlot, ExtensionSlotItem[]>> = {};
    const jobs: Array<Promise<void>> = [];
    for (const ext of this.loaded.values()) {
      for (const s of ext.slots) {
        if (!slots.includes(s.slot)) continue;
        jobs.push(
          (async () => {
            try {
              const req: SlotRequest = { ...this.toRequest(ext, v, { method: 'GET', path: '/' }), profile: null, board: null, topic: null, post: null, ...context };
              const r = await withTimeout(Promise.resolve(s.def.render(req)), SLOT_TIMEOUT, `${s.slot} yeri`);
              if (r === null || r === undefined || r === '') return;
              const item: ExtensionSlotItem =
                typeof r === 'object' && !(r instanceof String)
                  ? { ext: ext.id, key: s.key, title: r.title ?? s.def.title ?? null, html: String(r.html ?? ''), scripts: this.files(ext, r.scripts) }
                  : { ext: ext.id, key: s.key, title: s.def.title ?? null, html: String(r), scripts: [] };
              (out[s.slot] ??= []).push(item);
            } catch (e) {
              this.log(ext.id, 'error', `${s.slot} yeri çizilemedi: ${e instanceof Error ? e.message : String(e)}`);
            }
          })(),
        );
      }
    }
    await Promise.all(jobs);
    return out;
  }

  async clientBundle(v: RequestViewer): Promise<ExtensionClientBundle> {
    const csp: CspSources = { script: [], connect: [], style: [], font: [], frame: [], img: [] };
    const bundle: ExtensionClientBundle = { scripts: [], styles: [], slots: {}, settings: {}, csp };
    if (!this.loaded.size) return bundle;
    for (const ext of this.loaded.values()) {
      for (const s of ext.manifest.client.scripts) bundle.scripts.push({ ext: ext.id, src: assetUrl(ext.id, s) });
      for (const s of ext.manifest.client.styles) bundle.styles.push(assetUrl(ext.id, s));
      const pub = this.fields(ext).filter((f) => f.public && f.type !== 'secret');
      bundle.settings[ext.id] = Object.fromEntries(pub.map((f) => [f.key, this.settingValue(ext.id, f)]));
      for (const k of Object.keys(csp) as Array<keyof CspSources>) csp[k] = [...new Set([...(csp[k] ?? []), ...(ext.manifest.csp[k] ?? [])])];
    }
    bundle.slots = await this.renderSlots(v, ['afterHeader', 'beforeFooter', 'bodyEnd', 'homeTop', 'homeSidebar']);
    return bundle;
  }

  async profileSlots(v: RequestViewer, userId: number): Promise<ExtensionProfileSlots> {
    if (!this.loaded.size) return { sidebar: [], tabs: [] };
    const u = await this.db.q.selectFrom('users').select(['id', 'username', 'display_name']).where('id', '=', userId).where('deleted_at', 'is', null).executeTakeFirst();
    if (!u) return { sidebar: [], tabs: [] };
    const slots = await this.renderSlots(v, ['profileSidebar', 'profileTab'], { profile: { id: u.id, username: u.username, displayName: u.display_name } });
    return { sidebar: slots.profileSidebar ?? [], tabs: slots.profileTab ?? [] };
  }

  private hasSlots(names: ExtensionSlot[]): boolean {
    for (const ext of this.loaded.values()) if (ext.slots.some((s) => names.includes(s.slot))) return true;
    return false;
  }

  async topicSlots(
    v: RequestViewer,
    topic: { id: number; title: string; board_id: number; user_id: number | null; first_post_id: number | null },
    posts: Array<{ id: number; user_id: number | null }>,
  ): Promise<ExtensionTopicSlots> {
    const out: ExtensionTopicSlots = { topicTop: [], topicBottom: [], posts: {} };
    if (!this.hasSlots(['topicTop', 'topicBottom', 'postFooter', 'postActions'])) return out;
    const t = { id: topic.id, title: topic.title, boardId: topic.board_id, authorId: topic.user_id };
    const head = await this.renderSlots(v, ['topicTop', 'topicBottom'], { topic: t });
    out.topicTop = head.topicTop ?? [];
    out.topicBottom = head.topicBottom ?? [];
    if (this.hasSlots(['postFooter', 'postActions'])) {
      await Promise.all(
        posts.slice(0, 100).map(async (p) => {
          const r = await this.renderSlots(v, ['postFooter', 'postActions'], { topic: t, post: { id: p.id, authorId: p.user_id, isFirst: p.id === topic.first_post_id } });
          if (r.postFooter?.length || r.postActions?.length) out.posts[p.id] = { postFooter: r.postFooter, postActions: r.postActions };
        }),
      );
    }
    return out;
  }

  async boardSlots(v: RequestViewer, board: { id: number; name: string; slug: string }): Promise<ExtensionSlotItem[]> {
    if (!this.hasSlots(['boardTop'])) return [];
    return (await this.renderSlots(v, ['boardTop'], { board: { id: board.id, name: board.name, slug: board.slug } })).boardTop ?? [];
  }

  overrides(): ExtensionRouteOverride[] {
    const out: ExtensionRouteOverride[] = [];
    for (const ext of this.loaded.values()) for (const p of ext.pages) if (p.override) out.push({ base: p.base, wildcard: p.wildcard });
    return out;
  }

  accountMenu(v: RequestViewer): ExtensionAccountMenuItem[] {
    if (!v.user) return [];
    const out: ExtensionAccountMenuItem[] = [];
    for (const ext of this.loaded.values())
      for (const p of ext.accountPages.values()) {
        const perms = p.permission ? (Array.isArray(p.permission) ? p.permission : [p.permission]) : [];
        if (perms.every((x) => can(v, this.permKey(ext, x)))) out.push({ ext: ext.id, key: p.key, title: p.title, iconNode: iconNode(p.icon ?? ext.manifest.icon, 'regular') });
      }
    return out;
  }

  async renderAccountPage(v: RequestViewer, id: string, key: string, query: Record<string, string>): Promise<ExtensionAdminPageView> {
    const ext = this.loaded.get(id);
    const page = ext?.accountPages.get(key);
    if (!ext || !page) throw Errors.notFound('Sayfa bulunamadı.');
    this.checkAccess(ext, v, { auth: true, permission: page.permission });
    let out: PageResult;
    try {
      out = (await withTimeout(Promise.resolve(page.render(this.toRequest(ext, v, { method: 'GET', path: '/', query }))), RENDER_TIMEOUT, 'render()')) ?? {};
    } catch (e) {
      throw this.toAppError(ext, e, `Üye sayfası ${key}`);
    }
    return { ext: ext.id, extName: ext.manifest.name, key, title: out.title ?? page.title, html: String(out.html ?? ''), scripts: this.files(ext, out.scripts), styles: this.files(ext, out.styles), data: out.data ?? null };
  }

  navItems(v: RequestViewer): Array<{ ext: string; label: string; url: string; icon: string | null }> {
    const out: Array<{ ext: string; label: string; url: string; icon: string | null }> = [];
    for (const ext of this.loaded.values()) {
      for (const n of ext.manifest.nav) {
        if (n.visibility === 'members' && !v.user) continue;
        if (n.visibility === 'guests' && v.user) continue;
        if (n.permission && !can(v, this.permKey(ext, n.permission))) continue;
        out.push({ ext: ext.id, label: n.label, url: n.url, icon: n.icon ?? null });
      }
    }
    return out;
  }

  adminMenu(v: RequestViewer): ExtensionAdminMenu[] {
    if (!can(v, 'admin.access')) return [];
    const out: ExtensionAdminMenu[] = [];
    for (const ext of this.loaded.values()) {
      const pages = [...ext.adminPages.values()]
        .filter((p) => !p.permission || (Array.isArray(p.permission) ? p.permission : [p.permission]).every((x) => can(v, this.permKey(ext, x))))
        .map((p) => ({ key: p.key, title: p.title, icon: p.icon ?? ext.manifest.icon, iconNode: iconNode(p.icon ?? ext.manifest.icon, 'regular') }));
      const hasSettings = ext.manifest.settings.length > 0 && can(v, 'admin.settings');
      if (pages.length || hasSettings) out.push({ id: ext.id, name: ext.manifest.name, icon: ext.manifest.icon, iconNode: iconNode(ext.manifest.icon, 'regular'), pages, hasSettings });
    }
    return out;
  }

  assetPath(id: string, file: string): string | null {
    const ext = this.loaded.get(id);
    if (!ext || !SAFE_ASSET.test(file)) return null;
    const base = normalize(join(ext.dir, 'public'));
    const target = normalize(join(base, file));
    return target.startsWith(base + sep) && existsSync(target) ? target : null;
  }

  private capabilities(manifest: ExtensionManifest | null, ext: LoadedExtension | undefined): ExtensionCapabilities {
    if (!manifest) return { server: false, pages: [], adminPages: [], routes: 0, slots: [], clientScripts: 0, clientStyles: 0, permissions: [], settings: 0, nav: 0, csp: [], jobs: [], events: [] };
    const csp = Object.values(manifest.csp).flat();
    return {
      server: !!manifest.server,
      pages: ext?.pages.map((p) => `/${p.base}${p.wildcard ? (p.base ? '/*' : '*') : ''}${p.override ? ' ⟲' : ''}`) ?? [],
      adminPages: ext ? [...ext.adminPages.values()].map((p) => ({ key: p.key, title: p.title, icon: p.icon ?? manifest.icon })) : [],
      routes: ext?.routes.length ?? 0,
      slots: [...new Set(ext?.slots.map((s) => s.slot) ?? [])],
      clientScripts: manifest.client.scripts.length,
      clientStyles: manifest.client.styles.length,
      permissions: manifest.permissions.map((p) => p.label),
      settings: manifest.settings.length,
      nav: manifest.nav.length,
      csp: [...new Set(csp)],
      jobs: ext ? [...ext.tasks, ...ext.jobTypes].map((t) => t.replace(`ext:${ext.id}:`, '')) : [],
      events: ext ? [...new Set(ext.events.map((e) => e.name))] : [],
    };
  }

  private toAdmin(r: ExtRow): AdminExtension {
    const manifest = parse<ExtensionManifest>(r.manifest_json, null as never);
    const ext = this.loaded.get(r.id);
    const compatible = manifest ? versionSatisfies(this.config.version, manifest.inkforum) : false;
    const status: AdminExtension['status'] = ext ? 'active' : !compatible ? 'incompatible' : r.is_enabled === 1 && !this.safeMode ? 'error' : 'disabled';
    const firstPage = ext?.pages[0];
    return {
      id: r.id,
      name: r.name,
      version: r.version,
      description: manifest?.description ?? '',
      author: manifest?.author ?? '',
      homepage: manifest?.homepage ?? null,
      icon: manifest?.icon ?? 'puzzle-piece',
      iconNode: iconNode(manifest?.icon ?? 'puzzle-piece', 'duotone'),
      source: r.source as AdminExtension['source'],
      packageName: r.package_name,
      enabled: r.is_enabled === 1,
      status,
      error: r.error ?? (status === 'incompatible' ? `InkForum ${manifest?.inkforum} gerekiyor (kurulu ${this.config.version}).` : null),
      category: null,
      features: [],
      stats: [],
      adminHref: `/admin/extensions/${r.id}`,
      publicHref: firstPage ? `/${firstPage.base}` : null,
      capabilities: this.capabilities(manifest, ext),
      installedAt: r.installed_at,
      updatedAt: r.updated_at,
    };
  }

  async overview(): Promise<ExtensionsOverview> {
    return { items: (await this.rows()).map((r) => this.toAdmin(r)), safeMode: this.safeMode, coreVersion: this.config.version, directory: this.root };
  }

  async detail(id: string): Promise<AdminExtensionDetail> {
    const r = await this.row(id);
    if (!r) throw Errors.notFound('Eklenti bulunamadı.');
    const manifest = parse<ExtensionManifest>(r.manifest_json, null as never);
    this.settingValues.set(id, parse<Record<string, unknown>>(r.settings_json, {}));
    const values: Record<string, unknown> = {};
    for (const f of manifest.settings) {
      const v = this.settingValue(id, f);
      values[f.key] = f.type === 'secret' ? (v ? SECRET_MASK : '') : v;
    }
    let readmeHtml: string | null = null;
    for (const name of ['README.md', 'readme.md', 'README.MD']) {
      const p = join(this.dirOf(id), name);
      if (existsSync(p)) {
        readmeHtml = renderMarkdown(readFileSync(p, 'utf8').slice(0, 100_000));
        break;
      }
    }
    return { extension: this.toAdmin(r), fields: manifest.settings, values, readmeHtml, logs: [...(this.logs.get(id) ?? [])].reverse() };
  }

  private validateSetting(f: ExtensionSettingField, value: unknown): unknown {
    switch (f.type) {
      case 'boolean':
        return value === true || value === 'true' || value === 1;
      case 'number': {
        const n = Number(value);
        if (!Number.isFinite(n)) throw Errors.field(f.key, 'Sayı girin.');
        if (f.min !== undefined && n < f.min) throw Errors.field(f.key, `En az ${f.min}.`);
        if (f.max !== undefined && n > f.max) throw Errors.field(f.key, `En fazla ${f.max}.`);
        return n;
      }
      case 'select':
        if (f.options && !f.options.some((o) => o.value === value)) throw Errors.field(f.key, 'Geçersiz seçim.');
        return String(value);
      case 'groups':
        if (!Array.isArray(value)) return [];
        return value.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
      case 'color':
        if (value && !/^#[0-9a-f]{6}$/i.test(String(value))) throw Errors.field(f.key, 'Renk #rrggbb biçiminde olmalı.');
        return String(value ?? '');
      case 'url':
        if (value && !/^https?:\/\/\S+$/i.test(String(value))) throw Errors.field(f.key, 'Adres http:// ya da https:// ile başlamalı.');
        return String(value ?? '').slice(0, 2000);
      default: {
        const s = String(value ?? '');
        if (s.length > (f.type === 'textarea' ? 100_000 : 5000)) throw Errors.field(f.key, 'Çok uzun.');
        if (f.required && !s.trim()) throw Errors.field(f.key, 'Bu alan gerekli.');
        return s;
      }
    }
  }

  async saveSettings(id: string, input: Record<string, unknown>, actorId: number | null, audit = true): Promise<void> {
    const r = await this.row(id);
    if (!r) throw Errors.notFound('Eklenti bulunamadı.');
    const manifest = parse<ExtensionManifest>(r.manifest_json, null as never);
    const current = parse<Record<string, unknown>>(r.settings_json, {});
    const next = { ...current };
    for (const [key, value] of Object.entries(input)) {
      const f = manifest.settings.find((x) => x.key === key);
      if (!f) {
        if (!audit) next[key] = value;
        continue;
      }
      if (f.type === 'secret') {
        if (value === SECRET_MASK) continue;
        next[key] = value ? { [ENC]: this.crypto.encrypt(String(value)) } : '';
        continue;
      }
      next[key] = this.validateSetting(f, value);
    }
    await this.db.q.updateTable('extensions').set({ settings_json: JSON.stringify(next), updated_at: this.clock.now() }).where('id', '=', id).execute();
    this.settingValues.set(id, next);
    if (audit) await this.audit.log({ type: 'admin', action: 'extension.settings', actorId, data: { id, keys: Object.keys(input) } });
    const ext = this.loaded.get(id);
    if (ext) {
      const values = this.allSettings(ext);
      for (const fn of ext.settingsListeners) {
        try {
          await fn(values);
        } catch (e) {
          this.log(id, 'error', `Ayar dinleyicisi hata verdi: ${String(e)}`);
        }
      }
    }
  }

  async setEnabled(id: string, enabled: boolean, actorId: number): Promise<AdminExtension> {
    const r = await this.row(id);
    if (!r) throw Errors.notFound('Eklenti bulunamadı.');
    await this.db.q.updateTable('extensions').set({ is_enabled: enabled ? 1 : 0, error: null }).where('id', '=', id).execute();
    await this.audit.log({ type: 'admin', action: enabled ? 'extension.enable' : 'extension.disable', actorId, data: { id, version: r.version } });
    if (!enabled) await this.unload(id);
    else if (this.safeMode) throw Errors.badRequest('Eklenti güvenli modu açık; eklentiler yüklenmiyor. INKFORUM_SAFE_MODE ayarını kapatıp forumu yeniden başlatın.');
    else {
      try {
        await this.load(id);
      } catch (e) {
        await this.db.q.updateTable('extensions').set({ is_enabled: 0 }).where('id', '=', id).execute();
        throw e;
      }
    }
    return this.toAdmin((await this.row(id))!);
  }

  async reload(id: string): Promise<AdminExtension> {
    const r = await this.row(id);
    if (!r) throw Errors.notFound('Eklenti bulunamadı.');
    if (r.is_enabled !== 1) throw Errors.badRequest('Kapalı eklenti yeniden yüklenemez.');
    await this.db.q.updateTable('extensions').set({ updated_at: this.clock.now() }).where('id', '=', id).execute();
    await this.load(id);
    return this.toAdmin((await this.row(id))!);
  }

  private stagePath(token: string): string {
    return join(this.incoming, token);
  }

  async stage(buf: Buffer, source: { kind: 'upload' | 'npm'; packageName?: string | null }): Promise<ExtensionPackagePreview> {
    let pkg: ParsedPackage;
    try {
      pkg = parsePackage(buf);
    } catch (e) {
      throw Errors.badRequest(e instanceof PackageError ? e.message : 'Paket okunamadı.');
    }
    this.cleanIncoming();
    const token = randomBytes(16).toString('hex');
    const dir = this.stagePath(token);
    mkdirSync(join(dir, 'files'), { recursive: true });
    writeFiles(pkg.files, join(dir, 'files'));
    writeFileSync(join(dir, 'stage.json'), JSON.stringify({ manifest: pkg.manifest, source: source.kind, packageName: source.packageName ?? null, dependencies: pkg.dependencies, hasNodeModules: pkg.hasNodeModules }));
    const existing = await this.row(pkg.manifest.id);
    return {
      token,
      manifest: pkg.manifest,
      installedVersion: existing?.version ?? null,
      compatible: versionSatisfies(this.config.version, pkg.manifest.inkforum),
      files: pkg.files.size,
      size: pkg.size,
      hasServer: !!pkg.manifest.server,
      dependencies: pkg.dependencies,
      warnings: pkg.warnings,
    };
  }

  async samples(): Promise<ExtensionSample[]> {
    const installed = new Map((await this.rows()).map((r) => [r.id, r.version]));
    return this.sdk.samples().map(({ manifest: m }) => ({
      id: m.id,
      name: m.name,
      version: m.version,
      description: m.description,
      author: m.author,
      icon: m.icon,
      iconNode: iconNode(m.icon, 'duotone'),
      installedVersion: installed.get(m.id) ?? null,
    }));
  }

  sampleZip(id: string): Buffer {
    const zip = this.sdk.sampleZip(id);
    if (!zip) throw Errors.notFound('Hazır eklenti bulunamadı.');
    return zip;
  }

  stageSample(id: string): Promise<ExtensionPackagePreview> {
    return this.stage(this.sampleZip(id), { kind: 'upload' });
  }

  starterZip(id: string, name: string): Buffer {
    if (!this.sdk.dir) throw Errors.notFound('Başlangıç paketi bu kurulumda bulunamadı.');
    return this.sdk.starter(id, name);
  }

  async stageNpm(name: string, version: string): Promise<ExtensionPackagePreview> {
    let dl: { buf: Buffer; version: string };
    try {
      dl = await downloadNpm(name, version || 'latest');
    } catch (e) {
      throw Errors.badRequest(e instanceof PackageError ? e.message : `npm'den indirilemedi: ${e instanceof Error ? e.message : String(e)}`);
    }
    return this.stage(dl.buf, { kind: 'npm', packageName: name });
  }

  private cleanIncoming(): void {
    if (!existsSync(this.incoming)) return;
    const limit = Date.now() - 60 * MINUTE;
    for (const name of readdirSync(this.incoming)) {
      const p = join(this.incoming, name);
      try {
        if (statSync(p).mtimeMs < limit) rmSync(p, { recursive: true, force: true });
      } catch {
      }
    }
  }

  async installStaged(token: string, enable: boolean, actorId: number): Promise<AdminExtension> {
    const dir = this.stagePath(token);
    if (!existsSync(join(dir, 'stage.json'))) throw Errors.notFound('Yüklenen paket bulunamadı ya da süresi doldu; yeniden yükleyin.');
    const stage = parse<{ manifest: ExtensionManifest; source: 'upload' | 'npm'; packageName: string | null; dependencies: string[]; hasNodeModules: boolean }>(readFileSync(join(dir, 'stage.json'), 'utf8'), null as never);
    const m = stage.manifest;
    if (!versionSatisfies(this.config.version, m.inkforum)) throw Errors.badRequest(`Bu eklenti InkForum ${m.inkforum} gerektiriyor (kurulu ${this.config.version}).`);
    const files = join(dir, 'files');
    if (stage.dependencies.length && !stage.hasNodeModules) await this.npmInstall(files);

    const existing = await this.row(m.id);
    const wasEnabled = existing?.is_enabled === 1;
    if (this.loaded.has(m.id)) await this.unload(m.id);
    const target = this.dirOf(m.id);
    mkdirSync(this.root, { recursive: true });
    if (existsSync(target)) {
      mkdirSync(this.backups, { recursive: true });
      const backup = join(this.backups, `${m.id}-${existing?.version ?? 'eski'}-${Date.now()}`);
      renameSync(target, backup);
      this.pruneBackups(m.id);
    }
    renameSync(files, target);
    rmSync(dir, { recursive: true, force: true });

    const now = this.clock.now();
    const values = { name: m.name, version: m.version, source: stage.source, package_name: stage.packageName, manifest_json: JSON.stringify(m), error: null, updated_at: now };
    if (existing) await this.db.q.updateTable('extensions').set(values).where('id', '=', m.id).execute();
    else await this.db.q.insertInto('extensions').values({ id: m.id, ...values, is_enabled: 0, installed_by: actorId, installed_at: now }).execute();
    await this.audit.log({ type: 'admin', action: existing ? 'extension.update' : 'extension.install', actorId, data: { id: m.id, version: m.version, from: existing?.version ?? null, source: stage.source } });
    this.log(m.id, 'info', existing ? `Güncellendi: v${existing.version} → v${m.version}` : `Kuruldu: v${m.version}`);

    if (enable || wasEnabled) return this.setEnabled(m.id, true, actorId);
    return this.toAdmin((await this.row(m.id))!);
  }

  private pruneBackups(id: string): void {
    const list = readdirSync(this.backups)
      .filter((n) => n.startsWith(`${id}-`))
      .sort();
    for (const n of list.slice(0, Math.max(0, list.length - 2))) rmSync(join(this.backups, n), { recursive: true, force: true });
  }

  private npmInstall(cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const child = spawn(npm, ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'], { cwd, shell: process.platform === 'win32', stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      child.stderr.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
      const timer = setTimeout(() => child.kill(), 5 * MINUTE);
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(Errors.badRequest(`Bağımlılıklar kurulamadı (npm bulunamadı): ${e.message}. Eklentiyi bağımlılıklarıyla birlikte paketleyin (inkforum-ext pack).`));
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(Errors.badRequest(`Bağımlılıklar kurulamadı (npm çıkış kodu ${code}). ${err.trim().split('\n').slice(-3).join(' ')}`));
      });
    });
  }

  async uninstall(id: string, deleteData: boolean, actorId: number): Promise<void> {
    const r = await this.row(id);
    if (!r) throw Errors.notFound('Eklenti bulunamadı.');
    const ext = this.loaded.get(id);
    if (deleteData && ext?.def?.uninstall) {
      try {
        await withTimeout(Promise.resolve(ext.def.uninstall(ext.ctx)), 60_000, 'uninstall()');
      } catch (e) {
        this.log(id, 'error', `uninstall() hata verdi: ${String(e)}`);
      }
    }
    await this.unload(id);
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('extensions').where('id', '=', id).execute();
      if (deleteData) {
        await this.db.q.deleteFrom('extension_kv').where('ext_id', '=', id).execute();
        await this.db.q.deleteFrom('extension_migrations').where('ext_id', '=', id).execute();
        await this.db.q.deleteFrom('group_permissions').where('permission', 'like', `ext.${id}.%`).execute();
        await this.db.q.deleteFrom('system_state').where('key', '=', `ext-permissions:${id}`).execute();
      }
    });
    rmSync(this.dirOf(id), { recursive: true, force: true });
    if (deleteData) rmSync(join(this.dataRoot, id), { recursive: true, force: true });
    this.logs.delete(id);
    this.settingValues.delete(id);
    await this.audit.log({ type: 'admin', action: 'extension.uninstall', actorId, data: { id, version: r.version, deleteData } });
    await this.changed();
  }
}

type ExtensionRequestHandler = Parameters<ExtensionContext['routes']['get']>[1];
