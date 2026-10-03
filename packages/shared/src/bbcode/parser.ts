import { BB_TAGS, isBlockTag } from './tags.js';

export interface BBText {
  type: 'text';
  text: string;
}

export interface BBTag {
  type: 'tag';
  name: string;
  value: string | null;
  attrs: Record<string, string>;
  children: BBNode[];
}

export type BBNode = BBText | BBTag;

const MAX_DEPTH = 24;
const MAX_TAG_LENGTH = 300;

interface RawTag {
  closing: boolean;
  name: string;
  value: string | null;
  attrs: Record<string, string>;
  source: string;
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) return t.slice(1, -1);
  return t;
}

function readTag(inner: string, source: string): RawTag | null {
  const m = /^(\/?)([a-z]+[1-6]?|\*)/i.exec(inner);
  if (!m) return null;
  const closing = m[1] === '/';
  const name = m[2]!.toLowerCase();
  if (!BB_TAGS.has(name)) return null;
  const rest = inner.slice(m[0].length);
  if (closing) return rest.trim() ? null : { closing, name, value: null, attrs: {}, source };
  if (!rest) return { closing, name, value: null, attrs: {}, source };

  if (rest.startsWith('=')) {
    const body = rest.slice(1);
    const quoted = /^("([^"]*)"|'([^']*)')(.*)$/.exec(body);
    if (quoted) {
      const value = quoted[2] ?? quoted[3] ?? '';
      const attrs = parseAttrs(quoted[4] ?? '');
      if (attrs === null) return null;
      return { closing, name, value, attrs, source };
    }
    const split = /\s+[a-z]+=/i.exec(body);
    if (split && name !== 'url' && name !== 'img') {
      const attrs = parseAttrs(body.slice(split.index));
      if (attrs === null) return null;
      return { closing, name, value: unquote(body.slice(0, split.index)), attrs, source };
    }
    return { closing, name, value: unquote(body), attrs: {}, source };
  }
  if (!/^\s/.test(rest)) return null;
  const attrs = parseAttrs(rest);
  if (attrs === null) return null;
  return { closing, name, value: null, attrs, source };
}

function parseAttrs(s: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  const re = /\s*([a-z]+)=("([^"]*)"|'([^']*)'|(.*?))(?=\s+[a-z]+=|\s*$)/giy;
  let pos = 0;
  while (pos < s.length) {
    if (!s.slice(pos).trim()) break;
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m || m.index !== pos) return null;
    out[m[1]!.toLowerCase()] = (m[3] ?? m[4] ?? m[5] ?? '').trim();
    pos = re.lastIndex;
  }
  return out;
}

export function parseBBCode(input: string): BBNode[] {
  const src = (input ?? '').replace(/\r\n?/g, '\n');
  const root: BBTag = { type: 'tag', name: '#root', value: null, attrs: {}, children: [] };
  const stack: BBTag[] = [root];
  let text = '';

  const top = () => stack[stack.length - 1]!;
  const flush = () => {
    if (!text) return;
    const children = top().children;
    const last = children[children.length - 1];
    if (last?.type === 'text') last.text += text;
    else children.push({ type: 'text', text });
    text = '';
  };

  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('[', i);
    if (open === -1) {
      text += src.slice(i);
      break;
    }
    text += src.slice(i, open);
    const close = src.indexOf(']', open + 1);
    const nextOpen = src.indexOf('[', open + 1);
    if (close === -1 || close - open > MAX_TAG_LENGTH || (nextOpen !== -1 && nextOpen < close)) {
      text += '[';
      i = open + 1;
      continue;
    }
    const source = src.slice(open, close + 1);
    const tag = readTag(src.slice(open + 1, close), source);
    if (!tag) {
      text += '[';
      i = open + 1;
      continue;
    }
    const def = BB_TAGS.get(tag.name)!;

    if (tag.closing) {
      const idx = findOpen(stack, tag.name);
      if (idx === -1) {
        text += source;
      } else {
        flush();
        stack.length = idx;
      }
      i = close + 1;
      continue;
    }

    if (def.kind === 'raw-inline' || def.kind === 'raw-block') {
      const re = new RegExp(`\\[/${tag.name}\\]`, 'i');
      const rest = src.slice(close + 1);
      const m = re.exec(rest);
      if (!m) {
        text += source;
        i = close + 1;
        continue;
      }
      flush();
      top().children.push({
        type: 'tag',
        name: tag.name,
        value: tag.value,
        attrs: tag.attrs,
        children: [{ type: 'text', text: rest.slice(0, m.index) }],
      });
      i = close + 1 + m.index + m[0].length;
      continue;
    }

    if (def.kind === 'void') {
      flush();
      top().children.push({ type: 'tag', name: tag.name, value: tag.value, attrs: tag.attrs, children: [] });
      i = close + 1;
      continue;
    }

    if (tag.name === '*') {
      const itemIdx = findOpen(stack, '*');
      const listIdx = findOpen(stack, 'list');
      if (itemIdx !== -1 && itemIdx > listIdx) {
        flush();
        stack.length = itemIdx;
      }
    }
    if (tag.name === 'td' || tag.name === 'th' || tag.name === 'tr') {
      const siblings = tag.name === 'tr' ? ['tr'] : ['td', 'th'];
      const parentIdx = findOpen(stack, tag.name === 'tr' ? 'table' : 'tr');
      for (const s of siblings) {
        const idx = findOpen(stack, s);
        if (idx !== -1 && idx > parentIdx) {
          flush();
          stack.length = idx;
        }
      }
    }

    if (def.parents && !def.parents.includes(top().name)) {
      text += source;
      i = close + 1;
      continue;
    }
    if (stack.length > MAX_DEPTH) {
      text += source;
      i = close + 1;
      continue;
    }

    flush();
    const node: BBTag = { type: 'tag', name: tag.name, value: tag.value, attrs: tag.attrs, children: [] };
    top().children.push(node);
    stack.push(node);
    i = close + 1;
  }
  flush();
  return normalize(root.children);
}

function findOpen(stack: BBTag[], name: string): number {
  for (let k = stack.length - 1; k > 0; k--) if (stack[k]!.name === name) return k;
  return -1;
}

function normalize(nodes: BBNode[], parent?: BBTag): BBNode[] {
  const out: BBNode[] = [];
  for (const n of nodes) {
    if (n.type === 'tag') {
      const raw = BB_TAGS.get(n.name)?.kind;
      if (raw !== 'raw-inline' && raw !== 'raw-block') n.children = normalize(n.children, n);
    }
    out.push(n);
  }
  const parentIsBlock = parent ? isBlockTag(parent.name) : false;
  for (let k = 0; k < out.length; k++) {
    const n = out[k]!;
    if (n.type !== 'text') continue;
    const prev = out[k - 1];
    const next = out[k + 1];
    if ((prev && prev.type === 'tag' && isBlockTag(prev.name)) || (!prev && parentIsBlock)) {
      n.text = n.text.replace(/^[ \t]*\n/, '');
    }
    if ((next && next.type === 'tag' && isBlockTag(next.name)) || (!next && parentIsBlock)) {
      n.text = n.text.replace(/\n[ \t]*$/, '');
    }
  }
  const structural = parent && (parent.name === 'list' || parent.name === 'table' || parent.name === 'tr');
  return out.filter((n) => n.type !== 'text' || (n.text !== '' && !(structural && !n.text.trim())));
}

export function walkBB(nodes: BBNode[], fn: (tag: BBTag, depth: number) => void, depth = 0): void {
  for (const n of nodes) {
    if (n.type !== 'tag') continue;
    fn(n, depth);
    walkBB(n.children, fn, depth + 1);
  }
}

export function rawContent(tag: BBTag): string {
  const first = tag.children[0];
  return first?.type === 'text' ? first.text : '';
}
