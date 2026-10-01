import { z } from 'zod';
import { FONT_OPTIONS, THEME_STYLES, type FontKey } from './settings.js';

/**
 * Tema stüdyosu: yöneticinin kod yazmadan oluşturduğu temalar. Bir tema; temel düzen (Modern / Topluluk),
 * açık ve koyu renk paletleri, yazı, şekil, üst alan, sayfa düzeni, forum listesi, arka plan ve efekt ayarlarından
 * oluşur. İsteyen özel CSS ve HTML bölmeleri de ekleyebilir. Derlenen tema sayfa başında tek bir <style> olarak yazılır.
 */

const hex = z.union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı.')]);
const assetUrl = z.union([
  z.literal(''),
  z
    .string()
    .trim()
    .max(500)
    .regex(/^(\/uploads\/|https:\/\/)/i, 'Görsel yüklenmeli ya da https:// adresi olmalı.'),
]);
const fontKey = z.enum(FONT_OPTIONS.map((f) => f.key) as [FontKey, ...FontKey[]]);

export const PALETTE_KEYS = [
  'background',
  'surface',
  'surfaceAlt',
  'text',
  'muted',
  'border',
  'header',
  'headerText',
  'nav',
  'navText',
  'link',
] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];

/** Boş renk = temel temanın varsayılanı */
export const themePaletteSchema = z.object(
  Object.fromEntries(PALETTE_KEYS.map((k) => [k, hex.default('')])) as Record<
    PaletteKey,
    z.ZodDefault<typeof hex>
  >,
);
export type ThemePalette = z.output<typeof themePaletteSchema>;

export const PALETTE_LABELS: Record<PaletteKey, { label: string; hint: string }> = {
  background: { label: 'Sayfa arka planı', hint: 'Kartların arkasındaki zemin.' },
  surface: { label: 'Kart ve kutular', hint: 'Bölüm listesi, mesajlar, yan bileşenler.' },
  surfaceAlt: { label: 'İkincil yüzey', hint: 'Satır üzeri, sekmeler, rozetler, giriş alanları.' },
  text: { label: 'Yazı', hint: 'Ana metin rengi.' },
  muted: { label: 'Soluk yazı', hint: 'Açıklamalar, tarihler, ipuçları.' },
  border: { label: 'Kenarlık', hint: 'Kart ve satır ayırıcıları.' },
  header: { label: 'Üst alan', hint: 'Banner yoksa üst alanın zemini.' },
  headerText: { label: 'Üst alan yazısı', hint: '' },
  nav: { label: 'Menü çubuğu', hint: 'Menünün ve üst çubuğun zemini.' },
  navText: { label: 'Menü yazısı', hint: '' },
  link: { label: 'Bağlantı', hint: 'Boşsa vurgu renginden üretilir.' },
};

export const themeConfigSchema = z.object({
  base: z.enum(THEME_STYLES).default('modern'),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı.')
    .default('#7b61ff'),
  mode: z
    .object({
      default: z.enum(['dark', 'light', 'system']).default('dark'),
      /** Üyeler açık / koyu arasında geçiş yapabilsin */
      toggle: z.boolean().default(true),
    })
    .prefault({}),
  light: themePaletteSchema.prefault({}),
  dark: themePaletteSchema.prefault({}),
  typography: z
    .object({
      font: fontKey.default('inter'),
      headingFont: z.union([z.literal('same'), fontKey]).default('same'),
      size: z.number().int().min(13).max(18).default(16),
      headingWeight: z.union([z.literal(600), z.literal(700), z.literal(800), z.literal(900)]).default(800),
      headingCase: z.enum(['none', 'uppercase']).default('none'),
      letterSpacing: z.enum(['tight', 'normal', 'wide']).default('normal'),
    })
    .prefault({}),
  shape: z
    .object({
      radius: z.enum(['none', 'sm', 'md', 'lg', 'xl']).default('lg'),
      border: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(1),
      shadow: z.enum(['none', 'soft', 'medium', 'strong']).default('soft'),
      cards: z.enum(['bordered', 'elevated', 'flat', 'glass']).default('bordered'),
    })
    .prefault({}),
  header: z
    .object({
      style: z.enum(['topbar', 'banner', 'centered']).default('topbar'),
      sticky: z.boolean().default(true),
      height: z.enum(['compact', 'normal', 'tall']).default('normal'),
      nav: z.enum(['pill', 'underline', 'tab']).default('pill'),
      blur: z.boolean().default(true),
    })
    .prefault({}),
  layout: z
    .object({
      width: z.enum(['narrow', 'normal', 'wide', 'full']).default('normal'),
      sidebar: z.enum(['right', 'left', 'hidden']).default('right'),
      density: z.enum(['compact', 'comfortable', 'spacious']).default('comfortable'),
      postLayout: z.enum(['side', 'top']).default('top'),
    })
    .prefault({}),
  forumList: z
    .object({
      style: z.enum(['table', 'cards', 'compact']).default('table'),
      icons: z.enum(['large', 'small', 'hidden']).default('large'),
      categoryHeader: z.enum(['plain', 'tinted', 'filled', 'underline']).default('plain'),
      lastPost: z.boolean().default(true),
      counts: z.boolean().default(true),
    })
    .prefault({}),
  background: z
    .object({
      kind: z.enum(['none', 'gradient', 'pattern', 'image']).default('none'),
      from: hex.default(''),
      to: hex.default(''),
      angle: z.number().int().min(0).max(360).default(160),
      pattern: z.enum(['dots', 'grid', 'diagonal', 'waves']).default('dots'),
      image: assetUrl.default(''),
      dim: z.number().int().min(0).max(95).default(70),
      fixed: z.boolean().default(true),
    })
    .prefault({}),
  effects: z
    .object({
      animations: z.boolean().default(true),
      hoverLift: z.boolean().default(false),
      /** Vurgu renginin yüzeylere yansıması (0 = yalnızca düğmeler) */
      tint: z.number().int().min(0).max(12).default(0),
    })
    .prefault({}),
});
export type ThemeConfig = z.output<typeof themeConfigSchema>;

export const THEME_HTML_SLOTS = ['beforeHeader', 'afterHeader', 'beforeFooter', 'afterFooter'] as const;
export type ThemeHtmlSlot = (typeof THEME_HTML_SLOTS)[number];
export const THEME_HTML_LABELS: Record<ThemeHtmlSlot, string> = {
  beforeHeader: 'Üst alanın üstü',
  afterHeader: 'Üst alanın altı (içerikten önce)',
  beforeFooter: 'Alt bilginin üstü',
  afterFooter: 'Sayfanın en altı',
};

export const themeInput = z.object({
  name: z.string().trim().min(1, 'Tema adı gerekli.').max(60),
  description: z.string().trim().max(200).default(''),
  config: themeConfigSchema,
  css: z.string().max(100_000, 'En fazla 100.000 karakter.').default(''),
  html: z
    .object(
      Object.fromEntries(THEME_HTML_SLOTS.map((k) => [k, z.string().max(50_000).default('')])) as Record<
        ThemeHtmlSlot,
        z.ZodDefault<z.ZodString>
      >,
    )
    .prefault({}),
});
export type ThemeInput = z.output<typeof themeInput>;

export interface ThemeSummary {
  id: number;
  name: string;
  description: string;
  isSystem: boolean;
  active: boolean;
  config: ThemeConfig;
  updatedAt: number;
}
export interface ThemeDetail extends ThemeSummary {
  css: string;
  html: Record<ThemeHtmlSlot, string>;
}

/** Ziyaretçiye giden etkin tema (ayar: appearance.theme) */
export interface ActiveTheme {
  id: number;
  name: string;
  /** Bileşenlerin okuduğu düzen seçenekleri */
  options: Pick<ThemeConfig, 'header' | 'layout' | 'forumList' | 'mode'>;
  /** Derlenmiş CSS (renkler, yazı, şekil, arka plan, efektler + özel CSS) */
  css: string;
  html: Record<ThemeHtmlSlot, string>;
}

export const defaultThemeConfig = (): ThemeConfig => themeConfigSchema.parse({});

/** Hazır başlangıç temaları (yeni tema oluştururken seçilir) */
export const THEME_PRESETS: Array<{
  key: string;
  name: string;
  description: string;
  config: z.input<typeof themeConfigSchema>;
}> = [
  {
    key: 'modern',
    name: 'Modern',
    description: 'Sade, koyu; ince üst çubuk ve hap menü.',
    config: { base: 'modern', accent: '#7b61ff', mode: { default: 'dark', toggle: true } },
  },
  {
    key: 'community',
    name: 'Topluluk',
    description: 'Bannerlı üst alan, altında menü çubuğu; geniş kartlar.',
    config: {
      base: 'community',
      accent: '#3b82f6',
      header: { style: 'banner', nav: 'underline' },
      forumList: { categoryHeader: 'underline' },
    },
  },
  {
    key: 'midnight',
    name: 'Gece Mavisi',
    description: 'Lacivert zemin, parlak mavi vurgular, yumuşak gölgeler.',
    config: {
      base: 'modern',
      accent: '#38bdf8',
      mode: { default: 'dark', toggle: false },
      dark: {
        background: '#0b1220',
        surface: '#111a2e',
        surfaceAlt: '#16223b',
        text: '#e6edf7',
        muted: '#8ea0bd',
        border: '#1e2c47',
        nav: '#0d1628',
        navText: '#c9d6ea',
        header: '#0b1220',
        headerText: '#ffffff',
      },
      shape: { radius: 'lg', shadow: 'medium', cards: 'elevated' },
      background: { kind: 'gradient', from: '#0b1220', to: '#13203a', angle: 180 },
      forumList: { categoryHeader: 'tinted' },
    },
  },
  {
    key: 'forest',
    name: 'Orman',
    description: 'Koyu yeşil tonlar, toprak renkleri; sakin ve okunaklı.',
    config: {
      base: 'community',
      accent: '#22c55e',
      header: { style: 'banner', nav: 'underline' },
      dark: {
        background: '#0f1712',
        surface: '#152019',
        surfaceAlt: '#1b2a20',
        text: '#e3efe6',
        muted: '#93ab9a',
        border: '#22362a',
        nav: '#122019',
        navText: '#d3e5d8',
        header: '#0c140f',
        headerText: '#ffffff',
      },
      light: {
        background: '#f1f5f0',
        surface: '#ffffff',
        surfaceAlt: '#e9f0e8',
        text: '#17241b',
        muted: '#5c7363',
        border: '#d7e3d6',
      },
      forumList: { categoryHeader: 'filled' },
    },
  },
  {
    key: 'sunset',
    name: 'Gün Batımı',
    description: 'Sıcak turuncu-mor geçişli arka plan, cam efektli kartlar.',
    config: {
      base: 'modern',
      accent: '#f97316',
      mode: { default: 'dark', toggle: false },
      dark: {
        background: '#140d16',
        surface: '#1d1420',
        surfaceAlt: '#271a2b',
        text: '#f6ecf2',
        muted: '#b39aab',
        border: '#33223a',
      },
      shape: { radius: 'xl', cards: 'glass', shadow: 'strong' },
      background: { kind: 'gradient', from: '#2a1030', to: '#3b1d0c', angle: 135, fixed: true },
      effects: { hoverLift: true },
    },
  },
  {
    key: 'paper',
    name: 'Kâğıt',
    description: 'Açık, sıcak kâğıt tonları; serif olmayan sade yazı, ince çizgiler.',
    config: {
      base: 'modern',
      accent: '#b45309',
      mode: { default: 'light', toggle: true },
      light: {
        background: '#f6f2ea',
        surface: '#fffdf8',
        surfaceAlt: '#efe9dd',
        text: '#26221c',
        muted: '#6f675b',
        border: '#e2dacb',
        nav: '#f6f2ea',
        navText: '#3a342b',
        header: '#f6f2ea',
        headerText: '#1f1b16',
      },
      shape: { radius: 'sm', shadow: 'none', cards: 'bordered' },
      header: { style: 'centered', nav: 'underline' },
      typography: { font: 'manrope', headingWeight: 700 },
    },
  },
  {
    key: 'neon',
    name: 'Neon',
    description: 'Siyah zemin, canlı pembe vurgu, büyük harfli başlıklar; oyun toplulukları için.',
    config: {
      base: 'modern',
      accent: '#ec4899',
      mode: { default: 'dark', toggle: false },
      dark: {
        background: '#07070a',
        surface: '#0f0f15',
        surfaceAlt: '#16161f',
        text: '#f2f2f7',
        muted: '#9a9aae',
        border: '#1f1f2b',
        nav: '#0b0b10',
        navText: '#e4e4ee',
      },
      typography: { font: 'outfit', headingCase: 'uppercase', letterSpacing: 'wide' },
      shape: { radius: 'md', cards: 'bordered' },
      background: { kind: 'pattern', pattern: 'grid', from: '#ec4899' },
      forumList: { categoryHeader: 'underline' },
    },
  },
  {
    key: 'clean',
    name: 'Temiz Açık',
    description: 'Beyaz ve açık gri; kurumsal, sade, geniş boşluklu.',
    config: {
      base: 'modern',
      accent: '#2563eb',
      mode: { default: 'light', toggle: true },
      light: {
        background: '#f4f6f9',
        surface: '#ffffff',
        surfaceAlt: '#eef1f5',
        text: '#111827',
        muted: '#6b7280',
        border: '#e5e7eb',
        nav: '#ffffff',
        navText: '#374151',
      },
      shape: { radius: 'md', shadow: 'soft', cards: 'elevated' },
      layout: { density: 'spacious' },
      forumList: { categoryHeader: 'tinted' },
    },
  },
];

// ---------- Derleme ----------

const RADIUS: Record<ThemeConfig['shape']['radius'], string> = {
  none: '0rem',
  sm: '0.3rem',
  md: '0.55rem',
  lg: '0.8rem',
  xl: '1.15rem',
};
const SHADOW: Record<ThemeConfig['shape']['shadow'], [string, string]> = {
  none: ['none', 'none'],
  soft: ['0 1px 2px rgb(0 0 0 / 0.06)', '0 10px 28px -14px rgb(0 0 0 / 0.3)'],
  medium: ['0 2px 8px -2px rgb(0 0 0 / 0.14)', '0 16px 34px -16px rgb(0 0 0 / 0.45)'],
  strong: ['0 8px 24px -8px rgb(0 0 0 / 0.35)', '0 24px 48px -18px rgb(0 0 0 / 0.6)'],
};
const WIDTH: Record<ThemeConfig['layout']['width'], string> = {
  narrow: '68rem',
  normal: '80rem',
  wide: '92rem',
  full: '100%',
};
const SPACING: Record<ThemeConfig['typography']['letterSpacing'], string> = {
  tight: '-0.01em',
  normal: '0',
  wide: '0.015em',
};
const CARDS =
  "[data-part='category'],[data-part='widget'],[data-part='post'],[data-part='board-header'],[data-part='topic-list'],[data-part='profile-header'],[data-part='conversation-message']";

/** CSS değeri olarak güvenli (yalnızca doğrulanmış biçimler kullanılır; yine de kaçış uygulanır) */
const safe = (v: string) => v.replace(/[;{}<>\\]/g, '');

function paletteVars(p: ThemePalette): string[] {
  const out: string[] = [];
  const set = (name: string, v: string) => v && out.push(`--${name}:${safe(v)}`);
  set('background', p.background);
  for (const k of ['card', 'popover', 'sidebar']) set(k, p.surface);
  for (const k of ['muted', 'secondary', 'accent', 'surface-2', 'sidebar-accent', 'panel-header'])
    set(k, p.surfaceAlt);
  if (p.surfaceAlt) set('row-hover', `color-mix(in oklab, ${p.surfaceAlt} 70%, transparent)`);
  if (p.surface) set('row-alt', p.surface);
  for (const k of [
    'foreground',
    'card-foreground',
    'popover-foreground',
    'secondary-foreground',
    'accent-foreground',
    'sidebar-foreground',
    'sidebar-accent-foreground',
  ])
    set(k, p.text);
  set('muted-foreground', p.muted);
  for (const k of ['border', 'input', 'sidebar-border']) set(k, p.border);
  set('header-bg', p.header);
  set('header-fg', p.headerText);
  set('topbar-bg', p.nav);
  set('topbar-fg', p.navText);
  if (p.link) {
    set('link', p.link);
    set('highlight', p.link);
  }
  return out;
}

function backgroundCss(b: ThemeConfig['background'], accent: string): string {
  const fixed = b.fixed ? 'fixed' : 'scroll';
  if (b.kind === 'gradient' && b.from && b.to)
    return `background:linear-gradient(${b.angle}deg, ${b.from}, ${b.to}) ${fixed};`;
  if (b.kind === 'pattern') {
    const c = `color-mix(in oklab, ${b.from || accent} 22%, transparent)`;
    const img = {
      dots: `radial-gradient(${c} 1px, transparent 1.5px) 0 0/18px 18px`,
      grid: `linear-gradient(${c} 1px, transparent 1px) 0 0/28px 28px, linear-gradient(90deg, ${c} 1px, transparent 1px) 0 0/28px 28px`,
      diagonal: `repeating-linear-gradient(45deg, ${c} 0 1px, transparent 1px 14px)`,
      waves: `radial-gradient(circle at 100% 50%, transparent 20%, ${c} 21%, ${c} 24%, transparent 25%) 0 0/36px 36px`,
    }[b.pattern];
    return `background:${img}, var(--background); background-attachment:${fixed};`;
  }
  if (b.kind === 'image' && b.image) {
    const url = b.image.replace(/["'()\\\s]/g, encodeURIComponent);
    return `background:linear-gradient(color-mix(in oklab, var(--background) ${b.dim}%, transparent), color-mix(in oklab, var(--background) ${b.dim}%, transparent)), url("${url}") center/cover no-repeat ${fixed}, var(--background);`;
  }
  return '';
}

/** Temayı tek bir CSS metnine çevirir. Seçiciler <html data-custom-theme> ile başlar, temel temaların önüne geçer. */
export function compileThemeCss(c: ThemeConfig, customCss = ''): string {
  const r = 'html[data-custom-theme]';
  const font = FONT_OPTIONS.find((f) => f.key === c.typography.font)?.family ?? FONT_OPTIONS[0].family;
  const heading =
    c.typography.headingFont === 'same'
      ? null
      : (FONT_OPTIONS.find((f) => f.key === c.typography.headingFont)?.family ?? null);
  const [shadowCard, shadowLift] = SHADOW[c.shape.shadow];
  const root = [
    `--primary:${c.accent}`,
    `--ring:${c.accent}`,
    `--app-font:${font}`,
    `--radius:${RADIUS[c.shape.radius]}`,
    `--shadow-card:${shadowCard}`,
    `--shadow-lift:${shadowLift}`,
    `--page-width:${WIDTH[c.layout.width]}`,
    `--tint:${c.effects.tint}`,
    `--tint-k:1`,
    `font-size:${(c.typography.size / 16) * 100}%`,
    `letter-spacing:${SPACING[c.typography.letterSpacing]}`,
  ];
  const css: string[] = [];
  css.push(`${r}{${root.join(';')}}`);
  const light = paletteVars(c.light);
  const dark = paletteVars(c.dark);
  if (light.length) css.push(`${r}{${light.join(';')}}`);
  if (dark.length) {
    css.push(`${r}[data-theme='dark']{${dark.join(';')}}`);
    css.push(`@media (prefers-color-scheme: dark){${r}[data-theme='system']{${dark.join(';')}}}`);
  }
  // Yalnızca tek mod kullanılıyorsa diğer paletin boş alanları seçilen paletten doldurulur
  if (!c.mode.toggle && c.mode.default !== 'system') {
    const only = paletteVars(c.mode.default === 'dark' ? c.dark : c.light);
    if (only.length) css.push(`${r}[data-theme]{${only.join(';')}}`);
  }
  // Yazı
  const headSel = `${r} :is(h1,h2,h3,[data-part='page-title'])`;
  css.push(
    `${headSel}{font-weight:${c.typography.headingWeight}${heading ? `;font-family:${heading}` : ''}${c.typography.headingCase === 'uppercase' ? ';text-transform:uppercase;letter-spacing:0.03em' : ''}}`,
  );
  // Kartlar
  if (c.shape.border === 0) css.push(`${r} :is(${CARDS}){border-color:transparent}`);
  if (c.shape.border === 2) css.push(`${r} :is(${CARDS}){border-width:2px}`);
  if (c.shape.cards === 'elevated')
    css.push(`${r} :is(${CARDS}){border-color:transparent;box-shadow:${shadowLift}}`);
  if (c.shape.cards === 'flat')
    css.push(`${r} :is(${CARDS}){border-color:transparent;box-shadow:none;background:var(--card)}`);
  if (c.shape.cards === 'glass')
    css.push(
      `${r} :is(${CARDS}){background:color-mix(in oklab, var(--card) 72%, transparent);backdrop-filter:blur(14px) saturate(1.2);border-color:color-mix(in oklab, var(--border) 60%, transparent)}`,
    );
  // Kategori başlıkları
  const cat = `${r} [data-part='category-header']:not([data-has-bg])`;
  if (c.forumList.categoryHeader === 'tinted')
    css.push(`${cat}{background:color-mix(in oklab, var(--primary) 9%, var(--card))}`);
  if (c.forumList.categoryHeader === 'filled')
    css.push(
      `${cat}{background:var(--primary);color:var(--primary-foreground)}${cat} :is(p,button,span){color:inherit}`,
    );
  if (c.forumList.categoryHeader === 'underline')
    css.push(`${cat}{box-shadow:inset 0 -2px 0 var(--primary)}`);
  // Yoğunluk
  if (c.layout.density === 'compact')
    css.push(`${r} :is([data-part='board-row'],[data-part='topic-row']){padding-block:0.55rem}`);
  if (c.layout.density === 'spacious')
    css.push(`${r} :is([data-part='board-row'],[data-part='topic-row']){padding-block:1.35rem}`);
  // Arka plan
  const bg = backgroundCss(c.background, c.accent);
  if (bg) css.push(`${r} body{${bg}}`);
  // Efektler
  if (!c.effects.animations)
    css.push(`${r} *,${r} *::before,${r} *::after{animation:none !important;transition:none !important}`);
  if (c.effects.hoverLift)
    css.push(
      `${r} :is([data-part='board-row'],[data-part='topic-row']){transition:transform .18s, background-color .18s}${r} :is([data-part='board-row'],[data-part='topic-row']):hover{transform:translateX(3px)}`,
    );
  return (
    css.join('\n') +
    (customCss.trim() ? `\n/* Özel CSS */\n${customCss.replace(/<\/style/gi, '<\\/style')}` : '')
  );
}

/** Etkin tema seçiminde genel ayarlara da yazılan değerler (e-posta, paylaşım görseli ve eski bileşenler bunları okur) */
export function themeSettingValues(c: ThemeConfig): Record<string, unknown> {
  return {
    'appearance.themeStyle': c.base,
    'appearance.accentColor': c.accent,
    'appearance.defaultMode': c.mode.default,
    'appearance.fontFamily': c.typography.font,
    'appearance.postLayout': c.layout.postLayout,
    'appearance.radius': 'auto',
    'appearance.colorSpread': 'none',
  };
}

export function activeThemeOf(t: {
  id: number;
  name: string;
  config: ThemeConfig;
  css: string;
  html: Record<ThemeHtmlSlot, string>;
}): ActiveTheme {
  return {
    id: t.id,
    name: t.name,
    options: {
      header: t.config.header,
      layout: t.config.layout,
      forumList: t.config.forumList,
      mode: t.config.mode,
    },
    css: compileThemeCss(t.config, t.css),
    html: t.html,
  };
}

/** <html> üzerine yazılan tema öznitelikleri (CSS bunlara göre düzeni değiştirir) */
export function themeHtmlAttrs(t: ActiveTheme): Record<string, string> {
  return {
    'data-custom-theme': '',
    'data-sidebar': t.options.layout.sidebar,
    'data-forum-list': t.options.forumList.style,
    'data-header': t.options.header.style,
  };
}

/** Temel temaların varsayılan renkleri (boş bırakılan palet alanlarının gerçek değeri; stüdyoda gösterilir) */
const BASE_PALETTES: Record<
  ThemeConfig['base'],
  Record<'light' | 'dark', Record<Exclude<PaletteKey, 'link'>, string>>
> = {
  modern: {
    light: {
      background: '#ffffff',
      surface: '#ffffff',
      surfaceAlt: '#f4f4f5',
      text: '#09090b',
      muted: '#71717a',
      border: '#e4e4e7',
      header: '#ffffff',
      headerText: '#09090b',
      nav: '#ffffff',
      navText: '#3f3f46',
    },
    dark: {
      background: '#09090b',
      surface: '#111113',
      surfaceAlt: '#1c1c1f',
      text: '#fafafa',
      muted: '#a1a1aa',
      border: '#27272a',
      header: '#09090b',
      headerText: '#fafafa',
      nav: '#09090b',
      navText: '#d4d4d8',
    },
  },
  community: {
    light: {
      background: '#eceff2',
      surface: '#ffffff',
      surfaceAlt: '#f2f4f6',
      text: '#1f2328',
      muted: '#5f6873',
      border: '#dfe3e8',
      header: '#1f2328',
      headerText: '#ffffff',
      nav: '#ffffff',
      navText: '#3a4048',
    },
    dark: {
      background: '#262626',
      surface: '#1b1b1b',
      surfaceAlt: '#2a2a2a',
      text: '#f2f2f2',
      muted: '#a6a6a6',
      border: '#333333',
      header: '#151515',
      headerText: '#ffffff',
      nav: '#1f1f1f',
      navText: '#e5e5e5',
    },
  },
};

/** Paletin etkin renkleri: boş alanlar temel temadan, bağlantı vurgu renginden */
export function effectivePalette(c: ThemeConfig, mode: 'light' | 'dark'): Record<PaletteKey, string> {
  const base = BASE_PALETTES[c.base][mode];
  const p = c[mode];
  const out = {} as Record<PaletteKey, string>;
  for (const k of PALETTE_KEYS)
    out[k] = p[k] || (k === 'link' ? c.accent : base[k as Exclude<PaletteKey, 'link'>]);
  return out;
}
