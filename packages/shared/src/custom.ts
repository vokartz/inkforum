import { z } from 'zod';

/**
 * Özel kod ve özel sayfalar: yöneticinin eklediği HTML / CSS / JS parçacıkları (UCP, istatistik
 * panelleri, sayaçlar, sohbet eklentileri vb.) ve kendi içerik sayfaları.
 * Parçacıklar yalnızca forum tarafında çalışır; yönetim paneli ve güvenli modda hiç yüklenmez.
 */

export const SNIPPET_PLACEMENTS = ['head', 'afterHeader', 'beforeFooter', 'bodyEnd', 'profileSidebar', 'profileTab'] as const;
export type SnippetPlacement = (typeof SNIPPET_PLACEMENTS)[number];

export const SNIPPET_PLACEMENT_INFO: Record<SnippetPlacement, { label: string; description: string; icon: string }> = {
  head: { label: '<head> içi', description: 'Meta etiketleri, stil dosyaları, analiz ve doğrulama kodları. Her sayfada bir kez yüklenir.', icon: 'brackets-angle' },
  afterHeader: { label: 'Üst çubuğun altı', description: 'Tüm sayfalarda üst çubuğun hemen altında, içeriğin üstünde.', icon: 'arrow-line-down' },
  beforeFooter: { label: 'Alt bilginin üstü', description: 'Tüm sayfalarda içeriğin altında, alt bilgiden önce.', icon: 'arrow-line-up' },
  bodyEnd: { label: 'Sayfa sonu (görünmez)', description: 'Sohbet balonu, izleme kodu gibi görünmeyen ya da sabit konumlu betikler.', icon: 'code' },
  profileSidebar: { label: 'Profil yan sütunu', description: 'Üye profilinde yan sütuna kart olarak eklenir (ör. UCP karakter kartı).', icon: 'sidebar-simple' },
  profileTab: { label: 'Profil sekmesi', description: 'Üye profilinde ayrı bir sekme (ör. "Karakterler"). Sekme adı başlıktan alınır.', icon: 'tabs' },
};

export const CONTENT_VISIBILITY = ['all', 'members', 'guests', 'groups'] as const;
export type ContentVisibility = (typeof CONTENT_VISIBILITY)[number];

export const CONTENT_VISIBILITY_LABELS: Record<ContentVisibility, string> = {
  all: 'Herkes',
  members: 'Yalnızca üyeler',
  guests: 'Yalnızca misafirler',
  groups: 'Seçili gruplar',
};

/** HTML / parçacık şablonlarında kullanılabilen değişkenler (değerler HTML için kaçışlanır). */
export const TEMPLATE_VARIABLES: Array<{ key: string; label: string; scope: 'all' | 'profile' }> = [
  { key: 'forum.name', label: 'Forum adı', scope: 'all' },
  { key: 'forum.url', label: 'Forum adresi', scope: 'all' },
  { key: 'viewer.id', label: 'Giriş yapan üyenin numarası (misafirde 0)', scope: 'all' },
  { key: 'viewer.username', label: 'Giriş yapan üyenin kullanıcı adı', scope: 'all' },
  { key: 'viewer.displayName', label: 'Giriş yapan üyenin görünen adı', scope: 'all' },
  { key: 'viewer.group', label: 'Giriş yapan üyenin ana grubu', scope: 'all' },
  { key: 'profile.id', label: 'Profili görüntülenen üyenin numarası', scope: 'profile' },
  { key: 'profile.username', label: 'Profili görüntülenen üyenin kullanıcı adı', scope: 'profile' },
  { key: 'profile.displayName', label: 'Profili görüntülenen üyenin görünen adı', scope: 'profile' },
  { key: 'profile.field.ANAHTAR', label: 'Profildeki özel alan değeri (ANAHTAR yerine alan anahtarı)', scope: 'profile' },
];

const groupIds = z.array(z.number().int().positive()).max(50).default([]);

export const snippetInput = z
  .object({
    name: z.string().trim().min(1, 'Ad gerekli.').max(80),
    placement: z.enum(SNIPPET_PLACEMENTS),
    title: z.string().trim().max(60).nullable().default(null),
    html: z.string().max(100_000, 'En fazla 100.000 karakter.').default(''),
    visibility: z.enum(CONTENT_VISIBILITY).default('all'),
    groupIds,
    isEnabled: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .superRefine((v, ctx) => {
    if ((v.placement === 'profileTab' || v.placement === 'profileSidebar') && !v.title)
      ctx.addIssue({ code: 'custom', path: ['title'], message: v.placement === 'profileTab' ? 'Sekme adı gerekli.' : 'Kart başlığı gerekli.' });
    if (v.visibility === 'groups' && !v.groupIds.length) ctx.addIssue({ code: 'custom', path: ['groupIds'], message: 'En az bir grup seçin.' });
  });
export type SnippetInput = z.output<typeof snippetInput>;

export const PAGE_FORMATS = ['bbcode', 'html', 'builder'] as const;
export type PageFormat = (typeof PAGE_FORMATS)[number];
export const PAGE_LAYOUTS = ['default', 'wide', 'blank'] as const;
export type PageLayout = (typeof PAGE_LAYOUTS)[number];
export const PAGE_LAYOUT_INFO: Record<PageLayout, { label: string; description: string }> = {
  default: { label: 'Kart', description: 'Forum çerçevesinde, okunaklı genişlikte bir kart.' },
  wide: { label: 'Geniş', description: 'Forum çerçevesinde, kartsız ve tam genişlik (kendi tasarımın için).' },
  blank: { label: 'Ayrı site', description: 'Forumun üst çubuğu ve alt bilgisi olmadan; açılış sayfası, UCP gibi tamamen özel tasarımlar.' },
};
export const PAGE_SIDEBARS = ['none', 'left', 'right'] as const;
export type PageSidebar = (typeof PAGE_SIDEBARS)[number];

/** Kök adres: küçük harf, rakam, tire; "/" ile en fazla 3 parça (ör. "ucp", "ucp/karakterler") */
export const PAGE_ROUTE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){0,2}$/;
/** Forumun kendi adresleri: özel sayfa bu adreslerle başlayamaz */
export const RESERVED_ROUTES = [
  'admin', 'api', 'pages', 'forum', 'f', 't', 'p', 'u', 'go', 'login', 'register', 'logout', 'messages', 'new', 'notifications', 'search', 'settings',
  'members', 'groups', 'online', 'tags', 'tickets', 'applications', 'wiki', 'studio', 'embed', 'install', 'oauth', 'developers', 'cookies', 'policies',
  'achievements', 'unread', 'mod', 'banned', 'change-password', 'confirm-email', 'forgot-password', 'reset-password', 'verify-email', 'uploads', 'emoji',
  'brand', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'manifest.webmanifest', 'og', 'p-api', 'health', '_app',
];
export function routeReserved(route: string): boolean {
  const first = route.split('/')[0]!;
  return RESERVED_ROUTES.includes(first) || first.startsWith('sitemap');
}

/** Sunucu kodunun dış istek atabileceği alan adı (joker: *.ornek.com) */
export const HOST_PATTERN = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{2,5})?$/i;
export const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,40}$/;

export const PAGE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const pageInput = z
  .object({
    slug: z.string().trim().toLowerCase().min(1, 'Adres gerekli.').max(60).regex(PAGE_SLUG, 'Yalnızca küçük harf, rakam ve tire kullanın.'),
    title: z.string().trim().min(1, 'Başlık gerekli.').max(120),
    format: z.enum(PAGE_FORMATS).default('bbcode'),
    body: z.string().max(500_000, 'Sayfa çok büyük.').default(''),
    layout: z.enum(PAGE_LAYOUTS).default('default'),
    showTitle: z.boolean().default(true),
    metaDescription: z.string().trim().max(300).nullable().default(null),
    visibility: z.enum(CONTENT_VISIBILITY).default('all'),
    groupIds,
    isPublished: z.boolean().default(true),
    /** Kök adres (ör. "ucp" → /ucp); boş = yalnızca /pages/{slug} */
    route: z
      .string()
      .trim()
      .toLowerCase()
      .transform((r) => r.replace(/^\/+|\/+$/g, ''))
      .pipe(z.string().max(80).regex(PAGE_ROUTE, 'Adres küçük harf, rakam ve tireden oluşmalı (ör. ucp ya da ucp/karakterler).').or(z.literal('')))
      .nullable()
      .default(null)
      .transform((r) => r || null),
    css: z.string().max(200_000).default(''),
    js: z.string().max(200_000).default(''),
    sidebar: z.enum(PAGE_SIDEBARS).default('none'),
    sidebarHtml: z.string().max(100_000).default(''),
    serverEnabled: z.boolean().default(false),
    serverCode: z.string().max(100_000).default(''),
    allowedHosts: z.array(z.string().trim().toLowerCase().regex(HOST_PATTERN, 'Geçersiz alan adı (ör. api.ornek.com ya da *.ornek.com).')).max(30).default([]),
    /** Gizli değerler: `value` verilmezse kayıtlı değer korunur, listede olmayanlar silinir */
    secrets: z
      .array(z.object({ name: z.string().trim().regex(SECRET_NAME, 'Ad BÜYÜK_HARF ve _ ile yazılmalı (ör. UCP_API_KEY).'), value: z.string().max(4000).optional() }))
      .max(30)
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (v.visibility === 'groups' && !v.groupIds.length) ctx.addIssue({ code: 'custom', path: ['groupIds'], message: 'En az bir grup seçin.' });
    if (v.route && routeReserved(v.route)) ctx.addIssue({ code: 'custom', path: ['route'], message: 'Bu adres forumun kendi sayfalarından biri; başka bir adres seçin.' });
    if (new Set(v.secrets.map((x) => x.name)).size !== v.secrets.length) ctx.addIssue({ code: 'custom', path: ['secrets'], message: 'Gizli değer adları benzersiz olmalı.' });
  });
export type PageInput = z.output<typeof pageInput>;

/** Yönetim: sunucu kodunu deneme isteği */
export const pageTestInput = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  /** Sayfa adresinden sonraki kısım ("/" = sayfanın kendisi) */
  path: z.string().trim().max(300).default('/'),
  query: z.record(z.string(), z.string().max(2000)).default({}),
  body: z.string().max(100_000).default(''),
  as: z.enum(['me', 'guest']).default('me'),
  /** Kaydetmeden denemek için kod (boşsa kayıtlı kod) */
  code: z.string().max(100_000).optional(),
});
export type PageTestInput = z.output<typeof pageTestInput>;

/** Sunucu kodunun ürettiği yanıt */
export type PageServerResponse =
  | { type: 'json'; status: number; headers: Record<string, string>; body: unknown }
  | { type: 'text' | 'html'; status: number; headers: Record<string, string>; body: string }
  | { type: 'redirect'; status: number; url: string }
  | { type: 'status'; status: number }
  | { type: 'none' };

export interface PageTestResult {
  ok: boolean;
  response: PageServerResponse | null;
  error: string | null;
  logs: string[];
  ms: number;
}

/** CSP'ye eklenebilecek kaynak: https:// veya wss:// kökü (alt alan joker karakteri serbest). */
export const CSP_SOURCE = /^(https|wss):\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{2,5})?$/i;
const cspList = z.array(z.string().trim().regex(CSP_SOURCE, 'Geçersiz kaynak (ör. https://ucp.ornek.com).')).max(30).default([]);

export const customSettingsInput = z.object({
  enabled: z.boolean(),
  css: z.string().max(100_000).default(''),
  csp: z.object({ script: cspList, connect: cspList, style: cspList, font: cspList }),
  tokenTtl: z.number().int().min(30).max(3600).default(300),
});
export type CustomSettingsInput = z.output<typeof customSettingsInput>;
export type CustomCsp = CustomSettingsInput['csp'];

/** Yönetim: kayıtlı parçacık */
export interface AdminSnippet extends SnippetInput {
  id: number;
  updatedAt: number;
}

/** Yönetim: sayfa listesi / düzenleme (gizli değerlerin yalnızca adları gelir) */
export interface AdminCustomPage extends Omit<PageInput, 'secrets'> {
  id: number;
  secrets: Array<{ name: string }>;
  createdAt: number;
  updatedAt: number;
}

export interface AdminCustomCode {
  snippets: AdminSnippet[];
  settings: CustomSettingsInput;
  integration: { hasSecret: boolean; secretHint: string | null; tokenUrl: string };
}

/** Ziyaretçiye gönderilen parçacık */
export interface SnippetView {
  id: number;
  placement: SnippetPlacement;
  title: string | null;
  html: string;
}

/** Ziyaretçiye göre özel kod paketi (`GET /api/custom`). */
export interface ViewerCustom {
  enabled: boolean;
  css: string;
  snippets: SnippetView[];
  csp: CustomCsp;
}

export interface CustomPageView {
  id: number;
  slug: string;
  title: string;
  format: PageFormat;
  html: string;
  layout: PageLayout;
  showTitle: boolean;
  metaDescription: string | null;
  isPublished: boolean;
  updatedAt: number;
  /** format = builder: ziyaretçiye göre çözümlenmiş bloklar */
  blocks?: import('./builder.js').ResolvedBlock[];
  /** Sayfaya özel CSS ve JS (özel kod kapalıyken boş) */
  css?: string;
  js?: string;
  route?: string | null;
  sidebar?: PageSidebar;
  sidebarHtml?: string;
  /** Sunucu kodunun `json(...)` ile döndürdüğü veri (sayfanın JS'inde `forum.page.data`) */
  data?: unknown;
  /** Sunucu kodunun açık olup olmadığı (sayfanın JS'i `forum.api()` ile çağırabilir) */
  hasServer?: boolean;
  /** Ana sayfa (açılış sayfası) olarak seçili mi */
  isLanding?: boolean;
}

/** `GET /api/pages/:slug` yanıtı: sayfa ya da sunucu kodunun yönlendirmesi */
export type CustomPageResult = CustomPageView | { redirect: string; status: number };

export interface IntegrationToken {
  token: string;
  expiresAt: number;
}
