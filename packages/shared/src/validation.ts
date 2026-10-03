import { z } from 'zod';
import { canonicalName } from './canonical.js';

const USERNAME_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N} _.-]*[\p{L}\p{N}])?$/u;
const REPEATED_SEPARATORS = /[ _.-]{2,}/;

export interface NameRules {
  minLength: number;
  maxLength: number;
}

export function usernameIssue(value: string, rules: NameRules): string | null {
  const v = value.trim();
  const len = [...v].length;
  if (len < rules.minLength) return `Kullanıcı adı en az ${rules.minLength} karakter olmalı.`;
  if (len > rules.maxLength) return `Kullanıcı adı en fazla ${rules.maxLength} karakter olabilir.`;
  if (!USERNAME_RE.test(v))
    return 'Kullanıcı adı harf veya rakamla başlayıp bitmeli; yalnızca harf, rakam, boşluk, _ . - içerebilir.';
  if (REPEATED_SEPARATORS.test(v)) return 'Kullanıcı adında ardışık boşluk veya noktalama kullanılamaz.';
  return null;
}

export function displayNameIssue(value: string): string | null {
  const v = value.trim();
  const len = [...v].length;
  if (len < 2) return 'Görünen ad en az 2 karakter olmalı.';
  if (len > 40) return 'Görünen ad en fazla 40 karakter olabilir.';
  if (/[\p{Cc}\p{Cf}]/u.test(v)) return 'Görünen ad kontrol karakteri içeremez.';
  if (/\s{2,}/.test(v)) return 'Görünen adda ardışık boşluk kullanılamaz.';
  return null;
}

export interface PasswordRules {
  minLength: number;
  requireMixed: boolean;
}

export function passwordIssue(password: string, rules: PasswordRules, username?: string): string | null {
  if (password.length < rules.minLength) return `Şifre en az ${rules.minLength} karakter olmalı.`;
  if (password.length > 256) return 'Şifre en fazla 256 karakter olabilir.';
  if (rules.requireMixed && !(/\p{L}/u.test(password) && /\p{N}/u.test(password)))
    return 'Şifre en az bir harf ve bir rakam içermeli.';
  if (username && canonicalName(password) === canonicalName(username))
    return 'Şifre kullanıcı adınızla aynı olamaz.';
  return null;
}

export function passwordStrength(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/\p{Ll}/u.test(password) && /\p{Lu}/u.test(password)) score++;
  if (/\p{N}/u.test(password)) score++;
  if (/[^\p{L}\p{N}]/u.test(password)) score++;
  return Math.min(4, score);
}

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı.')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Geçersiz tarih.');

export function ageOn(birthdate: string, now: Date): number {
  const [y, m, d] = birthdate.split('-').map(Number) as [number, number, number];
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d);
  if (beforeBirthday) age--;
  return age;
}

export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı.')
  .transform((s) => s.toLowerCase());

export const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((s) => s === '' || /^https?:\/\/[^\s]+$/i.test(s), 'Geçerli bir http(s) adresi girin.');

export const idParam = z.coerce.number().int().positive();

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});
export type Pagination = z.infer<typeof pagination>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
}
