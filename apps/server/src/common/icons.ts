import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { icons as catalog } from '@phosphor-icons/core';
import type { IconNode } from '@forum/shared';

export type IconWeight = 'regular' | 'bold' | 'fill' | 'duotone';

const require = createRequire(import.meta.url);
const ASSETS = dirname(dirname(require.resolve('@phosphor-icons/core/assets/regular/house.svg')));

const NAMES = new Set<string>(catalog.map((i) => i.name));

export const LEGACY_ICONS: Record<string, string> = {
  'messages-square': 'chats-circle',
  'message-square': 'chat-centered-text',
  'message-square-text': 'chat-text',
  'message-circle': 'chat-circle',
  'book-marked': 'bookmark-simple',
  'book-open': 'book-open-text',
  search: 'magnifying-glass',
  radio: 'broadcast',
  megaphone: 'megaphone',
  'life-buoy': 'lifebuoy',
  hand: 'hand-waving',
  'gamepad-2': 'game-controller',
  music: 'music-notes',
  film: 'film-slate',
  zap: 'lightning',
  sparkles: 'sparkle',
  settings: 'gear',
  cog: 'gear',
  'help-circle': 'question',
  'circle-help': 'question',
  mail: 'envelope',
  'trash-2': 'trash',
  pin: 'push-pin',
  flame: 'fire',
  layers: 'stack',
  'layout-dashboard': 'squares-four',
  'external-link': 'arrow-square-out',
  'file-text': 'file-text',
  newspaper: 'newspaper',
  'shield-check': 'shield-check',
  home: 'house',
};

export function resolveIconName(name: string | null | undefined): string | null {
  if (!name) return null;
  if (NAMES.has(name)) return name;
  const legacy = LEGACY_ICONS[name];
  return legacy && NAMES.has(legacy) ? legacy : null;
}

export function iconExists(name: string | null | undefined): boolean {
  return resolveIconName(name) !== null;
}

const cache = new Map<string, IconNode>();
const TAG = /<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*?)\/?>/g;
const ATTR = /([a-zA-Z-]+)="([^"]*)"/g;

function parse(svg: string): IconNode {
  const out: IconNode = [];
  for (const [, tag, rawAttrs] of svg.matchAll(TAG)) {
    const attrs: Record<string, string> = {};
    for (const [, k, v] of rawAttrs!.matchAll(ATTR)) attrs[k!] = v!;
    if (tag === 'rect' && attrs.fill === 'none' && attrs.width === '256') continue;
    out.push([tag!, attrs]);
  }
  return out;
}

export function iconNode(name: string | null | undefined, weight: IconWeight = 'duotone'): IconNode | null {
  const resolved = resolveIconName(name);
  if (!resolved) return null;
  const key = `${resolved}:${weight}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const file = weight === 'regular' ? `${ASSETS}/regular/${resolved}.svg` : `${ASSETS}/${weight}/${resolved}-${weight}.svg`;
    const nodes = parse(readFileSync(file, 'utf8'));
    cache.set(key, nodes);
    return nodes;
  } catch {
    return null;
  }
}

export interface IconSearchHit {
  name: string;
  nodes: IconNode;
}

export function searchIcons(query: string, limit = 160, weight: IconWeight = 'duotone'): IconSearchHit[] {
  const q = query.trim().toLocaleLowerCase('en').replace(/\s+/g, '-');
  const scored: Array<{ name: string; score: number }> = [];
  for (const i of catalog) {
    if (!q) {
      scored.push({ name: i.name, score: 0 });
      continue;
    }
    let score = -1;
    if (i.name === q) score = 100;
    else if (i.name.startsWith(q)) score = 60;
    else if (i.name.includes(q)) score = 40;
    else if ((i.tags as readonly string[]).some((t) => t.toLowerCase().includes(q.replace(/-/g, ' ')))) score = 20;
    else if ((i.categories as readonly string[]).some((c) => c.includes(q))) score = 10;
    if (score >= 0) scored.push({ name: i.name, score });
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const out: IconSearchHit[] = [];
  for (const s of scored) {
    if (out.length >= limit) break;
    const nodes = iconNode(s.name, weight);
    if (nodes) out.push({ name: s.name, nodes });
  }
  return out;
}
