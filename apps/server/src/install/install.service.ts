import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, statfsSync, unlinkSync, writeFileSync } from 'node:fs';
import { freemem, totalmem } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { Response } from 'express';
import { pendingMigrations } from '@forum/db';
import {
  PLUGIN_KEYS,
  passwordIssue,
  usernameIssue,
  type InstallCheck,
  type InstallEnvironment,
  type InstallInput,
  type InstallStatus,
  type PluginKey,
  type Locale,
} from '@forum/shared';
import { CONFIG, type AppConfig } from '../config/config.js';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { UsersService } from '../users/users.service.js';
import { PoliciesService } from '../policies/policies.service.js';
import { PasswordHasher } from '../security/password-hasher.js';
import { SessionService } from '../auth/session.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StorageService } from '../storage/storage.service.js';
import { MailService } from '../mail/mail.service.js';
import { ForumSeedService } from '../forum/forum-seed.service.js';
import { AppearanceService } from '../appearance/appearance.service.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { I18nService } from '../i18n/i18n.service.js';

const INSTALLED_KEY = 'installed:at';
const SEEDED_FORUM_KEY = 'seeded:forum:v1';
/** Karıştırılabilecek karakterler (0/O, 1/I/L) yok */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MIN_NODE = [22, 13] as const;

/**
 * İlk kurulum. Yönetici hesabı yokken site kurulum sihirbazına yönlendirilir; sihirbaz yalnızca
 * sunucu konsoluna yazılan kurulum koduyla kullanılabilir (açık bir sunucuyu başkası kuramasın diye).
 * ADMIN_PASSWORD ortam değişkeni verilmişse kurulum otomatik yapılır (CI, otomasyon).
 */
@Injectable()
export class InstallService {
  private readonly logger = new Logger('Kurulum');
  private done = false;
  private code: string | null = null;
  private attempts: number[] = [];

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly groups: GroupCacheService,
    private readonly users: UsersService,
    private readonly policies: PoliciesService,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly forumSeed: ForumSeedService,
    private readonly appearance: AppearanceService,
    private readonly tickets: TicketsService,
    private readonly i18n: I18nService,
  ) {}

  get installed(): boolean {
    return this.done;
  }

  status(): InstallStatus {
    return { installed: this.done, version: this.config.version };
  }

  private codeFile(): string {
    return join(this.config.storageDir, 'INSTALL_CODE.txt');
  }

  /** Açılışta (BootstrapService): kurulu mu, değilse kurulum kodunu hazırla */
  async init(hasAdmin: boolean): Promise<void> {
    const row = await this.db.q.selectFrom('system_state').select('value').where('key', '=', INSTALLED_KEY).executeTakeFirst();
    if (row || hasAdmin) {
      if (!row) await this.markInstalled();
      this.done = true;
      return;
    }
    this.done = false;
    this.code = this.config.installCode ? normalize(this.config.installCode) : generateCode();
    if (this.config.isTest) return;
    try {
      mkdirSync(this.config.storageDir, { recursive: true });
      writeFileSync(this.codeFile(), `InkForum kurulum kodu: ${pretty(this.code)}\nAdres: ${this.config.appUrl}/install\n\nKurulum bitince bu dosya kendiliğinden silinir.\n`, { mode: 0o600 });
    } catch {
      /* salt okunur depolama: kod yine konsolda */
    }
    const line = '═'.repeat(58);
    this.logger.warn(line);
    this.logger.warn('InkForum henüz kurulmadı / InkForum is not installed yet. Kurulum sihirbazı / Setup wizard:');
    this.logger.warn(`  Adres / URL : ${this.config.appUrl}/install`);
    this.logger.warn(`  Kurulum kodu: ${pretty(this.code)}`);
    this.logger.warn(`  Setup code  : ${pretty(this.code)}`);
    this.logger.warn(line);
  }

  /** Sistem grupları, politikalar, başarılar, uyarı şablonları ve destek kategorilerinin varsayılan metinleri */
  private async localizeSeeded(locale: Locale): Promise<void> {
    const dict = this.i18n.catalog(locale);
    if (locale === 'tr' || !dict) return;
    const tables: Array<{ table: string; id: string; cols: string[]; where?: [string, string] }> = [
      { table: 'member_groups', id: 'id', cols: ['name', 'description'] },
      { table: 'policy_version_texts', id: 'policy_version_id', cols: ['title', 'body_md'], where: ['locale', 'tr'] },
      { table: 'achievement_categories', id: 'id', cols: ['name', 'description'] },
      { table: 'achievements', id: 'id', cols: ['name', 'description'] },
      { table: 'warning_templates', id: 'id', cols: ['title', 'reason_template'] },
      { table: 'ticket_categories', id: 'id', cols: ['name', 'description', 'intro'] },
    ];
    const q = this.db.q as unknown as Kysely<Record<string, Record<string, unknown>>>;
    for (const t of tables) {
      let query = q.selectFrom(t.table).select([t.id, ...t.cols]);
      if (t.where) query = query.where(t.where[0], '=', t.where[1]);
      const rows = await query.execute().catch(() => []);
      for (const row of rows) {
        const set: Record<string, string> = {};
        for (const c of t.cols) {
          const v = row[c];
          if (typeof v === 'string' && dict[v]) set[c] = dict[v]!;
        }
        if (!Object.keys(set).length) continue;
        let upd = q.updateTable(t.table).set(set).where(t.id, '=', row[t.id]);
        if (t.where) upd = upd.where(t.where[0], '=', t.where[1]);
        await upd.execute();
      }
    }
    await this.groups.invalidate();
    await this.policies.invalidate();
  }

  async markInstalled(): Promise<void> {
    const now = this.clock.now();
    await this.db.q
      .insertInto('system_state')
      .values({ key: INSTALLED_KEY, value: String(now), updated_at: now })
      .onConflict((oc) => oc.column('key').doUpdateSet({ value: String(now), updated_at: now }))
      .execute();
    this.done = true;
  }

  /** Kurulum kodunu doğrular (IP'den bağımsız genel deneme sınırı: 15 dakikada 20) */
  verifyCode(input: string): void {
    if (this.done) throw Errors.conflict('Kurulum zaten tamamlanmış.');
    const now = this.clock.now();
    this.attempts = this.attempts.filter((t) => now - t < 15 * 60_000);
    if (this.attempts.length >= 20) throw Errors.rateLimited(15 * 60);
    const given = Buffer.from(normalize(input));
    const expected = Buffer.from(this.code ?? randomBytes(8).toString('hex'));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      this.attempts.push(now);
      throw Errors.field('code', 'Kurulum kodu hatalı. Kodu sunucu konsolunda ya da storage/INSTALL_CODE.txt dosyasında bulabilirsin.');
    }
  }

  async environment(locale: Locale = 'tr'): Promise<InstallEnvironment> {
    const checks = (await this.checks()).map((c) => ({ ...c, label: this.i18n.message(locale, c.label), detail: this.i18n.message(locale, c.detail) }));
    return {
      version: this.config.version,
      checks,
      appUrl: this.config.appUrl,
      db: this.config.db.driver,
      deploy: this.config.deploy,
      mailDriver: this.mail.driver(),
      suggestedName: String(this.settings.get('general.forumName')),
    };
  }

  private async checks(): Promise<InstallCheck[]> {
    const out: InstallCheck[] = [];
    const [maj, min] = process.versions.node.split('.').map(Number) as [number, number];
    const nodeOk = maj > MIN_NODE[0] || (maj === MIN_NODE[0] && min >= MIN_NODE[1]);
    out.push({ key: 'node', label: 'Node.js', status: nodeOk ? 'ok' : 'fail', detail: nodeOk ? `v${process.versions.node}` : `v${process.versions.node} — en az v${MIN_NODE.join('.')} gerekli` });

    try {
      await sql`select 1`.execute(this.db.q);
      const pending = await pendingMigrations(this.db.q);
      const label = this.config.db.driver === 'sqlite' ? `SQLite (${this.config.db.sqliteJournal})` : this.config.db.driver === 'postgres' ? 'PostgreSQL' : 'PGlite';
      out.push({ key: 'db', label: 'Veritabanı', status: pending.length ? 'fail' : 'ok', detail: pending.length ? `${pending.length} bekleyen tablo güncellemesi var` : `${label} bağlı, tablolar hazır` });
    } catch (err) {
      out.push({ key: 'db', label: 'Veritabanı', status: 'fail', detail: `Bağlanılamadı: ${String((err as Error).message ?? err).slice(0, 160)}` });
    }

    try {
      mkdirSync(this.config.uploadsDir, { recursive: true });
      const probe = join(this.config.uploadsDir, `.probe-${randomBytes(4).toString('hex')}`);
      writeFileSync(probe, 'ok');
      unlinkSync(probe);
      let free = '';
      let status: InstallCheck['status'] = 'ok';
      try {
        const s = statfsSync(this.config.storageDir);
        const bytes = Number(s.bavail) * Number(s.bsize);
        free = ` · ${(bytes / 1024 ** 3).toFixed(1)} GB boş`;
        if (bytes < 1024 ** 3) status = 'warn';
      } catch {
        /* statfs desteklenmiyor */
      }
      out.push({ key: 'storage', label: 'Dosya depolama', status, detail: `Yazılabilir${free}` });
    } catch {
      out.push({ key: 'storage', label: 'Dosya depolama', status: 'fail', detail: `${this.config.storageDir} klasörüne yazılamıyor (izinleri kontrol edin)` });
    }

    const sharp = await this.storage.loadSharp();
    out.push({ key: 'images', label: 'Görsel işleme', status: sharp ? 'ok' : 'warn', detail: sharp ? 'sharp: görseller küçültülür ve WebP’ye çevrilir' : 'sharp yok: görseller olduğu gibi saklanır' });

    const url = new URL(this.config.appUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
    out.push({
      key: 'https',
      label: 'Site adresi',
      status: url.protocol === 'https:' || local ? 'ok' : 'warn',
      detail: url.protocol === 'https:' || local ? this.config.appUrl : `${this.config.appUrl} — canlı sitede HTTPS önerilir (APP_URL)`,
    });

    const driver = this.mail.driver();
    out.push({ key: 'mail', label: 'E-posta', status: driver === 'log' ? 'warn' : 'ok', detail: driver === 'log' ? 'Henüz ayarlı değil — sonraki adımlarda SMTP girebilirsin' : `Sürücü: ${driver}` });

    const gb = (n: number) => (n / 1024 ** 3).toFixed(1);
    out.push({ key: 'memory', label: 'Bellek', status: totalmem() < 512 * 1024 ** 2 ? 'warn' : 'ok', detail: `${gb(freemem())} GB boş / ${gb(totalmem())} GB` });
    return out;
  }

  async complete(input: InstallInput, client: { ip: string | null; userAgent: string | null; locale?: Locale }, res: Response): Promise<{ userId: number }> {
    const locale = client.locale ?? 'tr';
    this.verifyCode(input.code);

    const fields: Record<string, string> = {};
    const uIssue = usernameIssue(input.admin.username, {
      minLength: this.settings.get('registration.usernameMinLength'),
      maxLength: this.settings.get('registration.usernameMaxLength'),
    });
    if (uIssue) fields['admin.username'] = uIssue;
    const pIssue = passwordIssue(input.admin.password, { minLength: Math.max(10, this.settings.get('security.passwordMinLength')), requireMixed: true }, input.admin.username);
    if (pIssue) fields['admin.password'] = pIssue;
    else if (!/\p{Ll}/u.test(input.admin.password) || !/\p{Lu}/u.test(input.admin.password)) fields['admin.password'] = 'Yönetici şifresinde büyük ve küçük harf birlikte kullanılmalı.';
    if (!fields['admin.username'] && (await this.users.findByIdentifier(input.admin.username))) fields['admin.username'] = 'Bu kullanıcı adı alınmış.';
    if (Object.keys(fields).length) throw Errors.validation(fields, Object.values(fields)[0]);

    const adminGroup = await this.groups.bySystemKey('admin');
    const plugins = Object.fromEntries(PLUGIN_KEYS.map((k) => [k, input.community.plugins.includes(k)])) as Record<PluginKey, boolean>;

    const userId = await this.db.tx(async () => {
      await this.settings.update(
        {
          'general.forumName': input.site.name,
          'general.forumDescription': input.site.description,
          'appearance.themeStyle': input.site.theme,
          'appearance.accentColor': input.site.accent.toLowerCase(),
          'appearance.defaultMode': input.site.mode,
          'registration.mode': input.community.registration,
          'plugins.enabled': plugins,
          'i18n.defaultLocale': locale,
          ...(input.mailFrom ? { 'email.fromAddress': input.mailFrom, 'email.fromName': input.site.name } : {}),
        },
        null,
        { allowHidden: true },
      );
      const user = await this.users.create({
        username: input.admin.username,
        displayName: input.admin.username,
        email: input.admin.email,
        passwordHash: await this.hasher.hash(input.admin.password),
        status: 'active',
        emailVerifiedAt: this.clock.now(),
        ip: client.ip,
        primaryGroupId: adminGroup.id,
        mustChangePassword: false,
      });
      await this.policies.acceptAllCurrent(user.id, client.ip);
      return user.id;
    });
    await this.groups.invalidate();

    if (input.mail && input.mail.driver !== 'env') await this.mail.saveTransport(input.mail, userId);

    // Örnek içerik: kategori ve bölümler (seçilmezse boş forum)
    const seeded = await this.db.q.selectFrom('system_state').select('key').where('key', '=', SEEDED_FORUM_KEY).executeTakeFirst();
    if (!seeded) {
      if (input.community.sampleContent) await this.forumSeed.seed((text) => this.i18n.t(locale, text));
      const now = this.clock.now();
      await this.db.q.insertInto('system_state').values({ key: SEEDED_FORUM_KEY, value: String(now), updated_at: now }).execute();
    }
    if (plugins.tickets) await this.tickets.ensureDefaults(userId);
    // Önceden (Türkçe) oluşturulmuş varsayılan içerik kurulum diline çevrilir
    await this.localizeSeeded(locale);
    for (const key of ['applications', 'tickets'] as const) if (plugins[key]) await this.appearance.ensureBuiltin(key);

    await this.markInstalled();
    this.code = null;
    try {
      if (existsSync(this.codeFile())) unlinkSync(this.codeFile());
    } catch {
      /* yok say */
    }

    const session = await this.sessions.create(userId, true, client.ip, client.userAgent);
    this.sessions.setCookie(res, session.token, true);
    // Şifre az önce belirlendi: yönetim paneli ilk açılışta yeniden doğrulama istemesin
    await this.sessions.elevate(session.session.id);
    await this.audit.log({ type: 'admin', action: 'install.complete', actorId: userId, ip: client.ip, data: { version: this.config.version, theme: input.site.theme, plugins: input.community.plugins } });
    this.logger.log(`Kurulum tamamlandı; yönetici: ${input.admin.username}`);
    return { userId };
  }
}

function generateCode(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

function normalize(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

function pretty(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
