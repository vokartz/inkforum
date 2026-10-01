import { z } from 'zod';
import { optionalUrl } from '@forum/shared';

export const privacySchema = z.object({
  showOnline: z.boolean().default(true),
  birthdateVisibility: z.enum(['none', 'day_month', 'full']).default('day_month'),
  profileVisibility: z.enum(['everyone', 'members']).default('everyone'),
  showAchievements: z.boolean().default(true),
  /** Kimler özel mesaj gönderebilir (yönetim ve moderatörler her zaman gönderebilir) */
  allowMessages: z.enum(['everyone', 'nobody']).default('everyone'),
});
export type Privacy = z.infer<typeof privacySchema>;
export const DEFAULT_PRIVACY: Privacy = privacySchema.parse({});

export const profileUpdateSchema = z.object({
  bio: z.string().max(10000).default(''),
  location: z.string().trim().max(80).default(''),
  websiteUrl: optionalUrl.default(''),
  birthdate: z.string().trim().default(''),
  customTitle: z.string().trim().max(100).optional(),
  customFields: z.record(z.string(), z.union([z.string(), z.boolean()])).default({}),
});

export const signatureSchema = z.object({
  signature: z.string().max(10000),
});

export const preferencesSchema = z.object({
  timezone: z
    .string()
    .trim()
    .max(64)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('tr-TR', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'Geçersiz saat dilimi.'),
  theme: z.enum(['system', 'light', 'dark']),
});

export const usernameChangeSchema = z.object({
  username: z.string().trim().min(1).max(50),
});

export const displayNameChangeSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
});

export const emailChangeSchema = z.object({
  email: z.email('Geçerli bir e-posta adresi girin.').max(254),
  password: z.string().min(1, 'Şifrenizi girin.').max(256),
});

export const memberListSchema = z.object({
  q: z.string().trim().max(50).default(''),
  group: z.coerce.number().int().positive().optional(),
  sort: z.enum(['registered', 'name', 'posts', 'active', 'achievements']).default('registered'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
});
