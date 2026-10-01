import { z } from 'zod';
import type { DeployMode } from './install.js';

/**
 * Sürümler ve otomatik güncelleme. Yayınlar GitHub'daki dağıtım deposundan (varsayılan vokartz/inkforum)
 * okunur; sürüm notları yayın açıklamasındaki Markdown metnidir.
 */

export const PRODUCT_NAME = 'InkForum';
export const DEFAULT_UPDATE_REPO = 'vokartz/inkforum';

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  pre: string | null;
}

export function parseVersion(v: string): SemVer | null {
  const m = SEMVER.exec(v.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ?? null };
}

export function isVersion(v: string): boolean {
  return parseVersion(v) !== null;
}

/** "v1.2.3" → "1.2.3" */
export function cleanVersion(v: string): string {
  return v.trim().replace(/^v/, '');
}

function comparePre(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1; // kararlı sürüm, ön sürümden büyüktür
  if (b === null) return -1;
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x) ? Number(x) : null;
    const ny = /^\d+$/.test(y) ? Number(y) : null;
    if (nx !== null && ny !== null) {
      if (nx !== ny) return nx < ny ? -1 : 1;
    } else if (nx !== null) return -1;
    else if (ny !== null) return 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** a < b → -1, eşit → 0, a > b → 1 (geçersiz sürümler en küçük sayılır) */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  for (const k of ['major', 'minor', 'patch'] as const) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  return comparePre(x.pre, y.pre);
}

export type UpdateKind = 'major' | 'minor' | 'patch' | 'pre';

/** Mevcut sürümden hedefe geçişin türü */
export function updateKind(from: string, to: string): UpdateKind | null {
  const a = parseVersion(from);
  const b = parseVersion(to);
  if (!a || !b || compareVersions(from, to) >= 0) return null;
  if (b.major !== a.major) return 'major';
  if (b.minor !== a.minor) return 'minor';
  if (b.patch !== a.patch) return 'patch';
  return 'pre';
}

/**
 * Sürüm notları İngilizce yazılır; Türkçe çevirisi bu işaretten sonra, GitHub'da açılır bir bölümde gelir
 * (scripts/release/notes.mjs). Yönetim paneli yöneticinin diline uygun kısmı gösterir.
 */
export const RELEASE_NOTES_TR_MARKER = '<!-- inkforum:tr -->';

export function pickReleaseNotes(body: string, locale: string): string {
  const i = body.indexOf(RELEASE_NOTES_TR_MARKER);
  if (i < 0) return body;
  if (locale !== 'tr') return body.slice(0, i).trim();
  return body
    .slice(i + RELEASE_NOTES_TR_MARKER.length)
    .replace(/<\/?details[^>]*>|<summary>[\s\S]*?<\/summary>/gi, '')
    .trim();
}

export const UPDATE_CHANNELS = ['stable', 'beta'] as const;
export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];

export const AUTO_INSTALL_MODES = ['off', 'patch', 'minor', 'all'] as const;
export type AutoInstallMode = (typeof AUTO_INSTALL_MODES)[number];
export const AUTO_INSTALL_INFO: Record<AutoInstallMode, { label: string; description: string }> = {
  off: { label: 'Kapalı', description: 'Yeni sürüm bildirilir; kurulumu sen başlatırsın.' },
  patch: { label: 'Yalnızca düzeltmeler', description: 'Hata ve güvenlik düzeltmeleri (1.2.x) otomatik kurulur.' },
  minor: { label: 'Düzeltmeler ve yeni özellikler', description: 'Ana sürüm dışındaki tüm güncellemeler (1.x) otomatik kurulur.' },
  all: { label: 'Tüm güncellemeler', description: 'Ana sürümler dahil her yeni sürüm otomatik kurulur.' },
};

/** Otomatik kurulumun bu geçişe izin verip vermediği */
export function autoInstallAllows(mode: AutoInstallMode, kind: UpdateKind | null): boolean {
  if (!kind || mode === 'off') return false;
  if (mode === 'all') return true;
  if (mode === 'minor') return kind !== 'major';
  return kind === 'patch';
}

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface ReleaseInfo {
  version: string;
  name: string;
  /** Markdown */
  notes: string;
  /** Güvenli HTML (sunucuda üretilir) */
  notesHtml: string;
  publishedAt: number;
  prerelease: boolean;
  url: string;
  assets: ReleaseAsset[];
}

export type UpdateJobState = 'idle' | 'backup' | 'download' | 'install' | 'restart' | 'verify' | 'done' | 'failed' | 'rolledback';

export interface UpdateJob {
  state: UpdateJobState;
  version: string | null;
  from: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  log: Array<{ at: number; message: string; level: 'info' | 'warn' | 'error' }>;
  error: string | null;
}

export interface UpdateStatus {
  product: string;
  current: { version: string; build: string | null; deploy: DeployMode; node: string };
  repo: string;
  checkedAt: number | null;
  checkError: string | null;
  latest: ReleaseInfo | null;
  available: boolean;
  kind: UpdateKind | null;
  releases: ReleaseInfo[];
  canInstall: boolean;
  /** Kurulum yapılamıyorsa nedeni */
  installBlocker: string | null;
  job: UpdateJob | null;
  settings: UpdateSettingsInput;
}

export const updateSettingsInput = z.object({
  autoCheck: z.boolean().default(true),
  channel: z.enum(UPDATE_CHANNELS).default('stable'),
  autoInstall: z.enum(AUTO_INSTALL_MODES).default('off'),
  /** Otomatik kurulumun yapılacağı saat (sunucu saatiyle, 0–23) */
  installHour: z.number().int().min(0).max(23).default(4),
  notifyAdmins: z.boolean().default(true),
});
export type UpdateSettingsInput = z.output<typeof updateSettingsInput>;

export const installUpdateInput = z.object({
  version: z.string().trim().max(40).refine(isVersion, 'Geçersiz sürüm.'),
});
