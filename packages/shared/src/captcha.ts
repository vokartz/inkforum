import { z } from 'zod';

/**
 * Giriş, kayıt ve şifre sıfırlama formlarında isteğe bağlı doğrulama (captcha).
 *  - builtin   : dış servis gerektirmeyen basit soru (sunucuda imzalanır)
 *  - turnstile : Cloudflare Turnstile
 *  - hcaptcha  : hCaptcha
 *  - recaptcha : Google reCAPTCHA v2 ("Ben robot değilim")
 */
export const CAPTCHA_PROVIDERS = ['none', 'builtin', 'turnstile', 'hcaptcha', 'recaptcha'] as const;
export type CaptchaProvider = (typeof CAPTCHA_PROVIDERS)[number];
export const CAPTCHA_FORMS = ['register', 'login', 'forgot'] as const;
export type CaptchaForm = (typeof CAPTCHA_FORMS)[number];

/** Herkese açık yapılandırma (site anahtarı tarayıcıya gider; gizli anahtar ayrı saklanır) */
export const captchaConfigSchema = z.object({
  provider: z.enum(CAPTCHA_PROVIDERS).default('none'),
  siteKey: z.string().trim().max(200).default(''),
  forms: z
    .object({ register: z.boolean().default(true), login: z.boolean().default(false), forgot: z.boolean().default(true) })
    .prefault({}),
});
export type CaptchaConfig = z.output<typeof captchaConfigSchema>;
export const DEFAULT_CAPTCHA_CONFIG: CaptchaConfig = captchaConfigSchema.parse({});

export const captchaSettingsInput = captchaConfigSchema.extend({
  /** Boş = değiştirme (kayıtlı anahtar korunur) */
  secret: z.string().trim().max(500).default(''),
});
export type CaptchaSettingsInput = z.output<typeof captchaSettingsInput>;

/** Form gönderiminde captcha yanıtı (dış servis belirteci ya da "imza|cevap") */
export const captchaField = z.string().max(4096).optional();

export function captchaRequired(cfg: CaptchaConfig | null | undefined, form: CaptchaForm): boolean {
  if (!cfg || cfg.provider === 'none') return false;
  if (cfg.provider !== 'builtin' && !cfg.siteKey) return false;
  return cfg.forms[form] === true;
}

/** Sağlayıcıların tarayıcı betiği ve CSP kaynakları */
export const CAPTCHA_SCRIPTS: Record<Exclude<CaptchaProvider, 'none' | 'builtin'>, { src: string; csp: { script: string[]; connect: string[]; style: string[] } }> = {
  turnstile: { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', csp: { script: ['https://challenges.cloudflare.com'], connect: [], style: [] } },
  hcaptcha: {
    src: 'https://js.hcaptcha.com/1/api.js?render=explicit',
    csp: { script: ['https://js.hcaptcha.com', 'https://*.hcaptcha.com'], connect: ['https://*.hcaptcha.com'], style: ['https://*.hcaptcha.com'] },
  },
  recaptcha: { src: 'https://www.google.com/recaptcha/api.js?render=explicit', csp: { script: ['https://www.google.com', 'https://www.gstatic.com'], connect: [], style: [] } },
};
