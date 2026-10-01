import { z } from 'zod';
import type { IconNode } from './forum.js';
import { ICON_NAME } from './forum.js';

/** Sistemin sağladığı menü öğeleri (adres sabit; ad, ikon, sıra ve görünürlük düzenlenebilir). */
export const NAV_BUILTINS = {
  home: { label: 'Ana sayfa', url: '/', icon: 'house', permission: null, visibility: 'all' },
  /** Açılış sayfası seçiliyse adres otomatik /forum olur */
  forum: { label: 'Forum', url: '/', icon: 'chats-circle', permission: null, visibility: 'all' },
  wiki: { label: 'Wiki', url: '/wiki', icon: 'book-open-text', permission: 'wiki.view', visibility: 'all' },
  applications: { label: 'Başvurular', url: '/applications', icon: 'clipboard-text', permission: 'applications.apply', visibility: 'members' },
  tickets: { label: 'Destek', url: '/tickets', icon: 'lifebuoy', permission: 'tickets.create', visibility: 'members' },
  unread: { label: 'Okunmamış', url: '/unread', icon: 'bookmark-simple', permission: null, visibility: 'members' },
  search: { label: 'Arama', url: '/search', icon: 'magnifying-glass', permission: null, visibility: 'all' },
  members: { label: 'Üyeler', url: '/members', icon: 'users', permission: 'members.list', visibility: 'all' },
  groups: { label: 'Gruplar', url: '/groups', icon: 'shield', permission: 'groups.view', visibility: 'all' },
  achievements: { label: 'Başarılar', url: '/achievements', icon: 'trophy', permission: 'achievements.view', visibility: 'all' },
  online: { label: 'Çevrimiçi', url: '/online', icon: 'broadcast', permission: 'online.view', visibility: 'all' },
} as const;
export type NavBuiltinKey = keyof typeof NAV_BUILTINS;

/** Ziyaretçiye gösterilen menü öğesi. */
export interface NavEntry {
  id: number;
  label: string;
  href: string | null;
  icon: IconNode | null;
  newTab: boolean;
  /** Vurgulu buton olarak göster */
  style: 'link' | 'button';
  children: NavEntry[];
}

/** Yönetim panelindeki ham menü öğesi. */
export interface AdminNavItem {
  id: number;
  parentId: number | null;
  kind: 'builtin' | 'link' | 'dropdown';
  builtinKey: string | null;
  label: string;
  url: string | null;
  icon: string | null;
  iconNodes: IconNode | null;
  newTab: boolean;
  visibility: 'all' | 'members' | 'guests';
  permission: string | null;
  isEnabled: boolean;
  style: 'link' | 'button';
}

const navItemInput = z.object({
  /** Mevcut öğe kimliği (yeni öğelerde yok). */
  id: z.number().int().positive().optional(),
  kind: z.enum(['builtin', 'link', 'dropdown']),
  builtinKey: z.string().max(40).nullable().default(null),
  label: z.string().trim().min(1, 'Ad gerekli.').max(40),
  url: z.string().trim().max(500).nullable().default(null),
  icon: z.string().trim().regex(ICON_NAME).max(60).nullable().default(null),
  newTab: z.boolean().default(false),
  visibility: z.enum(['all', 'members', 'guests']).default('all'),
  permission: z.string().max(80).nullable().default(null),
  isEnabled: z.boolean().default(true),
  style: z.enum(['link', 'button']).default('link'),
});

export const navTreeSchema = z.object({
  items: z
    .array(navItemInput.extend({ children: z.array(navItemInput).max(30).default([]) }))
    .max(40),
});
export type NavTreeInput = z.output<typeof navTreeSchema>;

export type BrandingAsset = 'logo' | 'logoLight' | 'favicon' | 'banner' | 'background' | 'footer' | 'auth' | 'defaultAvatar';
export const BRANDING_ASSETS: Record<BrandingAsset, { setting: string; maxKb: number; label: string }> = {
  logo: { setting: 'appearance.logoUrl', maxKb: 1024, label: 'Logo' },
  logoLight: { setting: 'appearance.logoLightUrl', maxKb: 1024, label: 'Açık mod logosu' },
  favicon: { setting: 'appearance.faviconUrl', maxKb: 256, label: 'Site simgesi' },
  banner: { setting: 'appearance.bannerUrl', maxKb: 4096, label: 'Üst alan (banner) görseli' },
  background: { setting: 'appearance.backgroundUrl', maxKb: 6144, label: 'Sayfa arka planı' },
  footer: { setting: 'appearance.footerBgUrl', maxKb: 6144, label: 'Alt bilgi arka planı' },
  auth: { setting: 'appearance.authImageUrl', maxKb: 6144, label: 'Giriş / kayıt görseli' },
  defaultAvatar: { setting: 'appearance.defaultAvatarUrl', maxKb: 512, label: 'Varsayılan avatar' },
};

/** Arama sonucu */
export interface SearchResults {
  query: string;
  type: 'topics' | 'posts';
  topics: Array<{
    id: number;
    title: string;
    slug: string;
    board: { id: number; name: string; slug: string };
    replyCount: number;
    viewCount: number;
    lastPostAt: number;
    createdAt: number;
    author: import('./dto.js').UserSummary | null;
    authorName: string;
    prefix: import('./forum.js').TopicPrefix | null;
    tags: import('./topics-extra.js').TopicTag[];
    /** İlk mesajdan kısa özet (eşleşen kısım etrafında) */
    excerpt: string;
    hasPoll: boolean;
  }>;
  posts: Array<{
    postId: number;
    topicId: number;
    topicTitle: string;
    topicSlug: string;
    board: { id: number; name: string; slug: string };
    author: import('./dto.js').UserSummary | null;
    authorName: string;
    createdAt: number;
    excerpt: string;
    isFirst: boolean;
  }>;
  members: Array<import('./dto.js').UserSummary>;
  total: number;
  page: number;
  perPage: number;
}

export const SEARCH_SINCE = ['day', 'week', 'month', 'year'] as const;
export const SEARCH_SORTS = ['relevance', 'newest', 'oldest', 'replies', 'views'] as const;

/** Gelişmiş arama sorgusu (`GET /api/search`). */
export const searchQuerySchema = z.object({
  q: z.string().max(100).default(''),
  type: z.enum(['topics', 'posts']).default('topics'),
  /** Yalnızca başlıklarda ara (konu aramasında) */
  titleOnly: z
    .union([z.boolean(), z.enum(['1', '0', 'true', 'false'])])
    .transform((v) => v === true || v === '1' || v === 'true')
    .default(false),
  board: z.coerce.number().int().positive().optional(),
  tag: z.string().trim().max(60).optional(),
  author: z.string().trim().max(60).optional(),
  since: z.enum(SEARCH_SINCE).optional(),
  sort: z.enum(SEARCH_SORTS).default('relevance'),
  page: z.coerce.number().int().min(1).max(500).default(1),
});
export type SearchQuery = z.output<typeof searchQuerySchema>;

/** Görünüm → Varsayılana sıfırla: hangi bölümlerin sıfırlanacağı */
export const APPEARANCE_RESET_PARTS = ['theme', 'branding', 'nav', 'footer', 'css'] as const;
export type AppearanceResetPart = (typeof APPEARANCE_RESET_PARTS)[number];
export const APPEARANCE_RESET_INFO: Record<AppearanceResetPart, { label: string; description: string }> = {
  theme: { label: 'Tema ve renkler', description: 'Tema stili, vurgu rengi, yazı tipi, köşeler, banner ve karşılama ayarları.' },
  branding: { label: 'Logo ve görseller', description: 'Logo, site simgesi, banner, arka plan ve varsayılan avatar kaldırılır.' },
  nav: { label: 'Üst menü', description: 'Menü öğeleri ilk kurulumdaki hâline döner.' },
  footer: { label: 'Alt bilgi', description: 'Alt bilgi metni, bağlantılar ve sosyal medya hesapları.' },
  css: { label: 'Özel CSS', description: 'Özel kod ekranındaki CSS temizlenir (betikler etkilenmez).' },
};
