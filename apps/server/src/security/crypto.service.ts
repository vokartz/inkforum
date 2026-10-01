import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config/config.js';

@Injectable()
export class CryptoService {
  private readonly encKey: Buffer;

  constructor(@Inject(CONFIG) config: AppConfig) {
    this.encKey = Buffer.from(hkdfSync('sha256', config.secret, 'forum-salt', 'forum:aes-gcm:v1', 32));
  }

  /** URL-güvenli rastgele belirteç. */
  token(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${enc.toString('base64url')}.${tag.toString('base64url')}`;
  }

  decrypt(payload: string): string {
    const [v, iv, enc, tag] = payload.split('.');
    if (v !== 'v1' || !iv || !enc || !tag) throw new Error('Geçersiz şifreli veri.');
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(enc, 'base64url')), decipher.final()]).toString('utf8');
  }

  /** Okunması kolay kurtarma kodu: xxxxx-xxxxx */
  recoveryCode(): string {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    const bytes = randomBytes(10);
    let out = '';
    for (let i = 0; i < 10; i++) {
      out += alphabet[bytes[i]! % alphabet.length];
      if (i === 4) out += '-';
    }
    return out;
  }

  /** Rastgele okunabilir şifre (ilk admin için). */
  password(length = 16): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const bytes = randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length];
    return /\d/.test(out) ? out : `${out.slice(0, -1)}7`;
  }
}
