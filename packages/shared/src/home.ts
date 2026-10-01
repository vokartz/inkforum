import { z } from 'zod';
import type { IconNode } from './forum.js';
import { ICON_NAME } from './forum.js';

/**
 * Ana sayfa blokları: yönetim panelinden eklenen duyurular, görsel kartlar, serbest içerik ve
 * yan sütun bileşenleri. Kategoriler listesi sabittir; bloklar onun üstüne, yanına ve altına yerleşir.
 */
export const HOME_POSITIONS = ['top', 'sidebar', 'bottom'] as const;
export type HomePosition = (typeof HOME_POSITIONS)[number];

export const HOME_BLOCK_KINDS = ['announcement', 'tiles', 'text', 'html', 'recent', 'stats', 'online', 'birthdays', 'discord'] as const;
export type HomeBlockKind = (typeof HOME_BLOCK_KINDS)[number];

/** Yönetim panelindeki blok türü açıklamaları */
export const HOME_BLOCK_INFO: Record<HomeBlockKind, { label: string; description: string; icon: string }> = {
  announcement: { label: 'Duyuru şeridi', description: 'Renkli, ikonlu kısa duyuru; kapatılabilir ve tarih aralığına bağlanabilir.', icon: 'megaphone' },
  tiles: { label: 'Görsel kartlar', description: 'Fotoğraflı, yan yana kareler (sunucu, etkinlik, bağlantı vitrinleri).', icon: 'squares-four' },
  text: { label: 'Serbest içerik', description: 'BBCode ile başlık, metin, görsel ve gömülü video.', icon: 'text-align-left' },
  html: { label: 'Özel HTML', description: 'Kendi HTML / CSS / JavaScript kodun (sunucu durumu, UCP kutusu, sayaç…). "Özel kod" yetkisi gerekir.', icon: 'code' },
  recent: { label: 'Son hareketler', description: 'En son yanıt alan konular.', icon: 'lightning' },
  stats: { label: 'İstatistikler', description: 'Konu, mesaj ve üye sayıları.', icon: 'chart-line-up' },
  online: { label: 'Çevrimiçi üyeler', description: 'Şu an forumda olanlar.', icon: 'broadcast' },
  birthdays: { label: 'Doğum günleri', description: 'Bugün doğum günü olan üyeler (yoksa gizlenir).', icon: 'cake' },
  discord: { label: 'Discord sunucusu', description: 'Discord sunucunuzun çevrimiçi sayısı ve katıl düğmesi ("Discord entegrasyonu" eklentisi).', icon: 'discord-logo' },
};

/** Eklentiye bağlı bloklar: eklenti kapalıyken eklenemez ve gösterilmez */
export const HOME_BLOCK_PLUGIN: Partial<Record<HomeBlockKind, 'discord'>> = { discord: 'discord' };

export const ANNOUNCEMENT_STYLES = ['accent', 'info', 'success', 'warning', 'danger', 'neutral'] as const;
export type AnnouncementStyle = (typeof ANNOUNCEMENT_STYLES)[number];

const linkUrl = z
  .string()
  .trim()
  .max(500)
  .regex(/^(https?:\/\/|\/|mailto:)/i, 'Adres http(s)://, / ya da mailto: ile başlamalı.');
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .regex(/^(\/uploads\/|https:\/\/)/i, 'Görsel yüklenmeli ya da https:// adresi olmalı.');

export const announcementConfig = z.object({
  text: z.string().trim().min(1, 'Duyuru metni gerekli.').max(2000),
  style: z.enum(ANNOUNCEMENT_STYLES).default('accent'),
  icon: z.string().trim().regex(ICON_NAME).max(60).nullable().default('megaphone'),
  linkUrl: linkUrl.nullable().default(null),
  linkLabel: z.string().trim().max(40).nullable().default(null),
  dismissible: z.boolean().default(true),
});

export const tileItem = z.object({
  image: imageUrl.nullable().default(null),
  title: z.string().trim().max(60).default(''),
  subtitle: z.string().trim().max(120).default(''),
  url: linkUrl.nullable().default(null),
  newTab: z.boolean().default(false),
});

export const tilesConfig = z.object({
  columns: z.number().int().min(1).max(4).default(3),
  height: z.enum(['sm', 'md', 'lg']).default('md'),
  items: z.array(tileItem).min(1, 'En az bir kart ekleyin.').max(12),
});

export const textConfig = z.object({
  body: z.string().max(20000).default(''),
  /** Kart içinde göster (kapalıysa arka plansız) */
  boxed: z.boolean().default(true),
});

export const htmlConfig = z.object({
  html: z.string().max(100_000, 'En fazla 100.000 karakter.').default(''),
  boxed: z.boolean().default(true),
});

export const widgetConfig = z.object({
  limit: z.number().int().min(1).max(20).default(5),
});

const blockBase = z.object({
  id: z.number().int().positive().optional(),
  position: z.enum(HOME_POSITIONS),
  title: z.string().trim().max(80).nullable().default(null),
  visibility: z.enum(['all', 'members', 'guests']).default('all'),
  isEnabled: z.boolean().default(true),
  startsAt: z.number().int().nullable().default(null),
  endsAt: z.number().int().nullable().default(null),
});

export const homeBlockInput = z.discriminatedUnion('kind', [
  blockBase.extend({ kind: z.literal('announcement'), config: announcementConfig }),
  blockBase.extend({ kind: z.literal('tiles'), config: tilesConfig }),
  blockBase.extend({ kind: z.literal('text'), config: textConfig }),
  blockBase.extend({ kind: z.literal('html'), config: htmlConfig }),
  blockBase.extend({ kind: z.literal('recent'), config: widgetConfig.default({ limit: 5 }) }),
  blockBase.extend({ kind: z.literal('stats'), config: z.object({}).default({}) }),
  blockBase.extend({ kind: z.literal('online'), config: z.object({}).default({}) }),
  blockBase.extend({ kind: z.literal('birthdays'), config: z.object({}).default({}) }),
  blockBase.extend({ kind: z.literal('discord'), config: z.object({}).default({}) }),
]);
export type HomeBlockInput = z.output<typeof homeBlockInput>;

export const homeLayoutSchema = z.object({ blocks: z.array(homeBlockInput).max(60) });
export type HomeLayoutInput = z.output<typeof homeLayoutSchema>;

export type AnnouncementConfig = z.output<typeof announcementConfig>;
export type TilesConfig = z.output<typeof tilesConfig>;
export type TextConfig = z.output<typeof textConfig>;

/** Yönetim paneli: kayıtlı blok */
export type AdminHomeBlock = HomeBlockInput & { id: number; updatedAt: number };

/** Ziyaretçiye gönderilen blok (metinler sunucuda HTML'e çevrilmiş). */
export type HomeBlock =
  | { id: number; kind: 'announcement'; title: string | null; key: string; html: string; style: AnnouncementStyle; icon: IconNode | null; linkUrl: string | null; linkLabel: string | null; dismissible: boolean }
  | { id: number; kind: 'tiles'; title: string | null; columns: number; height: 'sm' | 'md' | 'lg'; items: Array<z.output<typeof tileItem>> }
  | { id: number; kind: 'text'; title: string | null; html: string; boxed: boolean }
  /** `html` yöneticinin ham kodudur; istemcide özel kod çalıştırıcısıyla işlenir. */
  | { id: number; kind: 'html'; title: string | null; html: string; boxed: boolean }
  | { id: number; kind: 'recent'; title: string | null; limit: number }
  | { id: number; kind: 'stats' | 'online' | 'birthdays' | 'discord'; title: string | null };

export type HomeLayout = Record<HomePosition, HomeBlock[]>;
