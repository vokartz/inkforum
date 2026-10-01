import { z } from 'zod';
import type { UserSummary } from './dto.js';

/**
 * Yerleşik eklentiler. Yönetim → Eklentiler ekranından açılıp kapatılır; kapalı bir eklentinin
 * API uç noktaları 404 döner, menü öğeleri ve yönetim sayfaları gizlenir. Veriler silinmez.
 */

export const PLUGIN_KEYS = ['landing', 'wiki', 'applications', 'tickets', 'shoutbox', 'discord'] as const;
export type PluginKey = (typeof PLUGIN_KEYS)[number];

export interface PluginDef {
  key: PluginKey;
  name: string;
  description: string;
  /** Phosphor ikon adı */
  icon: string;
  version: string;
  author: string;
  category: 'site' | 'community' | 'support' | 'integration';
  features: string[];
  /** Yönetim sayfası */
  adminHref: string | null;
  /** Ziyaretçi sayfası */
  publicHref: string | null;
  /** Ayar kaydı yoksa açık mı (sonradan eklenen eklentiler kapalı başlar) */
  defaultEnabled?: boolean;
}

export const PLUGIN_CATEGORIES: Record<PluginDef['category'], string> = {
  site: 'Site ve içerik',
  community: 'Topluluk',
  support: 'Destek',
  integration: 'Entegrasyonlar',
};

export const PLUGINS: PluginDef[] = [
  {
    key: 'landing',
    name: 'Açılış sayfası',
    description: 'Sürükle-bırak sayfalardan birini ana sayfa yapar; forum otomatik olarak /forum adresine taşınır.',
    icon: 'house-line',
    version: '1.0.0',
    author: 'InkForum',
    category: 'site',
    features: ['Ayrı site gibi tanıtım sayfası', 'Menü çubuğu, kapak, sunucu kartı, galeri blokları', 'Forum adresi otomatik /forum'],
    adminHref: '/admin/pages',
    publicHref: null,
  },
  {
    key: 'wiki',
    name: 'Wiki',
    description: 'İç içe sayfalardan oluşan bilgi bankası: rehberler, kurallar, sık sorulan sorular.',
    icon: 'book-open-text',
    version: '1.0.0',
    author: 'InkForum',
    category: 'site',
    features: ['Sınırsız alt sayfa ve ağaç menü', 'Otomatik içindekiler, arama', 'Sayfa geçmişi ve geri alma'],
    adminHref: '/admin/wiki',
    publicHref: '/wiki',
  },
  {
    key: 'applications',
    name: 'Başvurular',
    description: 'Ekip, rol ve oluşum başvuruları: özel sorular, gereksinimler, inceleme ve otomatik grup ataması.',
    icon: 'clipboard-text',
    version: '1.0.0',
    author: 'InkForum',
    category: 'community',
    features: ['8 soru türü ve gereksinimler', 'İnceleyici grupları, iç notlar', 'Onayda gruba otomatik ekleme'],
    adminHref: '/admin/applications',
    publicHref: '/applications',
  },
  {
    key: 'tickets',
    name: 'Destek talepleri',
    description: 'Üyelerin destek talebi açtığı yardım masası: kategoriler, sorumlu yetkili grupları, durumlar ve öncelikler.',
    icon: 'lifebuoy',
    version: '1.0.0',
    author: 'InkForum',
    category: 'support',
    features: ['Kategoriye göre sorumlu yetkili grubu', 'Durum, öncelik, yetkiliye atama', 'İç notlar ve bildirimler'],
    adminHref: '/admin/tickets',
    publicHref: '/tickets',
  },
  {
    key: 'shoutbox',
    name: 'Sohbet kutusu',
    description: 'Ana sayfada üyelerin kısa mesajlarla anlık sohbet ettiği kutu. Yeni mesajlar sayfa yenilenmeden gelir.',
    icon: 'chat-centered-dots',
    version: '1.0.0',
    author: 'InkForum',
    category: 'community',
    features: ['Anlık mesajlar (sayfa yenilemeden)', 'Moderatörler mesaj silebilir', 'Ana sayfa bloğu olarak üste, yana ya da alta'],
    adminHref: '/admin/shoutbox',
    publicHref: null,
    defaultEnabled: false,
  },
  {
    key: 'discord',
    name: 'Discord entegrasyonu',
    description: 'Yeni konuları Discord kanalınıza gönderir ve ana sayfada Discord sunucunuzun çevrimiçi sayısını gösterir.',
    icon: 'discord-logo',
    version: '1.0.0',
    author: 'InkForum',
    category: 'integration',
    features: ['Webhook ile yeni konu (ve isteğe bağlı yanıt) bildirimi', 'Bölüm seçimi', 'Çevrimiçi sayısı ve katıl düğmesi'],
    adminHref: '/admin/discord',
    publicHref: null,
    defaultEnabled: false,
  },
];

export const PLUGIN_MAP = new Map(PLUGINS.map((p) => [p.key, p]));

/** Ayar kaydından eklentinin açık olup olmadığı (kayıt yoksa açık) */
export function pluginEnabled(settings: Record<string, unknown> | undefined | null, key: PluginKey): boolean {
  const map = (settings?.['plugins.enabled'] ?? {}) as Partial<Record<PluginKey, boolean>>;
  const v = map[key];
  return v === undefined ? PLUGIN_MAP.get(key)?.defaultEnabled !== false : v;
}

/** Açılış sayfası eklentisi kapalıysa ana sayfa her zaman forum dizinidir */
export function effectiveLanding(settings: Record<string, unknown> | undefined | null): string {
  return pluginEnabled(settings, 'landing') ? String(settings?.['home.landingPage'] ?? '') : '';
}

export interface AdminPlugin extends PluginDef {
  enabled: boolean;
  /** Kısa özet (ör. "7 sayfa", "3 bekleyen talep") */
  stats: string[];
}

// ----- Sohbet kutusu -----

export interface Shout {
  id: number;
  user: UserSummary;
  body: string;
  createdAt: number;
  canDelete: boolean;
}

export const shoutInput = z.object({ body: z.string().trim().min(1, 'Mesaj boş olamaz.').max(1000) });

export const shoutboxSettingsInput = z.object({
  maxLength: z.number().int().min(20).max(1000).default(300),
  history: z.number().int().min(5).max(100).default(30),
  guests: z.boolean().default(true),
});
export type ShoutboxSettings = z.output<typeof shoutboxSettingsInput>;

// ----- Discord -----

export interface DiscordWidget {
  name: string;
  online: number;
  inviteUrl: string | null;
  members: Array<{ name: string; avatarUrl: string | null; status: string }>;
}

export const discordSettingsInput = z.object({
  /** https://discord.com/api/webhooks/… (boş = kaldır, "keep" = değiştirme) */
  webhookUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === '' || v === 'keep' || /^https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(v), 'Discord kanalındaki "Webhook URL" adresini yapıştırın.'),
  /** Boşsa misafirlerin görebildiği tüm bölümler */
  boardIds: z.array(z.number().int().positive()).max(200).default([]),
  replies: z.boolean().default(false),
  /** Sunucu Ayarları → Widget → Sunucu Kimliği */
  guildId: z.string().trim().regex(/^(\d{15,22})?$/, 'Sunucu kimliği yalnızca rakamlardan oluşur.').default(''),
  inviteUrl: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === '' || /^https:\/\/(discord\.gg|discord\.com\/invite)\/[\w-]+$/.test(v), 'Davet bağlantısı https://discord.gg/… biçiminde olmalı.')
    .default(''),
});
export type DiscordSettingsInput = z.output<typeof discordSettingsInput>;
