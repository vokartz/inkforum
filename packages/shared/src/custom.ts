import { z } from 'zod';

export const CONTENT_VISIBILITY = ['all', 'members', 'guests', 'groups'] as const;
export type ContentVisibility = (typeof CONTENT_VISIBILITY)[number];

export const CONTENT_VISIBILITY_LABELS: Record<ContentVisibility, string> = {
  all: 'Herkes',
  members: 'Yalnızca üyeler',
  guests: 'Yalnızca misafirler',
  groups: 'Seçili gruplar',
};

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

export const PAGE_ROUTE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){0,2}$/;
export const RESERVED_ROUTES = [
  'admin', 'api', 'pages', 'forum', 'f', 't', 'p', 'u', 'go', 'login', 'register', 'logout', 'messages', 'new', 'notifications', 'search', 'settings',
  'members', 'groups', 'online', 'tags', 'tickets', 'applications', 'wiki', 'studio', 'embed', 'install', 'oauth', 'developers', 'cookies', 'policies',
  'achievements', 'unread', 'mod', 'banned', 'change-password', 'confirm-email', 'forgot-password', 'reset-password', 'verify-email', 'uploads', 'emoji',
  'brand', 'ext', 'ext-assets', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'manifest.webmanifest', 'og', 'p-api', 'health', '_app',
];
export function routeReserved(route: string): boolean {
  const first = route.split('/')[0]!;
  return RESERVED_ROUTES.includes(first) || first.startsWith('sitemap');
}

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

export const pageTestInput = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  path: z.string().trim().max(300).default('/'),
  query: z.record(z.string(), z.string().max(2000)).default({}),
  body: z.string().max(100_000).default(''),
  as: z.enum(['me', 'guest']).default('me'),
  code: z.string().max(100_000).optional(),
});
export type PageTestInput = z.output<typeof pageTestInput>;

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

export const CSP_SOURCE = /^(https|wss):\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{2,5})?$/i;
export interface CspSources {
  script: string[];
  connect: string[];
  style: string[];
  font: string[];
  frame?: string[];
  img?: string[];
}
export interface AdminCustomPage extends Omit<PageInput, 'secrets'> {
  id: number;
  secrets: Array<{ name: string }>;
  createdAt: number;
  updatedAt: number;
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
  blocks?: import('./builder.js').ResolvedBlock[];
  css?: string;
  js?: string;
  route?: string | null;
  sidebar?: PageSidebar;
  sidebarHtml?: string;
  data?: unknown;
  hasServer?: boolean;
  isLanding?: boolean;
}

export type CustomPageResult = CustomPageView | { redirect: string; status: number };
