import { z } from 'zod';

/**
 * Yönetimden düzenlenebilen e-posta şablonları. Gövde HTML'dir; `{{degisken}}` yer tutucuları
 * gönderimde (HTML kaçışlı) doldurulur. `<a class="button" href="…">` bağlantıları düğme olarak biçimlenir.
 */

export interface MailTemplateVar {
  key: string;
  label: string;
  sample: string;
}

export interface MailTemplateDef {
  key: MailTemplateKey;
  label: string;
  description: string;
  group: 'account' | 'notification';
  vars: MailTemplateVar[];
  subject: string;
  body: string;
}

export const MAIL_TEMPLATE_KEYS = [
  'verifyEmail',
  'welcome',
  'passwordReset',
  'passwordChanged',
  'emailChange',
  'emailChangedNotice',
  'accountApproved',
  'accountRejected',
  'notifyQuote',
  'notifyMention',
  'notifyReply',
  'notifyMessage',
] as const;
export type MailTemplateKey = (typeof MAIL_TEMPLATE_KEYS)[number];

/** Her şablonda kullanılabilen ortak değişkenler. */
export const MAIL_COMMON_VARS: MailTemplateVar[] = [
  { key: 'forumName', label: 'Forum adı', sample: 'Forum' },
  { key: 'forumUrl', label: 'Forum adresi', sample: 'https://forum.ornek.com' },
  { key: 'name', label: 'Alıcının görünen adı', sample: 'Ayşe' },
];

const v = (key: string, label: string, sample: string): MailTemplateVar => ({ key, label, sample });
const button = (label: string) => `<p><a class="button" href="{{url}}">${label}</a></p>`;

export const MAIL_TEMPLATES: MailTemplateDef[] = [
  {
    key: 'verifyEmail',
    label: 'E-posta doğrulama',
    description: 'Kayıttan sonra e-posta adresini doğrulama bağlantısı.',
    group: 'account',
    vars: [v('url', 'Doğrulama bağlantısı', 'https://forum.ornek.com/verify-email/…'), v('hours', 'Geçerlilik (saat)', '24')],
    subject: 'E-posta adresinizi doğrulayın — {{forumName}}',
    body: `<p>Merhaba {{name}},</p>
<p>{{forumName}} hesabınızı etkinleştirmek için e-posta adresinizi doğrulamanız gerekiyor.</p>
${button('E-postamı doğrula')}
<p class="muted">Bağlantı {{hours}} saat boyunca geçerlidir. Bu kaydı siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>`,
  },
  {
    key: 'welcome',
    label: 'Hoş geldin',
    description: 'Hesap etkinleştiğinde gönderilen karşılama e-postası.',
    group: 'account',
    vars: [v('url', 'Forum adresi', 'https://forum.ornek.com')],
    subject: '{{forumName}} topluluğuna hoş geldin!',
    body: `<p>Merhaba {{name}},</p>
<p>Aramıza hoş geldin! Hesabın hazır; kendini tanıtabilir, konulara katılabilir ve diğer üyelerle mesajlaşabilirsin.</p>
${button('Foruma git')}
<p class="muted">Kurallara göz atmayı unutma — iyi eğlenceler!</p>`,
  },
  {
    key: 'passwordReset',
    label: 'Şifre sıfırlama',
    description: '"Şifremi unuttum" isteğiyle gönderilen bağlantı.',
    group: 'account',
    vars: [v('url', 'Sıfırlama bağlantısı', 'https://forum.ornek.com/reset-password/…'), v('minutes', 'Geçerlilik (dakika)', '60')],
    subject: 'Şifre sıfırlama isteği — {{forumName}}',
    body: `<p>Merhaba {{name}},</p>
<p>Hesabınız için bir şifre sıfırlama isteği aldık.</p>
${button('Yeni şifre belirle')}
<p class="muted">Bağlantı {{minutes}} dakika boyunca geçerlidir. Bu isteği siz yapmadıysanız şifreniz değişmeyecektir.</p>`,
  },
  {
    key: 'passwordChanged',
    label: 'Şifre değişti',
    description: 'Şifre değiştirildiğinde güvenlik bildirimi.',
    group: 'account',
    vars: [],
    subject: 'Şifreniz değiştirildi — {{forumName}}',
    body: `<p>Merhaba {{name}},</p>
<p>Hesabınızın şifresi az önce değiştirildi ve diğer tüm oturumlarınız kapatıldı.</p>
<p>Bu değişikliği siz yapmadıysanız hemen şifre sıfırlama isteyin ve yöneticilerle iletişime geçin.</p>`,
  },
  {
    key: 'emailChange',
    label: 'E-posta değişikliği onayı',
    description: 'Yeni e-posta adresine gönderilen onay bağlantısı.',
    group: 'account',
    vars: [v('url', 'Onay bağlantısı', 'https://forum.ornek.com/confirm-email/…'), v('hours', 'Geçerlilik (saat)', '24')],
    subject: 'Yeni e-posta adresinizi onaylayın — {{forumName}}',
    body: `<p>Merhaba {{name}},</p>
<p>Hesabınızın e-posta adresini bu adresle değiştirmek istediniz. Onaylamak için düğmeye tıklayın.</p>
${button('Adresi onayla')}
<p class="muted">Bağlantı {{hours}} saat boyunca geçerlidir.</p>`,
  },
  {
    key: 'emailChangedNotice',
    label: 'E-posta değişti bildirimi',
    description: 'Eski adrese gönderilen güvenlik bildirimi.',
    group: 'account',
    vars: [v('newEmail', 'Yeni adres', 'yeni@ornek.com')],
    subject: 'E-posta adresiniz değiştirildi — {{forumName}}',
    body: `<p>Merhaba {{name}},</p>
<p>Hesabınızın e-posta adresi <b>{{newEmail}}</b> olarak değiştirildi.</p>
<p>Bu değişikliği siz yapmadıysanız hemen yöneticilerle iletişime geçin.</p>`,
  },
  {
    key: 'accountApproved',
    label: 'Üyelik onaylandı',
    description: 'Onay gerektiren kayıtlarda yönetici onayından sonra.',
    group: 'account',
    vars: [v('url', 'Giriş bağlantısı', 'https://forum.ornek.com/login')],
    subject: 'Üyeliğiniz onaylandı — {{forumName}}',
    body: `<p>Merhaba {{name}},</p>
<p>Üyeliğiniz yöneticiler tarafından onaylandı. Artık giriş yapabilirsiniz.</p>
${button('Giriş yap')}`,
  },
  {
    key: 'accountRejected',
    label: 'Üyelik reddedildi',
    description: 'Kayıt başvurusu reddedildiğinde.',
    group: 'account',
    vars: [v('reason', 'Ret nedeni (boş olabilir)', 'Bilgiler eksik.')],
    subject: 'Üyelik başvurunuz hakkında — {{forumName}}',
    body: `<p>Merhaba {{name}},</p>
<p>Üzgünüz, üyelik başvurunuz onaylanmadı.</p>
<p>{{reason}}</p>`,
  },
  {
    key: 'notifyQuote',
    label: 'Mesajın alıntılandı',
    description: 'Üyenin mesajı alıntılandığında (üye e-posta bildirimini açtıysa).',
    group: 'notification',
    vars: [v('actorName', 'Alıntılayan', 'Mehmet'), v('topicTitle', 'Konu', 'Yaz etkinliği'), v('url', 'Mesaj bağlantısı', 'https://forum.ornek.com/p/1'), v('settingsUrl', 'Bildirim ayarları', 'https://forum.ornek.com/settings/notifications')],
    subject: '{{actorName}} mesajını alıntıladı: {{topicTitle}}',
    body: `<p>Merhaba {{name}},</p>
<p><b>{{actorName}}</b>, <b>{{topicTitle}}</b> konusunda mesajını alıntıladı.</p>
${button('Mesajı gör')}
<p class="muted">Bu e-postaları <a href="{{settingsUrl}}">bildirim ayarlarından</a> kapatabilirsin.</p>`,
  },
  {
    key: 'notifyMention',
    label: 'Senden bahsedildi',
    description: 'Bir mesajda @bahsetme yapıldığında.',
    group: 'notification',
    vars: [v('actorName', 'Bahseden', 'Mehmet'), v('topicTitle', 'Konu', 'Yaz etkinliği'), v('url', 'Mesaj bağlantısı', 'https://forum.ornek.com/p/1'), v('settingsUrl', 'Bildirim ayarları', 'https://forum.ornek.com/settings/notifications')],
    subject: '{{actorName}} senden bahsetti: {{topicTitle}}',
    body: `<p>Merhaba {{name}},</p>
<p><b>{{actorName}}</b>, <b>{{topicTitle}}</b> konusunda senden bahsetti.</p>
${button('Mesajı gör')}
<p class="muted">Bu e-postaları <a href="{{settingsUrl}}">bildirim ayarlarından</a> kapatabilirsin.</p>`,
  },
  {
    key: 'notifyReply',
    label: 'Takip edilen konuya yanıt',
    description: 'Takip edilen konuya yeni yanıt geldiğinde (konu tekrar ziyaret edilene kadar bir kez).',
    group: 'notification',
    vars: [v('actorName', 'Yanıtlayan', 'Mehmet'), v('topicTitle', 'Konu', 'Yaz etkinliği'), v('url', 'Mesaj bağlantısı', 'https://forum.ornek.com/p/1'), v('settingsUrl', 'Bildirim ayarları', 'https://forum.ornek.com/settings/notifications')],
    subject: 'Yeni yanıt: {{topicTitle}}',
    body: `<p>Merhaba {{name}},</p>
<p><b>{{actorName}}</b>, takip ettiğin <b>{{topicTitle}}</b> konusuna yanıt yazdı.</p>
${button('Yanıtı oku')}
<p class="muted">Konuyu ziyaret edene kadar bu konu için başka e-posta gönderilmez. <a href="{{settingsUrl}}">Bildirim ayarları</a></p>`,
  },
  {
    key: 'notifyMessage',
    label: 'Yeni özel mesaj',
    description: 'Özel mesaj alındığında (konuşma okunana kadar bir kez).',
    group: 'notification',
    vars: [v('actorName', 'Gönderen', 'Mehmet'), v('title', 'Konuşma başlığı', 'Cumartesi etkinliği'), v('url', 'Konuşma bağlantısı', 'https://forum.ornek.com/messages/1'), v('settingsUrl', 'Bildirim ayarları', 'https://forum.ornek.com/settings/notifications')],
    subject: '{{actorName}} sana mesaj gönderdi',
    body: `<p>Merhaba {{name}},</p>
<p><b>{{actorName}}</b> sana bir özel mesaj gönderdi: <b>{{title}}</b></p>
${button('Mesajı oku')}
<p class="muted"><a href="{{settingsUrl}}">Bildirim ayarları</a></p>`,
  },
];

export const MAIL_TEMPLATE_MAP = new Map(MAIL_TEMPLATES.map((t) => [t.key, t]));

export const mailTemplateSchema = z.object({
  subject: z.string().trim().min(1, 'Konu gerekli.').max(200),
  body: z.string().trim().min(1, 'İçerik gerekli.').max(50_000),
});

export interface AdminMailTemplate extends MailTemplateDef {
  /** Yönetimde değiştirilmiş mi */
  isCustom: boolean;
  defaultSubject: string;
  defaultBody: string;
  updatedAt: number | null;
}

/** Üyenin e-postayla da almak isteyebileceği bildirim türleri ve varsayılanları. */
export const EMAIL_NOTIFICATION_DEFAULTS: Record<string, boolean> = {
  'forum.quote': true,
  'forum.mention': true,
  'forum.reply': true,
  'message.new': true,
};

// ---------- Gönderim (SMTP) ayarları ----------

export const MAIL_DRIVERS = ['env', 'smtp', 'sendmail', 'log'] as const;
export type MailDriverChoice = (typeof MAIL_DRIVERS)[number];
export const SMTP_SECURITY = ['starttls', 'tls', 'none'] as const;

export const mailTransportInput = z
  .object({
    driver: z.enum(MAIL_DRIVERS),
    host: z.string().trim().max(200).default(''),
    port: z.number().int().min(1, 'Geçersiz port.').max(65535, 'Geçersiz port.').default(587),
    security: z.enum(SMTP_SECURITY).default('starttls'),
    user: z.string().trim().max(200).default(''),
    /** Boş bırakılırsa kayıtlı şifre korunur */
    password: z.string().max(500).optional(),
    allowSelfSigned: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.driver === 'smtp' && !/^[a-z0-9.-]+$/i.test(v.host)) ctx.addIssue({ code: 'custom', path: ['host'], message: 'Geçerli bir SMTP sunucusu girin (ör. smtp.gmail.com).' });
  });
export type MailTransportInput = z.output<typeof mailTransportInput>;

export interface AdminMailTransport {
  driver: MailDriverChoice;
  host: string;
  port: number;
  security: (typeof SMTP_SECURITY)[number];
  user: string;
  hasPassword: boolean;
  allowSelfSigned: boolean;
  /** .env dosyasındaki sürücü (driver = env iken kullanılır) */
  envDriver: 'log' | 'smtp' | 'sendmail';
  /** Şu an gerçekten kullanılan sürücü */
  effectiveDriver: 'log' | 'smtp' | 'sendmail';
}

export interface MailVerifyResult {
  ok: boolean;
  message: string;
  /** Hata kodu (EAUTH, ETIMEDOUT…) */
  code: string | null;
  ms: number;
}
