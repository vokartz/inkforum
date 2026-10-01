import { z } from 'zod';
import type { UserSummary } from './dto.js';
import { EMOJI_RE } from './bbcode/emoji.js';

/** Tepki tanımı (yönetimden düzenlenir). */
export interface ReactionDef {
  id: number;
  key: string;
  label: string;
  /** Unicode emoji; görseli `/emoji/<emojiCode(emoji)>.svg` */
  emoji: string;
  /** Mesaj sahibine kazandırdığı itibar (eksi olabilir) */
  points: number;
}

export interface AdminReaction extends ReactionDef {
  isEnabled: boolean;
  /** Bu tepkiyle verilmiş toplam tepki */
  uses: number;
}

/** Mesajdaki tepki özeti */
export interface PostReactionCount {
  reactionId: number;
  count: number;
}

/** Tepki verenler listesi */
export interface ReactionUserItem {
  user: UserSummary;
  reactionId: number;
  at: number;
}

export const reactSchema = z.object({ reactionId: z.number().int().positive() });

const oneEmoji = z
  .string()
  .trim()
  .min(1, 'Emoji gerekli.')
  .max(32)
  .refine((v) => (v.match(EMOJI_RE) ?? []).join('') === v && (v.match(EMOJI_RE) ?? []).length === 1, 'Tek bir emoji seçin.');

export const reactionsAdminSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.number().int().positive().optional(),
        key: z
          .string()
          .trim()
          .regex(/^[a-z0-9_]{2,30}$/, 'Anahtar küçük harf, rakam ve _ olmalı (2-30).'),
        label: z.string().trim().min(1, 'Ad gerekli.').max(30),
        emoji: oneEmoji,
        points: z.number().int().min(-5).max(5).default(1),
        isEnabled: z.boolean().default(true),
      }),
    )
    .min(1, 'En az bir tepki olmalı.')
    .max(20),
});
export type ReactionsAdminInput = z.output<typeof reactionsAdminSchema>;
