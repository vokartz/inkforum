export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

export interface MailContext {
  forumName: string;
  appUrl: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function layout(ctx: MailContext, title: string, paragraphs: string[], action?: { label: string; url: string }): MailContent {
  const textParts = [...paragraphs];
  if (action) textParts.push(`${action.label}: ${action.url}`);
  textParts.push('', `— ${ctx.forumName}`, ctx.appUrl);

  const html = `<!doctype html>
<html lang="tr"><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Segoe UI,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e4e4e7">
<tr><td style="padding:24px 28px 8px;font-size:13px;color:#71717a">${escapeHtml(ctx.forumName)}</td></tr>
<tr><td style="padding:0 28px;font-size:20px;font-weight:600">${escapeHtml(title)}</td></tr>
<tr><td style="padding:12px 28px;font-size:15px;line-height:1.6">
${paragraphs.map((p) => `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`).join('\n')}
${
  action
    ? `<p style="margin:20px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 12px;font-size:12px;color:#71717a;word-break:break-all">Düğme çalışmazsa bu adresi tarayıcınıza yapıştırın:<br>${escapeHtml(action.url)}</p>`
    : ''
}
</td></tr>
<tr><td style="padding:16px 28px 24px;font-size:12px;color:#a1a1aa;border-top:1px solid #f4f4f5">Bu e-posta ${escapeHtml(ctx.forumName)} tarafından otomatik gönderildi.</td></tr>
</table></body></html>`;

  return { subject: `${title} — ${ctx.forumName}`, text: textParts.join('\n'), html };
}

export interface ComposeContext extends MailContext {
  accent: string;
  logoUrl: string | null;
  lang?: string;
  footer?: string;
}

export function fillVars(tpl: string, vars: Record<string, string>, html: boolean): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => {
    const val = vars[k] ?? '';
    return html ? escapeHtml(val) : val;
  });
}

export function htmlToText(html: string): string {
  const decode = (s: string) =>
    s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[e] ?? '');
  return decode(
    html
      .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
        const text = label.replace(/<[^>]+>/g, '').trim();
        return text && text !== href ? `${text}: ${href}` : href;
      })
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function composeMail(ctx: ComposeContext, subjectTpl: string, bodyTpl: string, vars: Record<string, string>): MailContent {
  const all = { forumName: ctx.forumName, forumUrl: ctx.appUrl, ...vars };
  const subject = fillVars(subjectTpl, all, false).replace(/[\r\n]+/g, ' ').trim();
  const accent = /^#[0-9a-f]{6}$/i.test(ctx.accent) ? ctx.accent : '#18181b';
  const accentText = (() => {
    const n = parseInt(accent.slice(1), 16);
    const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return lum > 0.22 ? '#141414' : '#ffffff';
  })();
  const body = fillVars(bodyTpl, all, true)
    .replace(/<a\b([^>]*)class="button"([^>]*)>/gi, `<a$1$2 style="display:inline-block;background:${accent};color:${accentText};text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">`)
    .replace(/<p\b([^>]*)class="muted"([^>]*)>/gi, '<p$1$2 style="margin:0 0 12px;font-size:13px;color:#71717a">')
    .replace(/<p>/gi, '<p style="margin:0 0 14px">');
  const brand = ctx.logoUrl
    ? `<img src="${escapeHtml(ctx.logoUrl)}" alt="${escapeHtml(ctx.forumName)}" style="max-height:36px;max-width:200px">`
    : `<span style="font-size:17px;font-weight:700;color:#18181b">${escapeHtml(ctx.forumName)}</span>`;
  const html = `<!doctype html>
<html lang="${escapeHtml(ctx.lang ?? 'tr')}"><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7">
<tr><td style="padding:22px 28px;border-bottom:1px solid #f4f4f5"><a href="${escapeHtml(ctx.appUrl)}" style="text-decoration:none">${brand}</a></td></tr>
<tr><td style="padding:22px 28px 10px;font-size:15px;line-height:1.6">
${body}
</td></tr>
<tr><td style="padding:14px 28px 22px;font-size:12px;color:#a1a1aa;border-top:1px solid #f4f4f5">${escapeHtml(ctx.footer ?? 'Bu e-posta {forum} tarafından otomatik gönderildi.').replace('{forum}', `<a href="${escapeHtml(ctx.appUrl)}" style="color:#a1a1aa">${escapeHtml(ctx.forumName)}</a>`)}</td></tr>
</table></body></html>`;
  return { subject, html, text: `${htmlToText(fillVars(bodyTpl, all, true))}\n\n— ${ctx.forumName}\n${ctx.appUrl}` };
}

export const MailTemplates = {
  verifyEmail(ctx: MailContext, p: { name: string; url: string; hours: number }) {
    return layout(
      ctx,
      'E-posta adresinizi doğrulayın',
      [
        `Merhaba ${p.name},`,
        `${ctx.forumName} hesabınızı etkinleştirmek için e-posta adresinizi doğrulamanız gerekiyor.`,
        `Bağlantı ${p.hours} saat boyunca geçerlidir. Bu kaydı siz yapmadıysanız bu e-postayı yok sayabilirsiniz.`,
      ],
      { label: 'E-postamı doğrula', url: p.url },
    );
  },

  passwordReset(ctx: MailContext, p: { name: string; url: string; minutes: number }) {
    return layout(
      ctx,
      'Şifre sıfırlama isteği',
      [
        `Merhaba ${p.name},`,
        'Hesabınız için bir şifre sıfırlama isteği aldık.',
        `Bağlantı ${p.minutes} dakika boyunca geçerlidir. Bu isteği siz yapmadıysanız şifreniz değişmeyecektir.`,
      ],
      { label: 'Yeni şifre belirle', url: p.url },
    );
  },

  passwordChanged(ctx: MailContext, p: { name: string }) {
    return layout(ctx, 'Şifreniz değiştirildi', [
      `Merhaba ${p.name},`,
      'Hesabınızın şifresi az önce değiştirildi ve diğer tüm oturumlarınız kapatıldı.',
      'Bu değişikliği siz yapmadıysanız hemen şifre sıfırlama isteyin ve yöneticilerle iletişime geçin.',
    ]);
  },

  emailChange(ctx: MailContext, p: { name: string; url: string; hours: number }) {
    return layout(
      ctx,
      'Yeni e-posta adresinizi onaylayın',
      [
        `Merhaba ${p.name},`,
        'Hesabınızın e-posta adresini bu adresle değiştirmek istediniz.',
        `Değişikliği tamamlamak için ${p.hours} saat içinde onaylayın.`,
      ],
      { label: 'E-posta değişikliğini onayla', url: p.url },
    );
  },

  emailChangedNotice(ctx: MailContext, p: { name: string; newEmail: string }) {
    return layout(ctx, 'E-posta adresiniz değiştirildi', [
      `Merhaba ${p.name},`,
      `Hesabınızın e-posta adresi ${p.newEmail} olarak değiştirildi.`,
      'Bu değişikliği siz yapmadıysanız hemen yöneticilerle iletişime geçin.',
    ]);
  },

  accountApproved(ctx: MailContext, p: { name: string; url: string }) {
    return layout(
      ctx,
      'Üyeliğiniz onaylandı',
      [`Merhaba ${p.name},`, `${ctx.forumName} üyeliğiniz yöneticiler tarafından onaylandı. Artık giriş yapabilirsiniz.`],
      { label: 'Giriş yap', url: p.url },
    );
  },

  accountRejected(ctx: MailContext, p: { name: string; reason: string | null }) {
    return layout(ctx, 'Üyelik başvurunuz reddedildi', [
      `Merhaba ${p.name},`,
      `${ctx.forumName} üyelik başvurunuz onaylanmadı.`,
      ...(p.reason ? [`Gerekçe: ${p.reason}`] : []),
    ]);
  },

  test(ctx: MailContext) {
    return layout(ctx, 'Test e-postası', [
      'Bu bir test e-postasıdır. Bunu okuyabiliyorsanız e-posta ayarlarınız doğru çalışıyor.',
    ]);
  },
};
