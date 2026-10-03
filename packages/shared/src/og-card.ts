import { z } from 'zod';

export const OG_LAYOUTS = ['classic', 'centered', 'split', 'minimal'] as const;
export const OG_BACKGROUNDS = ['dark', 'light', 'color', 'gradient', 'image'] as const;
export const OG_PATTERNS = ['none', 'dots', 'grid', 'lines'] as const;
export const OG_FONTS = ['sans', 'serif', 'mono'] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı.');

export const ogCardSchema = z.object({
  layout: z.enum(OG_LAYOUTS).default('classic'),
  background: z
    .object({
      kind: z.enum(OG_BACKGROUNDS).default('dark'),
      color: hex.default('#111827'),
      from: hex.default('#1e1b4b'),
      to: hex.default('#0f766e'),
      angle: z.number().int().min(0).max(360).default(135),
      image: z.string().trim().max(500).regex(/^(\/uploads\/[\w./-]+|)$/, 'Görsel bu foruma yüklenmiş olmalı.').default(''),
      dim: z.number().int().min(0).max(90).default(55),
    })
    .prefault({}),
  accent: z.union([hex, z.literal('')]).default(''),
  text: z.enum(['auto', 'light', 'dark']).default('auto'),
  font: z.enum(OG_FONTS).default('sans'),
  pattern: z.enum(OG_PATTERNS).default('none'),
  glow: z.boolean().default(true),
  logo: z.boolean().default(true),
  kicker: z.boolean().default(true),
  meta: z.boolean().default(true),
  footer: z.string().trim().max(60).default(''),
  embedColor: z.union([hex, z.literal('')]).default(''),
});
export type OgCard = z.output<typeof ogCardSchema>;
export const DEFAULT_OG_CARD: OgCard = ogCardSchema.parse({});

export const ogPreviewInput = z.object({ card: ogCardSchema, sample: z.enum(['topic', 'site', 'board']).default('topic') });
