import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { LOCALES, type Locale } from '@forum/shared';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

/** .env içinde boş bırakılan değer (ör. `APP_SECRET=`) verilmemiş sayılır */
const blank = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /** Sitenin adresi. Boş ya da "auto": ilk kurulumda tarayıcı adresinden algılanıp kaydedilir */
  APP_URL: blank(z.union([z.literal('auto'), z.url()])),
  /** Coolify'ın uygulamaya verdiği adres(ler); APP_URL yoksa kullanılır */
  COOLIFY_URL: z.string().optional(),
  COOLIFY_FQDN: z.string().optional(),
  COOLIFY_RESOURCE_UUID: z.string().optional(),
  COOLIFY_CONTAINER_NAME: z.string().optional(),
  APP_ROOT: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  APP_SECRET: blank(z.string().min(32)),
  TRUST_PROXY: z.string().default('loopback'),

  DB_DRIVER: z.enum(['sqlite', 'postgres', 'pglite']).default('sqlite'),
  DB_SQLITE_PATH: z.string().default('storage/forum.db'),
  SQLITE_DRIVER: z.enum(['auto', 'node', 'better']).default('auto'),
  SQLITE_JOURNAL: z.enum(['WAL', 'DELETE']).default('WAL'),
  DATABASE_URL: z.string().optional(),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(5),
  DB_LOG: bool.default(false),
  MIGRATE_ON_BOOT: bool.default(true),

  STORAGE_DIR: z.string().default('storage'),
  WEB_BUILD_DIR: z.string().optional(),

  MAIL_DRIVER: z.enum(['log', 'smtp', 'sendmail']).default('log'),
  SMTP_URL: z.string().optional(),
  SENDMAIL_PATH: z.string().default('/usr/sbin/sendmail'),

  IMAGE_DRIVER: z.enum(['auto', 'sharp', 'passthrough']).default('auto'),
  /** Webhook'ların yerel / özel ağ adreslerine gitmesine izin ver (yalnızca geliştirme) */
  WEBHOOK_ALLOW_PRIVATE: z.enum(['true', 'false']).default('false'),
  /** Acil durum: güvenlik duvarını yönetim ayarından bağımsız kapatır (kendini dışarıda bırakma durumu için) */
  WAF_DISABLED: z.enum(['true', 'false']).default('false'),

  /** Güncellemelerin okunduğu GitHub deposu (sahip/ad) */
  UPDATE_REPO: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/)
    .default('vokartz/inkforum'),
  UPDATE_API_URL: z.url().default('https://api.github.com'),
  /** Güncelleme denetimini tamamen kapatır (internetsiz kurulumlar) */
  UPDATES_DISABLED: bool.optional(),
  /** Docker kurulumunda güncelleyici kapsayıcının adresi ve paylaşılan anahtarı */
  UPDATER_URL: z.url().optional(),
  UPDATER_TOKEN: blank(z.string().min(16)),
  /** docker | release | source (boşsa otomatik algılanır) */
  INKFORUM_DEPLOY: z.enum(['docker', 'release', 'source']).optional(),
  INKFORUM_BUILD: z.string().max(80).optional(),
  /** Kurulumdan önceki varsayılan dil (install.sh yazar); kurulumdan sonra yönetim panelindeki ayar geçerlidir */
  DEFAULT_LOCALE: blank(z.enum(LOCALES)),

  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_EMAIL: z.string().default('admin@example.com'),
  ADMIN_PASSWORD: z.string().optional(),

  WORKER_ENABLED: bool.default(true),
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
});

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  isProd: boolean;
  isTest: boolean;
  root: string;
  appUrl: string;
  appOrigin: string;
  /** env: APP_URL (ya da platform) belirledi · auto: kurulumda algılanır ve veritabanında saklanır */
  appUrlMode: 'env' | 'auto';
  /** auto modda adres henüz belirlenmedi (kurulumdan önce); kaynak denetimi istekteki Host'a göre yapılır */
  appUrlPending: boolean;
  secureCookies: boolean;
  sessionCookieName: string;
  port: number;
  host: string;
  secret: string;
  trustProxy: string | boolean | number;
  db: {
    driver: 'sqlite' | 'postgres' | 'pglite';
    sqlitePath: string;
    sqliteDriver: 'auto' | 'node' | 'better';
    sqliteJournal: 'WAL' | 'DELETE';
    postgresUrl?: string;
    poolSize: number;
    log: boolean;
    migrateOnBoot: boolean;
  };
  storageDir: string;
  uploadsDir: string;
  webBuildDir: string | null;
  mail: { driver: 'log' | 'smtp' | 'sendmail'; smtpUrl?: string; sendmailPath: string };
  imageDriver: 'auto' | 'sharp' | 'passthrough';
  allowPrivateWebhooks: boolean;
  wafDisabled: boolean;
  admin: { username: string; email: string; password?: string };
  version: string;
  build: string | null;
  deploy: 'docker' | 'release' | 'source';
  /** Coolify üzerinde çalışıyor (platformun verdiği ortam değişkenleri) */
  coolify: boolean;
  updates: { repo: string; apiUrl: string; disabled: boolean; updaterUrl: string | null; updaterToken: string | null };
  defaultLocale: Locale | null;
  workerEnabled: boolean;
  logLevel: 'error' | 'warn' | 'log' | 'debug' | 'verbose';
}

function findRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) || existsSync(join(dir, 'forum.release'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

/** Uygulama sürümü: kök package.json (kaynak kod ve sürüm paketinde aynı yerde) */
function readVersion(root: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function readOptional(file: string): string | null {
  try {
    return existsSync(file) ? readFileSync(file, 'utf8').trim().slice(0, 80) || null : null;
  } catch {
    return null;
  }
}

function parseTrustProxy(v: string): string | boolean | number {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

/**
 * Docker'da UPDATER_TOKEN verilmediyse paylaşılan depolamada (storage/.updater-token) üretilir;
 * güncelleyici kapsayıcı aynı birimi salt okunur bağlayıp anahtarı oradan okur.
 */
function resolveUpdaterToken(storageDir: string): string | null {
  const file = join(storageDir, '.updater-token');
  try {
    if (existsSync(file)) return readFileSync(file, 'utf8').trim() || null;
    mkdirSync(storageDir, { recursive: true });
    const token = randomBytes(32).toString('base64url');
    writeFileSync(file, token, { mode: 0o644 });
    return token;
  } catch {
    return null;
  }
}

/** Platformun verdiği adres: COOLIFY_URL (virgülle ayrılmış olabilir) ya da COOLIFY_FQDN */
function platformUrl(e: { COOLIFY_URL?: string; COOLIFY_FQDN?: string }): string | null {
  const first = (v?: string) => v?.split(',')[0]?.trim() || '';
  const url = first(e.COOLIFY_URL);
  if (/^https?:\/\//.test(url)) return url;
  const fqdn = first(e.COOLIFY_FQDN);
  if (fqdn) return /^https?:\/\//.test(fqdn) ? fqdn : `https://${fqdn}`;
  return null;
}

/** Site adresini (ve ona bağlı çerez ayarlarını) uygular; otomatik algılamada çalışırken de çağrılır */
export function applySiteUrl(config: AppConfig, raw: string): void {
  const url = new URL(raw);
  config.appUrl = url.origin + url.pathname.replace(/\/+$/, '');
  config.appOrigin = url.origin;
  config.secureCookies = url.protocol === 'https:';
  config.sessionCookieName = config.secureCookies ? '__Host-forum_sid' : 'forum_sid';
  config.appUrlPending = false;
}

/** Geliştirmede APP_SECRET yoksa storage içinde kalıcı bir anahtar üretir. */
function resolveSecret(given: string | undefined, storageDir: string, isProd: boolean): string {
  if (given) return given;
  const file = join(storageDir, '.app-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  if (isProd) {
    // Üretimde de çalışabilsin ama kalıcı olsun: ilk açılışta üret ve sakla.
    console.warn('[config] APP_SECRET ayarlanmamış; storage/.app-secret dosyasında üretiliyor.');
  }
  mkdirSync(storageDir, { recursive: true });
  const secret = randomBytes(48).toString('base64url');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<Record<string, string>> = {}): AppConfig {
  const parsed = envSchema.safeParse({ ...env, ...overrides });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Geçersiz ortam değişkenleri: ${msg}`);
  }
  const e = parsed.data;
  const root = e.APP_ROOT ? resolve(e.APP_ROOT) : findRoot(process.cwd());
  const abs = (p: string) => (isAbsolute(p) ? p : resolve(root, p));

  const isProd = e.NODE_ENV === 'production';
  const given = e.APP_URL === 'auto' ? null : (e.APP_URL ?? platformUrl(e));
  // Üretimde adres verilmediyse ilk kurulumda algılanır; o zamana kadar yer tutucu kullanılır
  const appUrlMode = given || (!isProd && e.APP_URL !== 'auto') ? 'env' : 'auto';
  const appUrl = (given ?? (isProd ? `http://localhost:${e.PORT}` : 'http://localhost:5173')).replace(/\/+$/, '');
  const url = new URL(appUrl);
  const secureCookies = url.protocol === 'https:';
  const storageDir = abs(e.STORAGE_DIR);

  let webBuildDir: string | null = null;
  const candidates = e.WEB_BUILD_DIR ? [abs(e.WEB_BUILD_DIR)] : [join(root, 'apps/web/build'), join(root, 'web')];
  for (const c of candidates) {
    if (existsSync(join(c, 'handler.js'))) {
      webBuildDir = c;
      break;
    }
  }

  return {
    env: e.NODE_ENV,
    isProd,
    isTest: e.NODE_ENV === 'test',
    root,
    appUrl,
    appOrigin: url.origin,
    appUrlMode,
    appUrlPending: appUrlMode === 'auto',
    secureCookies,
    sessionCookieName: secureCookies ? '__Host-forum_sid' : 'forum_sid',
    port: e.PORT,
    host: e.HOST,
    secret: e.NODE_ENV === 'test' ? (e.APP_SECRET ?? 'test-secret-test-secret-test-secret-000') : resolveSecret(e.APP_SECRET, storageDir, isProd),
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    db: {
      driver: e.DB_DRIVER,
      sqlitePath: e.DB_SQLITE_PATH === ':memory:' ? ':memory:' : abs(e.DB_SQLITE_PATH),
      sqliteDriver: e.SQLITE_DRIVER,
      sqliteJournal: e.SQLITE_JOURNAL,
      postgresUrl: e.DATABASE_URL,
      poolSize: e.DB_POOL_SIZE,
      log: e.DB_LOG,
      migrateOnBoot: e.MIGRATE_ON_BOOT,
    },
    storageDir,
    uploadsDir: join(storageDir, 'uploads'),
    webBuildDir,
    mail: { driver: e.MAIL_DRIVER, smtpUrl: e.SMTP_URL, sendmailPath: e.SENDMAIL_PATH },
    imageDriver: e.IMAGE_DRIVER,
    allowPrivateWebhooks: e.WEBHOOK_ALLOW_PRIVATE === 'true' || e.NODE_ENV === 'test',
    wafDisabled: e.WAF_DISABLED === 'true',
    admin: { username: e.ADMIN_USERNAME, email: e.ADMIN_EMAIL, password: e.ADMIN_PASSWORD || undefined },
    version: readVersion(root),
    build: e.INKFORUM_BUILD ?? readOptional(join(root, 'BUILD')),
    coolify: !!(e.COOLIFY_FQDN || e.COOLIFY_URL || e.COOLIFY_RESOURCE_UUID || e.COOLIFY_CONTAINER_NAME),
    deploy: e.INKFORUM_DEPLOY ?? (existsSync(join(root, 'forum.release')) ? 'release' : 'source'),
    updates: {
      repo: e.UPDATE_REPO,
      apiUrl: e.UPDATE_API_URL.replace(/\/+$/, ''),
      disabled: e.UPDATES_DISABLED ?? e.NODE_ENV === 'test',
      updaterUrl: e.UPDATER_URL ?? (e.INKFORUM_DEPLOY === 'docker' ? 'http://updater:9000' : null),
      updaterToken: e.UPDATER_TOKEN ?? (e.INKFORUM_DEPLOY === 'docker' && e.NODE_ENV !== 'test' ? resolveUpdaterToken(storageDir) : null),
    },
    defaultLocale: e.DEFAULT_LOCALE ?? null,
    workerEnabled: e.WORKER_ENABLED,
    logLevel: e.LOG_LEVEL,
  };
}

export const CONFIG = Symbol('APP_CONFIG');
