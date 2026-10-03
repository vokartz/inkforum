import { z } from 'zod';
import { CSP_SOURCE, type CspSources } from './custom.js';
import { compareVersions } from './updates.js';
import type { IconNode } from './forum.js';

export const EXTENSION_ID = /^[a-z][a-z0-9-]{1,39}$/;
export const EXTENSION_VERSION = /^\d{1,5}\.\d{1,5}\.\d{1,6}(?:-[0-9a-z.-]{1,40})?$/i;
const RELATIVE_FILE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]{1,200}$/;
export const NPM_PACKAGE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

export const EXTENSION_SLOTS = [
  'afterHeader',
  'beforeFooter',
  'bodyEnd',
  'homeTop',
  'homeSidebar',
  'profileSidebar',
  'profileTab',
  'boardTop',
  'topicTop',
  'topicBottom',
  'postFooter',
  'postActions',
] as const;
export type ExtensionSlot = (typeof EXTENSION_SLOTS)[number];
export const EXTENSION_SLOT_INFO: Record<ExtensionSlot, { label: string; description: string }> = {
  afterHeader: { label: 'Üst çubuğun altı', description: 'Tüm forum sayfalarında içeriğin üstünde.' },
  beforeFooter: { label: 'Alt bilginin üstü', description: 'Tüm forum sayfalarında içeriğin altında.' },
  bodyEnd: { label: 'Sayfa sonu', description: 'Görünmeyen ya da sabit konumlu öğeler (sohbet balonu vb.).' },
  homeTop: { label: 'Ana sayfanın üstü', description: 'Forum dizininde bölümlerin üstünde.' },
  homeSidebar: { label: 'Ana sayfa yan sütunu', description: 'Forum dizininin yan sütununda bir kart.' },
  profileSidebar: { label: 'Profil yan sütunu', description: 'Üye profilinde yan sütunda bir kart.' },
  profileTab: { label: 'Profil sekmesi', description: 'Üye profilinde ayrı bir sekme.' },
  boardTop: { label: 'Bölümün üstü', description: 'Bölüm sayfasında konu listesinin üstünde (req.board).' },
  topicTop: { label: 'Konunun üstü', description: 'Konu sayfasında ilk mesajın üstünde (req.topic).' },
  topicBottom: { label: 'Konunun altı', description: 'Konu sayfasında son mesajdan sonra, yanıt kutusunun üstünde (req.topic).' },
  postFooter: { label: 'Mesajın altı', description: 'Her mesajın içeriğinin altında (req.post, req.topic).' },
  postActions: { label: 'Mesaj düğmeleri', description: 'Her mesajın alt çubuğunda, Düzenle / Alıntıla yanında (ör. Şikayet et).' },
};

export const EXTENSION_SETTING_TYPES = ['text', 'textarea', 'number', 'boolean', 'select', 'secret', 'color', 'url', 'groups'] as const;
export type ExtensionSettingType = (typeof EXTENSION_SETTING_TYPES)[number];

const label = z.string().trim().min(1).max(120);

export const extensionSettingField = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/, 'Ayar anahtarı harfle başlamalı (a-z, 0-9, _).'),
  type: z.enum(EXTENSION_SETTING_TYPES).default('text'),
  label,
  hint: z.string().max(500).optional(),
  section: z.string().trim().max(60).optional(),
  default: z.unknown().optional(),
  options: z.array(z.object({ value: z.string().max(100), label: z.string().max(120) })).max(100).optional(),
  required: z.boolean().default(false),
  min: z.number().optional(),
  max: z.number().optional(),
  placeholder: z.string().max(200).optional(),
  public: z.boolean().default(false),
});
export type ExtensionSettingField = z.output<typeof extensionSettingField>;

const groupDefault = z.union([z.literal(1), z.literal(-1)]);
export const extensionPermissionField = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,40}$/, 'Yetki anahtarı küçük harfle başlamalı.'),
  label,
  description: z.string().max(300).optional(),
  defaults: z.object({ guest: groupDefault, member: groupDefault, global_moderator: groupDefault, moderator: groupDefault }).partial().default({}),
  guestGrantable: z.boolean().default(false),
  dangerous: z.boolean().default(false),
});
export type ExtensionPermissionField = z.output<typeof extensionPermissionField>;

const cspList = z.array(z.string().trim().regex(CSP_SOURCE, 'Geçersiz kaynak (ör. https://api.ornek.com).')).max(30).default([]);

export const extensionManifestSchema = z.object({
  id: z
    .string()
    .regex(EXTENSION_ID, 'Eklenti kimliği küçük harfle başlamalı; yalnızca a-z, 0-9 ve - (2-40 karakter).')
    .refine((v) => v !== 'docs' && v !== 'node-modules', 'Bu kimlik ayrılmış; başka bir kimlik seçin.'),
  name: z.string().trim().min(1).max(60),
  version: z.string().regex(EXTENSION_VERSION, 'Sürüm 1.2.3 biçiminde olmalı.'),
  description: z.string().trim().max(500).default(''),
  author: z.string().trim().max(100).default(''),
  homepage: z.string().url().max(300).optional(),
  license: z.string().max(60).optional(),
  icon: z.string().regex(/^[a-z0-9-]{1,60}$/).default('puzzle-piece'),
  inkforum: z.string().max(40).default('*'),
  server: z.string().regex(RELATIVE_FILE).optional(),
  client: z
    .object({ scripts: z.array(z.string().regex(RELATIVE_FILE)).max(20).default([]), styles: z.array(z.string().regex(RELATIVE_FILE)).max(20).default([]) })
    .default({ scripts: [], styles: [] }),
  settings: z.array(extensionSettingField).max(100).default([]),
  permissions: z.array(extensionPermissionField).max(50).default([]),
  nav: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(40),
        url: z.string().trim().min(1).max(300),
        icon: z.string().regex(/^[a-z0-9-]{1,60}$/).optional(),
        visibility: z.enum(['all', 'members', 'guests']).default('all'),
        permission: z.string().max(80).optional(),
      }),
    )
    .max(10)
    .default([]),
  csp: z
    .object({ script: cspList, connect: cspList, style: cspList, font: cspList, frame: cspList, img: cspList })
    .partial()
    .default({}),
});
export type ExtensionManifest = z.output<typeof extensionManifestSchema>;

export function versionSatisfies(version: string, range: string): boolean {
  const parts = range.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return true;
  return parts.every((part) => {
    if (part === '*' || part === 'x') return true;
    const m = /^(>=|<=|>|<|=|\^|~)?v?(\d+(?:\.\d+){0,2})$/.exec(part);
    if (!m) return false;
    const op = m[1] ?? '=';
    const want = m[2]!.split('.').concat(['0', '0']).slice(0, 3).join('.');
    const c = compareVersions(version, want);
    const [maj, min] = want.split('.').map(Number) as [number, number];
    const [vmaj, vmin] = version.split('.').map(Number) as [number, number];
    switch (op) {
      case '>=':
        return c >= 0;
      case '<=':
        return c <= 0;
      case '>':
        return c > 0;
      case '<':
        return c < 0;
      case '^':
        return c >= 0 && vmaj === maj;
      case '~':
        return c >= 0 && vmaj === maj && vmin === min;
      default:
        return c === 0;
    }
  });
}

export type ExtensionStatus = 'active' | 'disabled' | 'error' | 'incompatible';
export type ExtensionSource = 'builtin' | 'upload' | 'npm' | 'local';

export interface AdminExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage: string | null;
  icon: string;
  iconNode: IconNode | null;
  source: ExtensionSource;
  packageName: string | null;
  enabled: boolean;
  status: ExtensionStatus;
  error: string | null;
  category: string | null;
  features: string[];
  stats: string[];
  adminHref: string | null;
  publicHref: string | null;
  capabilities: ExtensionCapabilities;
  installedAt: number | null;
  updatedAt: number | null;
}

export interface ExtensionCapabilities {
  server: boolean;
  pages: string[];
  adminPages: Array<{ key: string; title: string; icon: string }>;
  routes: number;
  slots: ExtensionSlot[];
  clientScripts: number;
  clientStyles: number;
  permissions: string[];
  settings: number;
  nav: number;
  csp: string[];
  jobs: string[];
  events: string[];
}

export interface ExtensionsOverview {
  items: AdminExtension[];
  safeMode: boolean;
  coreVersion: string;
  directory: string;
}

export interface AdminExtensionDetail {
  extension: AdminExtension;
  fields: ExtensionSettingField[];
  values: Record<string, unknown>;
  readmeHtml: string | null;
  logs: Array<{ at: number; level: 'info' | 'warn' | 'error'; message: string }>;
}

export interface ExtensionSample {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon: string;
  iconNode: IconNode | null;
  installedVersion: string | null;
}

export const extensionStarterQuery = z.object({
  id: z.string().regex(EXTENSION_ID, 'Kimlik küçük harfle başlamalı; yalnızca a-z, 0-9 ve - (2-40 karakter).'),
  name: z.string().trim().min(1).max(60),
});

export interface ExtensionPackagePreview {
  token: string;
  manifest: ExtensionManifest;
  installedVersion: string | null;
  compatible: boolean;
  files: number;
  size: number;
  hasServer: boolean;
  dependencies: string[];
  warnings: string[];
}

export interface ExtensionClientBundle {
  scripts: Array<{ ext: string; src: string }>;
  styles: string[];
  slots: Partial<Record<ExtensionSlot, ExtensionSlotItem[]>>;
  settings: Record<string, Record<string, unknown>>;
  csp: CspSources;
}

export interface ExtensionSlotItem {
  ext: string;
  key: string;
  title: string | null;
  html: string;
  scripts: string[];
}

export interface ExtensionPageView {
  kind: 'extension';
  ext: string;
  extName: string;
  path: string;
  title: string;
  html: string;
  layout: 'default' | 'wide' | 'blank';
  showTitle: boolean;
  description: string | null;
  scripts: string[];
  styles: string[];
  data: unknown;
}

export interface ExtensionAdminPageView {
  ext: string;
  extName: string;
  key: string;
  title: string;
  html: string;
  scripts: string[];
  styles: string[];
  data: unknown;
}

export interface ExtensionAdminMenu {
  id: string;
  name: string;
  icon: string;
  iconNode: IconNode | null;
  pages: Array<{ key: string; title: string; icon: string; iconNode: IconNode | null }>;
  hasSettings: boolean;
}

export interface ExtensionTopicSlots {
  topicTop: ExtensionSlotItem[];
  topicBottom: ExtensionSlotItem[];
  posts: Record<number, { postFooter?: ExtensionSlotItem[]; postActions?: ExtensionSlotItem[] }>;
}

export interface ExtensionAccountMenuItem {
  ext: string;
  key: string;
  title: string;
  iconNode: IconNode | null;
}

export interface ExtensionRouteOverride {
  base: string;
  wildcard: boolean;
}

export interface ExtensionProfileSlots {
  sidebar: ExtensionSlotItem[];
  tabs: ExtensionSlotItem[];
}

export const extensionToggleInput = z.object({ enabled: z.boolean() });
export const extensionNpmInput = z.object({
  name: z.string().trim().min(1).max(214).regex(NPM_PACKAGE, 'Geçersiz paket adı.'),
  version: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9a-z.^~<>=*-]*$/i)
    .default('latest'),
});
export const extensionInstallInput = z.object({ token: z.string().regex(/^[a-f0-9]{32}$/), enable: z.boolean().default(true) });
export const extensionUninstallInput = z.object({ deleteData: z.boolean().default(false) });
