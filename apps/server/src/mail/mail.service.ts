import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { CONFIG, type AppConfig } from '../config/config.js';
import { JobsService } from '../jobs/jobs.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  MAIL_COMMON_VARS,
  MAIL_TEMPLATE_MAP,
  MAIL_TEMPLATES,
  type AdminMailTemplate,
  type AdminMailTransport,
  type MailTemplateKey,
  type MailTransportInput,
  type MailVerifyResult,
} from '@forum/shared';
import { I18nService } from '../i18n/i18n.service.js';
import type { Locale } from '@forum/shared';
import { CryptoService } from '../security/crypto.service.js';
import { composeMail, type ComposeContext, type MailContent, type MailContext } from './templates.js';
import { Db } from '../database/db.service.js';
import { CacheService } from '../cache/cache.service.js';

const MAIL_NS = 'mail';

export interface OutgoingMail extends MailContent {
  to: string;
}

const JOB = 'mail.send';

type Driver = 'log' | 'smtp' | 'sendmail';
type StoredTransport = { driver: 'env' | Driver; host: string; port: number; security: 'starttls' | 'tls' | 'none'; user: string; passwordEnc: string; allowSelfSigned: boolean };

/** nodemailer hata kodları → anlaşılır Türkçe açıklama */
export function explainMailError(err: unknown): { code: string | null; message: string } {
  const e = err as { code?: string; responseCode?: number; message?: string };
  const raw = e?.message ?? String(err);
  const code = e?.code ?? null;
  const hint =
    code === 'EAUTH'
      ? 'Kullanıcı adı veya şifre kabul edilmedi. Gmail/Outlook için normal şifre yerine "uygulama şifresi" gerekir.'
      : code === 'ETIMEDOUT' || code === 'ECONNECTION' || code === 'ESOCKET' || code === 'ECONNREFUSED'
        ? /certificate|self.signed|CERT/i.test(raw)
          ? 'TLS sertifikası doğrulanamadı. Sunucu kendinden imzalı sertifika kullanıyorsa ilgili seçeneği açın.'
          : 'Sunucuya bağlanılamadı. Adres, port ve güvenlik türünü (587 → STARTTLS, 465 → SSL/TLS) kontrol edin; barındırma firması SMTP portlarını engelliyor olabilir.'
        : code === 'EDNS' || /ENOTFOUND|getaddrinfo/i.test(raw)
          ? 'Sunucu adı bulunamadı; SMTP adresini kontrol edin.'
          : /wrong version number|ssl3_get_record/i.test(raw)
            ? 'Güvenlik türü porta uymuyor: 465 için SSL/TLS, 587 için STARTTLS seçin.'
            : null;
  return { code, message: hint ? `${hint} (${raw})` : raw };
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger('Mail');
  private transporter: Transporter | null = null;
  private transporterKey = '';
  /** log sürücüsünde son gönderilenler (testler ve admin paneli için). */
  readonly outbox: Array<OutgoingMail & { sentAt: number }> = [];

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly jobs: JobsService,
    private readonly settings: SettingsService,
    private readonly db: Db,
    private readonly cache: CacheService,
    private readonly crypto: CryptoService,
    private readonly i18n: I18nService,
  ) {}

  onModuleInit(): void {
    this.jobs.register<OutgoingMail>(JOB, (mail) => this.deliver(mail));
  }

  context(): MailContext {
    return { forumName: this.settings.get('general.forumName'), appUrl: this.config.appUrl };
  }

  url(path: string): string {
    return `${this.config.appUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  /** Kuyruğa ekler (transaction içindeyse commit sonrası gönderilir). */
  async send(to: string, content: MailContent): Promise<void> {
    await this.jobs.enqueue(JOB, { to, ...content }, { priority: 10, maxAttempts: 6 });
  }

  /** Doğrudan gönderir (admin test e-postası). */
  async deliver(mail: OutgoingMail): Promise<void> {
    const from = `"${this.settings.get('email.fromName').replace(/"/g, '')}" <${this.settings.get('email.fromAddress')}>`;

    if (this.driver() === 'log') {
      this.outbox.push({ ...mail, sentAt: Date.now() });
      if (this.outbox.length > 50) this.outbox.shift();
      if (!this.config.isTest) {
        const dir = join(this.config.storageDir, 'mail');
        mkdirSync(dir, { recursive: true });
        const safeTo = mail.to.replace(/[^a-z0-9@._-]/gi, '_');
        const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${safeTo}.eml`);
        writeFileSync(
          file,
          `From: ${from}\nTo: ${mail.to}\nSubject: ${mail.subject}\nContent-Type: text/plain; charset=utf-8\n\n${mail.text}\n`,
        );
        this.logger.log(`[log] ${mail.to} <- "${mail.subject}" (${file})`);
      }
      return;
    }

    const transporter = this.getTransporter();
    await transporter.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
  }

  // ---------- Gönderim ayarları (Yönetim → E-posta → Gönderim; "env" ise .env dosyası) ----------

  private stored(): StoredTransport {
    return this.settings.get('mail.transport') as StoredTransport;
  }

  /** Şu an kullanılan sürücü */
  driver(): Driver {
    const t = this.stored();
    return t.driver === 'env' ? this.config.mail.driver : t.driver;
  }

  private password(t: StoredTransport): string {
    if (!t.passwordEnc) return '';
    try {
      return this.crypto.decrypt(t.passwordEnc);
    } catch {
      return '';
    }
  }

  private build(t: StoredTransport, pass: string): Transporter {
    if (t.driver === 'env') {
      if (this.config.mail.driver === 'smtp') {
        if (!this.config.mail.smtpUrl) throw new Error('SMTP_URL ayarlanmamış.');
        return nodemailer.createTransport(this.config.mail.smtpUrl);
      }
      return nodemailer.createTransport({ sendmail: true, path: this.config.mail.sendmailPath, newline: 'unix' });
    }
    if (t.driver === 'sendmail') return nodemailer.createTransport({ sendmail: true, path: this.config.mail.sendmailPath, newline: 'unix' });
    return nodemailer.createTransport({
      host: t.host,
      port: t.port,
      secure: t.security === 'tls',
      requireTLS: t.security === 'starttls',
      ignoreTLS: t.security === 'none',
      auth: t.user ? { user: t.user, pass } : undefined,
      tls: { rejectUnauthorized: !t.allowSelfSigned },
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 30_000,
    });
  }

  private getTransporter(): Transporter {
    const t = this.stored();
    const key = JSON.stringify(t);
    if (this.transporter && this.transporterKey === key) return this.transporter;
    this.transporter?.close();
    this.transporter = this.build(t, this.password(t));
    this.transporterKey = key;
    return this.transporter;
  }

  adminTransport(): AdminMailTransport {
    const t = this.stored();
    return {
      driver: t.driver,
      host: t.host,
      port: t.port,
      security: t.security,
      user: t.user,
      hasPassword: !!t.passwordEnc,
      allowSelfSigned: t.allowSelfSigned,
      envDriver: this.config.mail.driver,
      effectiveDriver: this.driver(),
    };
  }

  private merge(input: MailTransportInput): StoredTransport {
    const prev = this.stored();
    // Yeni şifre yazılmadıysa kayıtlı olan yalnızca aynı sunucu, port ve kullanıcı için korunur;
    // aksi hâlde kayıtlı şifre başka bir sunucuya gönderilebilirdi (kimlik bilgisi sızıntısı).
    const same = prev.host === input.host && prev.port === input.port && prev.user === input.user;
    const passwordEnc = input.password?.trim() ? this.crypto.encrypt(input.password.trim()) : input.user && same ? prev.passwordEnc : '';
    return { driver: input.driver, host: input.host, port: input.port, security: input.security, user: input.user, passwordEnc, allowSelfSigned: input.allowSelfSigned };
  }

  async saveTransport(input: MailTransportInput, actorId: number): Promise<AdminMailTransport> {
    await this.settings.update({ 'mail.transport': this.merge(input) }, actorId, { allowHidden: true });
    return this.adminTransport();
  }

  /** Kaydetmeden bağlantıyı dener (SMTP oturum açma dahil). */
  async verify(input: MailTransportInput): Promise<MailVerifyResult> {
    const t = this.merge(input);
    const started = Date.now();
    if ((t.driver === 'env' ? this.config.mail.driver : t.driver) === 'log') {
      return { ok: true, code: null, ms: 0, message: 'Günlük modunda e-posta gönderilmez; storage/mail klasörüne yazılır.' };
    }
    let tr: Transporter | null = null;
    try {
      tr = this.build(t, this.password(t));
      await tr.verify();
      return { ok: true, code: null, ms: Date.now() - started, message: 'Bağlantı ve oturum açma başarılı.' };
    } catch (err) {
      return { ok: false, ms: Date.now() - started, ...explainMailError(err) };
    } finally {
      tr?.close();
    }
  }

  // ---------- Düzenlenebilir şablonlar ----------

  private overrides(): Promise<Map<string, { subject: string; body: string; updated_at: number }>> {
    return this.cache.wrap(MAIL_NS, 'templates', async () => {
      const rows = await this.db.q.selectFrom('mail_templates').selectAll().execute();
      return new Map(rows.map((r) => [r.key, r]));
    });
  }

  private composeContext(): ComposeContext {
    const logo = this.settings.get('appearance.logoUrl');
    return {
      ...this.context(),
      accent: this.settings.get('appearance.accentColor'),
      logoUrl: logo ? (logo.startsWith('http') ? logo : this.url(logo)) : null,
    };
  }

  /** Şablondan e-posta içeriği (yönetimde değiştirildiyse o sürüm). */
  async compose(key: MailTemplateKey, vars: Record<string, string | number | null | undefined>, locale?: Locale | string | null): Promise<MailContent> {
    const def = MAIL_TEMPLATE_MAP.get(key);
    if (!def) throw new Error(`Bilinmeyen e-posta şablonu: ${key}`);
    const custom = (await this.overrides()).get(key);
    const values = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]));
    // Alıcının dili: yönetimde özelleştirilmemiş şablonlar çevrilir
    const lang = this.i18n.resolve({ preference: locale });
    const subject = custom?.subject ?? this.i18n.t(lang, def.subject);
    const body = custom?.body ?? this.i18n.html(lang, def.body);
    return composeMail({ ...this.composeContext(), lang, footer: this.i18n.t(lang, 'Bu e-posta {forum} tarafından otomatik gönderildi.') }, subject, body, values);
  }

  /** Yönetim listesi: özelleştirilmemiş şablonlar yöneticinin dilinde gösterilir */
  async adminTemplates(locale?: Locale | null): Promise<AdminMailTemplate[]> {
    const custom = await this.overrides();
    const lang = this.i18n.resolve({ preference: locale });
    return MAIL_TEMPLATES.map((d) => {
      const c = custom.get(d.key);
      const defaultSubject = this.i18n.t(lang, d.subject);
      const defaultBody = this.i18n.html(lang, d.body);
      return { ...d, subject: c?.subject ?? defaultSubject, body: c?.body ?? defaultBody, isCustom: !!c, defaultSubject, defaultBody, updatedAt: c?.updated_at ?? null };
    });
  }

  async saveTemplate(key: MailTemplateKey, input: { subject: string; body: string }, actorId: number): Promise<void> {
    const now = Date.now();
    await this.db.q
      .insertInto('mail_templates')
      .values({ key, subject: input.subject, body: input.body, updated_by: actorId, updated_at: now })
      .onConflict((oc) => oc.column('key').doUpdateSet({ subject: input.subject, body: input.body, updated_by: actorId, updated_at: now }))
      .execute();
    await this.cache.invalidate(MAIL_NS);
  }

  async resetTemplate(key: MailTemplateKey): Promise<void> {
    await this.db.q.deleteFrom('mail_templates').where('key', '=', key).execute();
    await this.cache.invalidate(MAIL_NS);
  }

  /** Yönetim önizlemesi: örnek değerlerle. */
  preview(key: MailTemplateKey, subject: string, body: string, recipientName: string): MailContent {
    const def = MAIL_TEMPLATE_MAP.get(key)!;
    const sample = Object.fromEntries([...MAIL_COMMON_VARS, ...def.vars].map((v) => [v.key, v.sample]));
    return composeMail(this.composeContext(), subject, body, { ...sample, name: recipientName });
  }

  lastTo(to: string): OutgoingMail | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i--) if (this.outbox[i]!.to === to) return this.outbox[i];
    return undefined;
  }
}
