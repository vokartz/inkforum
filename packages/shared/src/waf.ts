import { z } from 'zod';

export const WAF_MODES = ['off', 'suspicious', 'all'] as const;
export type WafMode = (typeof WAF_MODES)[number];
export const WAF_MODE_INFO: Record<WafMode, { label: string; description: string }> = {
  off: { label: 'Doğrulama yok', description: 'Yalnızca kurallar (saldırı kalıpları, hız sınırı, engelli IP ve botlar) uygulanır.' },
  suspicious: { label: 'Şüphelilere doğrulama', description: 'Kurala takılan, çok hızlı istek atan ya da tarayıcı olmayan ziyaretçiler doğrulama sayfasına yönlendirilir.' },
  all: { label: 'Herkese doğrulama', description: 'Saldırı altındayken: her yeni ziyaretçi önce doğrulama sayfasından geçer (üyeler ve arama motorları hariç).' },
};

export const WAF_CAPTCHAS = ['builtin', 'turnstile', 'hcaptcha'] as const;
export type WafCaptcha = (typeof WAF_CAPTCHAS)[number];
export const WAF_CAPTCHA_INFO: Record<WafCaptcha, { label: string; description: string }> = {
  builtin: { label: 'Yerleşik doğrulama', description: 'Dış servis gerekmez: tarayıcı kısa bir hesaplama yapar (bot ve betikleri eler).' },
  turnstile: { label: 'Cloudflare Turnstile', description: 'Ücretsiz; çoğu ziyaretçi hiçbir şey çözmeden geçer. Site ve gizli anahtar gerekir.' },
  hcaptcha: { label: 'hCaptcha', description: 'Görsel doğrulama. Site ve gizli anahtar gerekir.' },
};

const ipOrRange = z
  .string()
  .trim()
  .max(64)
  .regex(/^[0-9a-f.:]+(\/\d{1,3})?$/i, 'Geçersiz IP ya da aralık (ör. 1.2.3.4 veya 1.2.3.0/24).');

export const wafConfigInput = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(WAF_MODES).default('suspicious'),
  captcha: z.enum(WAF_CAPTCHAS).default('builtin'),
  siteKey: z.string().trim().max(200).default(''),
  secretKey: z.string().trim().max(200).optional(),
  title: z.string().trim().min(1).max(120).default('Bağlantınız kontrol ediliyor'),
  message: z.string().trim().max(600).default('Siteyi saldırılara karşı korumak için tarayıcınızı doğruluyoruz. Bu işlem birkaç saniye sürer.'),
  buttonLabel: z.string().trim().min(1).max(40).default('Devam et'),
  clearanceHours: z.number().int().min(1).max(720).default(24),
  rateLimitPerMinute: z.number().int().min(30).max(10_000).default(300),
  blockPatterns: z.boolean().default(true),
  allowSearchBots: z.boolean().default(true),
  allowIps: z.array(ipOrRange).max(200).default([]),
  blockIps: z.array(ipOrRange).max(1000).default([]),
  blockUserAgents: z.array(z.string().trim().min(2).max(100)).max(100).default(['sqlmap', 'nikto', 'masscan', 'zgrab', 'nmap', 'acunetix', 'nuclei', 'dirbuster', 'gobuster', 'wpscan']),
});
export type WafConfigInput = z.output<typeof wafConfigInput>;

export interface WafEvent {
  at: number;
  ip: string;
  action: 'block' | 'challenge' | 'pass' | 'ratelimit';
  reason: string;
  path: string;
  ua: string;
}

export interface AdminWaf {
  config: Omit<WafConfigInput, 'secretKey'> & { hasSecret: boolean };
  stats: { blocked24h: number; challenged24h: number; passed24h: number; rateLimited24h: number; activeBlocks: Array<{ ip: string; until: number; reason: string }> };
  events: WafEvent[];
  forcedOff: boolean;
}
