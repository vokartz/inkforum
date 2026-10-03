import { z } from 'zod';
import { EMOJI_SHORTCODE } from './bbcode/emoji.js';

export interface CustomEmoji {
  id: number;
  shortcode: string;
  name: string;
  category: string;
  url: string;
}

export interface AdminCustomEmoji extends CustomEmoji {
  isEnabled: boolean;
  sortOrder: number;
  createdAt: number;
}

export const emojiShortcodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((s) => s.replace(/^:|:$/g, ''))
  .pipe(z.string().regex(EMOJI_SHORTCODE, 'Kısa ad 2–32 karakter; yalnızca küçük harf, rakam, _ ve - olabilir.'));

export const emojiUpdateSchema = z.object({
  shortcode: emojiShortcodeSchema,
  name: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(40).default('Özel'),
  isEnabled: z.boolean().default(true),
});

export function shortcodeFromFilename(name: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (c) => map[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}
