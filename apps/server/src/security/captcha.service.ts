import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { captchaRequired, type CaptchaConfig, type CaptchaForm, type CaptchaSettingsInput } from '@forum/shared';
import { SettingsService } from '../settings/settings.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Clock, MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { CryptoService } from './crypto.service.js';

const VERIFY_URL: Record<'turnstile' | 'hcaptcha' | 'recaptcha', string> = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  hcaptcha: 'https://api.hcaptcha.com/siteverify',
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
};

/**
 * Giriş / kayıt / şifre sıfırlama formlarında isteğe bağlı captcha.
 * Yerleşik soru: cevap sunucuda imzalı belirtece gömülür (durum tutulmaz); kullanılan belirteçler
 * süreleri dolana kadar bellekte tutulur, aynı yanıt ikinci kez geçmez.
 */
@Injectable()
export class CaptchaService {
  private readonly used = new Map<string, number>();

  constructor(
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  config(): CaptchaConfig {
    return this.settings.get('captcha.config');
  }

  /** Yerleşik soru: "7 + 5 kaç eder?" */
  challenge(): { token: string; question: string } {
    const a = randomInt(2, 10);
    const b = randomInt(1, 10);
    const plus = randomInt(0, 2) === 0 || a <= b;
    const answer = plus ? a + b : a - b;
    const payload = Buffer.from(JSON.stringify({ e: this.clock.now() + 10 * MINUTE, n: this.crypto.token(9), h: this.crypto.sha256(`${answer}`) })).toString('base64url');
    return { token: `${payload}.${this.crypto.sign(payload)}`, question: `${a} ${plus ? '+' : '−'} ${b} = ?` };
  }

  /** Form gerektiriyorsa doğrular; geçmezse `captcha` alan hatası verir */
  async verify(form: CaptchaForm, response: string | undefined, ip: string | null): Promise<void> {
    const cfg = this.config();
    if (!captchaRequired(cfg, form)) return;
    if (!response) throw Errors.field('captcha', 'Doğrulamayı tamamlayın.');
    const ok = cfg.provider === 'builtin' ? this.verifyBuiltin(response) : await this.verifyRemote(cfg.provider as keyof typeof VERIFY_URL, response, ip, cfg.siteKey);
    if (!ok) throw Errors.field('captcha', 'Doğrulama başarısız oldu, tekrar deneyin.');
  }

  private verifyBuiltin(response: string): boolean {
    const [payload, sig, answer] = response.split(/[.|]/);
    if (!payload || !sig || answer === undefined || !this.crypto.safeEqual(this.crypto.sign(payload), sig)) return false;
    let data: { e: number; n: string; h: string };
    try {
      data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      return false;
    }
    const now = this.clock.now();
    for (const [k, exp] of this.used) if (exp < now) this.used.delete(k);
    if (data.e < now || this.used.has(data.n)) return false;
    this.used.set(data.n, data.e);
    const normalized = answer.trim().replace(/^\+/, '').replace(/^[−–]/, '-');
    return this.crypto.safeEqual(this.crypto.sha256(normalized), data.h);
  }

  private async verifyRemote(provider: keyof typeof VERIFY_URL, token: string, ip: string | null, siteKey: string): Promise<boolean> {
    const enc = this.settings.get('captcha.secretEnc');
    if (!enc) return true; // gizli anahtar yoksa captcha zaten istenmez (yönetim ekranı uyarır)
    try {
      const body = new URLSearchParams({ secret: this.crypto.decrypt(enc), response: token, ...(ip ? { remoteip: ip } : {}), ...(provider === 'hcaptcha' ? { sitekey: siteKey } : {}) });
      const res = await fetch(VERIFY_URL[provider], { method: 'POST', body, signal: AbortSignal.timeout(8000) });
      const json = (await res.json()) as { success?: boolean };
      return json.success === true;
    } catch {
      // Doğrulama servisine ulaşılamadı: üyeleri kilitlememek için geçirilir
      return true;
    }
  }

  async save(input: CaptchaSettingsInput, actorId: number): Promise<void> {
    const { secret, ...cfg } = input;
    const external = cfg.provider !== 'none' && cfg.provider !== 'builtin';
    if (external && !cfg.siteKey) throw Errors.field('siteKey', 'Site anahtarı gerekli.');
    if (external && !secret && !this.settings.get('captcha.secretEnc')) throw Errors.field('secret', 'Gizli anahtar gerekli.');
    const patch: Record<string, unknown> = { 'captcha.config': cfg };
    if (secret) patch['captcha.secretEnc'] = this.crypto.encrypt(secret);
    await this.settings.update(patch, actorId, { allowHidden: true });
    await this.audit.log({ type: 'admin', action: 'captcha.update', actorId, data: { provider: cfg.provider, forms: cfg.forms } });
  }

  adminView() {
    return { config: this.config(), hasSecret: !!this.settings.get('captcha.secretEnc') };
  }
}
