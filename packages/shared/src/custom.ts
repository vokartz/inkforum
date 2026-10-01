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
  blank: { label: 'Ayrı site', description: 'Forumun üst çubuğu ve alt bilgisi olmadan; açılış sayfası, UCP gibi tamamen özel tasarımlar (menüyü "Menü çubuğu" bloğuyla ekleyin).' },
};

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
  })
  .superRefine((v, ctx) => {
    if (v.visibility === 'groups' && !v.groupIds.length) ctx.addIssue({ code: 'custom', path: ['groupIds'], message: 'En az bir grup seçin.' });
  });
export type PageInput = z.output<typeof pageInput>;

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

/** Yönetim: sayfa listesi / düzenleme */
export interface AdminCustomPage extends PageInput {
  id: number;
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
  /** format = builder: sayfaya özel CSS */
  css?: string;
  /** Ana sayfa (açılış sayfası) olarak seçili mi */
  isLanding?: boolean;
}

export interface IntegrationToken {
  token: string;
  expiresAt: number;
}
