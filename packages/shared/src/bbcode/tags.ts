export type TagKind = 'inline' | 'block' | 'raw-inline' | 'raw-block' | 'void';

export interface TagDef {
  name: string;
  kind: TagKind;
  parents?: string[];
}

const defs: TagDef[] = [
  { name: 'b', kind: 'inline' },
  { name: 'i', kind: 'inline' },
  { name: 'u', kind: 'inline' },
  { name: 's', kind: 'inline' },
  { name: 'sub', kind: 'inline' },
  { name: 'sup', kind: 'inline' },
  { name: 'color', kind: 'inline' },
  { name: 'size', kind: 'inline' },
  { name: 'font', kind: 'inline' },
  { name: 'url', kind: 'inline' },
  { name: 'email', kind: 'inline' },
  { name: 'icode', kind: 'raw-inline' },
  { name: 'img', kind: 'raw-inline' },
  { name: 'mention', kind: 'raw-inline' },
  { name: 'noparse', kind: 'raw-inline' },
  { name: 'code', kind: 'raw-block' },
  { name: 'media', kind: 'raw-block' },
  { name: 'youtube', kind: 'raw-block' },
  { name: 'embed', kind: 'raw-block' },
  { name: 'quote', kind: 'block' },
  { name: 'spoiler', kind: 'block' },
  { name: 'list', kind: 'block' },
  { name: '*', kind: 'block', parents: ['list'] },
  { name: 'table', kind: 'block' },
  { name: 'tr', kind: 'block', parents: ['table'] },
  { name: 'td', kind: 'block', parents: ['tr'] },
  { name: 'th', kind: 'block', parents: ['tr'] },
  { name: 'left', kind: 'block' },
  { name: 'center', kind: 'block' },
  { name: 'right', kind: 'block' },
  { name: 'justify', kind: 'block' },
  { name: 'hr', kind: 'void' },
  { name: 'h2', kind: 'block' },
  { name: 'h3', kind: 'block' },
  { name: 'h4', kind: 'block' },
];

export const BB_TAGS: ReadonlyMap<string, TagDef> = new Map(defs.map((d) => [d.name, d]));

export function isBlockTag(name: string): boolean {
  const k = BB_TAGS.get(name)?.kind;
  return k === 'block' || k === 'raw-block' || k === 'void';
}

export const ALIGN_TAGS = ['left', 'center', 'right', 'justify'] as const;
export type AlignTag = (typeof ALIGN_TAGS)[number];

export const BB_FONTS = [
  'Arial',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Impact',
  'Comic Sans MS',
] as const;

export const BB_SIZES: Record<string, number> = { '1': 10, '2': 12, '3': 14, '4': 16, '5': 20, '6': 24, '7': 32 };

const NAMED_COLORS = new Set([
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'brown', 'gray', 'grey',
  'navy', 'teal', 'maroon', 'olive', 'lime', 'aqua', 'cyan', 'magenta', 'silver', 'gold', 'crimson', 'indigo', 'violet',
]);

export function safeColor(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(s)) return s;
  if (NAMED_COLORS.has(s)) return s;
  return null;
}

export function safeSize(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (BB_SIZES[s]) return BB_SIZES[s]!;
  const m = /^(\d{1,2})(px|pt)?$/.exec(s);
  if (!m) return null;
  let px = Number(m[1]);
  if (m[2] === 'pt') px = Math.round(px * 1.333);
  if (!m[2] && px <= 7) return BB_SIZES[String(px)] ?? null;
  return px >= 8 && px <= 48 ? px : null;
}

export function safeFont(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim().replace(/^["']|["']$/g, '');
  return BB_FONTS.find((f) => f.toLowerCase() === s.toLowerCase()) ?? null;
}

export function safeUrl(v: string | null | undefined, opts: { allowMailto?: boolean } = {}): string | null {
  if (!v) return null;
  const s = v.trim();
  if (!s || s.length > 2000 || /[\s<>"'`\\]/.test(s)) return null;
  if (/^https?:\/\/[^/\s]+/i.test(s)) return s;
  if (opts.allowMailto && /^mailto:[^@\s]+@[^@\s]+$/i.test(s)) return s;
  if (/^\/(?!\/)/.test(s) || s.startsWith('#')) return s;
  if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#].*)?$/i.test(s)) return `https://${s}`;
  return null;
}

export function safeImageUrl(v: string | null | undefined): string | null {
  const u = safeUrl(v);
  if (!u || u.startsWith('#')) return null;
  return u;
}
