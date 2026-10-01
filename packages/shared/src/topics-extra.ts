import { z } from 'zod';
import type { UserSummary } from './dto.js';
import type { Paginated } from './validation.js';
import type { UnreadTopicItem } from './forum.js';

// ---------- Etiketler ----------

export interface TopicTag {
  id: number;
  name: string;
  slug: string;
  color: string | null;
}

export interface TagSummary extends TopicTag {
  topicCount: number;
  isOfficial: boolean;
}

/** Etiket adı: harf, rakam, boşluk, tire ve nokta (Türkçe karakterler serbest). */
export const tagNameSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\s+/g, ' ').replace(/^#/, ''))
  .pipe(
    z
      .string()
      .min(2, 'Etiket en az 2 karakter olmalı.')
      .max(24, 'Etiket en fazla 24 karakter olabilir.')
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} .+#-]*$/u, 'Etiket yalnızca harf, rakam, boşluk ve tire içerebilir.'),
  );

export const tagsInputSchema = z.array(tagNameSchema).max(10, 'En fazla 10 etiket.').default([]);

/** Etiket adresi: Türkçe karakterler sadeleştirilir. */
export function tagSlug(name: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  return name
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => map[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\+/g, '-plus')
    .replace(/#/g, '-sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export interface TagPage {
  tag: TagSummary;
  topics: Paginated<UnreadTopicItem>;
  related: TopicTag[];
}

export interface TopicViewerItem {
  user: UserSummary;
  views: number;
  firstAt: number;
  lastAt: number;
}

export const adminTagSchema = z.object({
  name: tagNameSchema,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
  isOfficial: z.boolean().default(false),
});

// ---------- Anketler ----------

export const POLL_SHOW_RESULTS = ['always', 'after_vote', 'after_close'] as const;
export type PollShowResults = (typeof POLL_SHOW_RESULTS)[number];
export const POLL_SHOW_RESULTS_LABELS: Record<PollShowResults, string> = {
  always: 'Her zaman',
  after_vote: 'Oy verdikten sonra',
  after_close: 'Anket kapanınca',
};

export const pollInputSchema = z
  .object({
    question: z.string().trim().min(3, 'Soru en az 3 karakter olmalı.').max(200),
    options: z
      .array(z.string().trim().min(1, 'Seçenek boş olamaz.').max(120))
      .min(2, 'En az 2 seçenek ekleyin.')
      .max(20, 'En fazla 20 seçenek.'),
    maxChoices: z.number().int().min(1).max(20).default(1),
    allowChange: z.boolean().default(true),
    publicVotes: z.boolean().default(false),
    showResults: z.enum(POLL_SHOW_RESULTS).default('always'),
    closesAt: z.number().int().nullable().default(null),
  })
  .superRefine((p, ctx) => {
    if (p.maxChoices > p.options.length) ctx.addIssue({ code: 'custom', path: ['maxChoices'], message: 'Seçilebilecek sayı, seçenek sayısından fazla olamaz.' });
    const seen = new Set<string>();
    p.options.forEach((o, i) => {
      const k = o.toLocaleLowerCase('tr-TR');
      if (seen.has(k)) ctx.addIssue({ code: 'custom', path: ['options', i], message: 'Aynı seçenek iki kez yazılmış.' });
      seen.add(k);
    });
  });
export type PollInput = z.output<typeof pollInputSchema>;

export const pollVoteSchema = z.object({ optionIds: z.array(z.number().int().positive()).min(1, 'Bir seçenek seçin.').max(20) });

export interface PollOptionView {
  id: number;
  label: string;
  /** Sonuçlar gizliyse null */
  votes: number | null;
}

export interface PollView {
  id: number;
  question: string;
  maxChoices: number;
  allowChange: boolean;
  publicVotes: boolean;
  showResults: PollShowResults;
  closesAt: number | null;
  closed: boolean;
  voterCount: number;
  options: PollOptionView[];
  myVotes: number[];
  can: { vote: boolean; seeResults: boolean; manage: boolean };
}

export interface PollVoter {
  optionId: number;
  user: UserSummary;
  at: number;
}

/** Konu sayfasının altındaki gezinme: benzer konular ve sonraki okunmamış konu. */
export interface TopicRelated {
  similar: UnreadTopicItem[];
  nextUnread: { id: number; title: string; slug: string } | null;
  board: { id: number; name: string; slug: string };
}
