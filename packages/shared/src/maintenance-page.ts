import { z } from 'zod';

/**
 * Bakım modu sayfasının görünümü (Yönetim → Bakım → Bakım sayfası). Ziyaretçiye herkese açık ayar
 * olarak gider; özel HTML/CSS yalnızca `admin.customCode` yetkisiyle değiştirilebilir.
 */

export const MAINTENANCE_LAYOUTS = ['centered', 'card', 'split'] as const;
export const MAINTENANCE_ICONS = ['wrench', 'clock', 'rocket', 'hammer', 'logo', 'none'] as const;
export const MAINTENANCE_BACKGROUNDS = ['theme', 'color', 'gradient', 'image'] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı.');
const link = z.object({
  label: z.string().trim().min(1, 'Düğme yazısı gerekli.').max(40),
  url: z
    .string()
    .trim()
    .max(500)
    .regex(/^(\/|https?:\/\/|mailto:)/, 'Bağlantı /, http(s):// ya da mailto: ile başlamalı.'),
});

export const maintenancePageSchema = z.object({
  title: z.string().trim().max(120).default(''),
  layout: z.enum(MAINTENANCE_LAYOUTS).default('centered'),
  icon: z.enum(MAINTENANCE_ICONS).default('wrench'),
  background: z
    .object({
      kind: z.enum(MAINTENANCE_BACKGROUNDS).default('theme'),
      color: hex.default('#0f172a'),
      from: hex.default('#1e1b4b'),
      to: hex.default('#0f766e'),
      angle: z.number().int().min(0).max(360).default(135),
      image: z.string().trim().max(500).regex(/^(\/|https:\/\/|$)/, 'Görsel / ya da https:// ile başlamalı.').default(''),
      /** Görselin üstündeki karartma (%) */
      dim: z.number().int().min(0).max(90).default(55),
    })
    .prefault({}),
  /** Yazı rengi: auto = arka plana göre */
  text: z.enum(['auto', 'light', 'dark']).default('auto'),
  /** Geri sayım bitişi (ms); bitince sayfa kendini yeniler */
  endsAt: z.number().int().positive().nullable().default(null),
  /** İlerleme çubuğu (%) */
  progress: z.number().int().min(0).max(100).nullable().default(null),
  buttons: z.array(link).max(3).default([]),
  social: z.boolean().default(true),
  showLogin: z.boolean().default(true),
  /** Mesajın altına eklenen ham HTML (betik çalışabilir) */
  html: z.string().max(20_000).default(''),
  css: z.string().max(20_000).default(''),
});

export type MaintenancePage = z.output<typeof maintenancePageSchema>;
export const maintenancePageInput = maintenancePageSchema.extend({
  enabled: z.boolean(),
  message: z.string().trim().max(1000),
});
export type MaintenancePageInput = z.output<typeof maintenancePageInput>;

export const DEFAULT_MAINTENANCE_PAGE: MaintenancePage = maintenancePageSchema.parse({});
