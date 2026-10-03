import { parseBBCode, rawContent, type BBNode, type BBTag } from './parser.js';
import { BB_SIZES, BB_TAGS, safeColor, safeFont, safeSize } from './tags.js';

export interface PMMark {
  type: string;
  attrs?: Record<string, any>;
}

export interface PMNode {
  type: string;
  attrs?: Record<string, any>;
  content?: PMNode[];
  marks?: PMMark[];
  text?: string;
}

type Align = 'left' | 'center' | 'right' | 'justify' | null;

const MARK_TAGS: Record<string, string> = {
  b: 'bold',
  i: 'italic',
  u: 'underline',
  s: 'strike',
  sub: 'subscript',
  sup: 'superscript',
};

function addMark(marks: PMMark[], mark: PMMark): PMMark[] {
  if (mark.type === 'textStyle') {
    const existing = marks.find((m) => m.type === 'textStyle');
    const rest = marks.filter((m) => m.type !== 'textStyle');
    return [...rest, { type: 'textStyle', attrs: { ...(existing?.attrs ?? {}), ...mark.attrs } }];
  }
  return [...marks.filter((m) => m.type !== mark.type), mark];
}

function para(content: PMNode[], align: Align): PMNode {
  const node: PMNode = { type: 'paragraph' };
  if (align && align !== 'left') node.attrs = { textAlign: align };
  if (content.length) node.content = content;
  return node;
}

function ensureBlocks(blocks: PMNode[]): PMNode[] {
  return blocks.length ? blocks : [{ type: 'paragraph' }];
}

function textNode(text: string, marks: PMMark[]): PMNode {
  return marks.length ? { type: 'text', text, marks } : { type: 'text', text };
}

function toBlocks(nodes: BBNode[], marks: PMMark[] = [], align: Align = null): PMNode[] {
  const blocks: PMNode[] = [];
  let current: PMNode[] | null = null;

  const pushInline = (n: PMNode) => {
    (current ??= []).push(n);
  };
  const endParagraph = () => {
    blocks.push(para(current ?? [], align));
    current = null;
  };
  const flush = () => {
    if (current) endParagraph();
  };

  const walk = (list: BBNode[], m: PMMark[]) => {
    for (const n of list) {
      if (n.type === 'text') {
        const parts = n.text.split('\n');
        parts.forEach((part, idx) => {
          if (idx > 0) endParagraph();
          if (part) pushInline(textNode(part, m));
        });
        continue;
      }
      inlineOrBlock(n, m);
    }
  };

  const inlineOrBlock = (n: BBTag, m: PMMark[]) => {
    const markType = MARK_TAGS[n.name];
    if (markType) return walk(n.children, addMark(m, { type: markType }));
    switch (n.name) {
      case 'color': {
        const c = safeColor(n.value);
        return walk(n.children, c ? addMark(m, { type: 'textStyle', attrs: { color: c } }) : m);
      }
      case 'size': {
        const px = safeSize(n.value);
        return walk(n.children, px ? addMark(m, { type: 'textStyle', attrs: { fontSize: `${px}px` } }) : m);
      }
      case 'font': {
        const f = safeFont(n.value);
        return walk(n.children, f ? addMark(m, { type: 'textStyle', attrs: { fontFamily: f } }) : m);
      }
      case 'url': {
        const href = n.value ?? rawText(n.children);
        return walk(n.children, addMark(m, { type: 'link', attrs: { href } }));
      }
      case 'email': {
        const addr = n.value ?? rawText(n.children);
        return walk(n.children, addMark(m, { type: 'link', attrs: { href: `mailto:${addr}` } }));
      }
      case 'icode':
        if (rawContent(n)) pushInline(textNode(rawContent(n), addMark(m, { type: 'code' })));
        return;
      case 'noparse':
        return walk([{ type: 'text', text: rawContent(n) }], m);
      case 'img': {
        const attrs: Record<string, any> = { src: rawContent(n).trim() };
        const dim = /^(\d{1,4})x(\d{1,4})$/i.exec(n.value ?? '');
        const w = dim ? Number(dim[1]) : Number(n.attrs.width) || null;
        const h = dim ? Number(dim[2]) : Number(n.attrs.height) || null;
        if (w) attrs.width = w;
        if (h) attrs.height = h;
        if (n.attrs.alt) attrs.alt = n.attrs.alt;
        pushInline({ type: 'image', attrs });
        return;
      }
      case 'mention': {
        const id = Number(n.value);
        const label = rawContent(n).trim().replace(/^@/, '');
        if (Number.isInteger(id) && id > 0 && label) pushInline({ type: 'mention', attrs: { id: String(id), label } });
        else walk([{ type: 'text', text: rawContent(n) }], m);
        return;
      }
      case 'hr':
        flush();
        blocks.push({ type: 'horizontalRule' });
        return;
      case 'code': {
        flush();
        const text = rawContent(n).replace(/^\n/, '').replace(/\n$/, '');
        const node: PMNode = { type: 'codeBlock', attrs: { language: n.value?.trim().toLowerCase() || null } };
        if (text) node.content = [{ type: 'text', text }];
        blocks.push(node);
        return;
      }
      case 'media':
      case 'youtube':
      case 'embed':
        flush();
        blocks.push({ type: 'media', attrs: { src: rawContent(n).trim() } });
        return;
      case 'quote': {
        flush();
        const attrs: Record<string, any> = { author: (n.attrs.author ?? n.value ?? '').trim() || null };
        attrs.post = Number(n.attrs.post) || null;
        attrs.date = Number(n.attrs.date) || null;
        blocks.push({ type: 'blockquote', attrs, content: ensureBlocks(toBlocks(n.children, m)) });
        return;
      }
      case 'spoiler':
        flush();
        blocks.push({
          type: 'spoiler',
          attrs: { title: (n.value ?? n.attrs.title ?? '').trim() || null },
          content: ensureBlocks(toBlocks(n.children, m)),
        });
        return;
      case 'list': {
        flush();
        const type = (n.value ?? n.attrs.type ?? '').trim();
        const ordered = ['1', 'a', 'A', 'i', 'I'].includes(type);
        const items = n.children
          .filter((c): c is BBTag => c.type === 'tag' && c.name === '*')
          .map((c) => ({ type: 'listItem', content: ensureBlocks(toBlocks(c.children, m)) }));
        if (!items.length) return;
        blocks.push(ordered ? { type: 'orderedList', attrs: { type }, content: items } : { type: 'bulletList', content: items });
        return;
      }
      case 'table': {
        flush();
        const rows = n.children
          .filter((c): c is BBTag => c.type === 'tag' && c.name === 'tr')
          .map((r) => ({
            type: 'tableRow',
            content: r.children
              .filter((c): c is BBTag => c.type === 'tag' && (c.name === 'td' || c.name === 'th'))
              .map((c) => ({ type: c.name === 'th' ? 'tableHeader' : 'tableCell', content: ensureBlocks(toBlocks(c.children, m)) })),
          }))
          .filter((r) => r.content.length);
        if (rows.length) blocks.push({ type: 'table', content: rows });
        return;
      }
      case 'left':
      case 'center':
      case 'right':
      case 'justify':
        flush();
        blocks.push(...toBlocks(n.children, m, n.name));
        return;
      case 'h2':
      case 'h3':
      case 'h4': {
        flush();
        const level = Number(n.name.slice(1));
        for (const b of toBlocks(n.children, m)) {
          if (b.type !== 'paragraph') blocks.push(b);
          else if (b.content?.length) blocks.push({ type: 'heading', attrs: { level }, content: b.content });
        }
        return;
      }
      default:
        walk(n.children, m);
    }
  };

  walk(nodes, marks);
  flush();
  return blocks;
}

function rawText(nodes: BBNode[]): string {
  return nodes.map((n) => (n.type === 'text' ? n.text : rawText(n.children))).join('');
}

export interface DocOptions {
  customEmoji?: (shortcode: string) => { url: string; name: string } | undefined;
}

const SHORTCODE_SPLIT = /:([a-z0-9_-]{2,32}):/g;

function splitEmojis(nodes: PMNode[] | undefined, find: NonNullable<DocOptions['customEmoji']>): PMNode[] | undefined {
  if (!nodes) return nodes;
  const out: PMNode[] = [];
  for (const n of nodes) {
    if (n.type === 'codeBlock') {
      out.push(n);
      continue;
    }
    if (n.type !== 'text' || !n.text?.includes(':') || n.marks?.some((m) => m.type === 'code')) {
      out.push(n.content ? { ...n, content: splitEmojis(n.content, find) } : n);
      continue;
    }
    let last = 0;
    const text = n.text;
    for (const m of text.matchAll(SHORTCODE_SPLIT)) {
      const e = find(m[1]!);
      if (!e) continue;
      if (m.index > last) out.push({ ...n, text: text.slice(last, m.index) });
      const node: PMNode = { type: 'customEmoji', attrs: { code: m[1], url: e.url, name: e.name } };
      if (n.marks?.length) node.marks = n.marks;
      out.push(node);
      last = m.index + m[0].length;
    }
    if (last === 0) out.push(n);
    else if (last < text.length) out.push({ ...n, text: text.slice(last) });
  }
  return out;
}

export function bbcodeToDoc(input: string, opts: DocOptions = {}): PMNode {
  const content = ensureBlocks(toBlocks(parseBBCode(input)));
  return { type: 'doc', content: opts.customEmoji ? splitEmojis(content, opts.customEmoji) : content };
}

interface VMark {
  key: string;
  open: string;
  close: string;
  raw?: boolean;
}

const SIMPLE_MARKS: Record<string, string> = {
  bold: 'b',
  italic: 'i',
  underline: 'u',
  strike: 's',
  subscript: 'sub',
  superscript: 'sup',
};

const SIZE_KEYS = new Map(Object.entries(BB_SIZES).map(([k, px]) => [px, k]));

function quoteAttr(v: string): string {
  const clean = v.replace(/["\]\n]/g, '').trim();
  return /[\s=]/.test(clean) || clean === '' ? `"${clean}"` : clean;
}

function vmarks(marks: PMMark[] | undefined): VMark[] {
  const out: VMark[] = [];
  const byType = new Map((marks ?? []).map((m) => [m.type, m]));
  const link = byType.get('link');
  if (link?.attrs?.href) {
    const href = String(link.attrs.href).replace(/[\]\n]/g, '');
    out.push(
      href.startsWith('mailto:')
        ? { key: `email=${href}`, open: `[email=${href.slice(7)}]`, close: '[/email]' }
        : { key: `url=${href}`, open: `[url=${href}]`, close: '[/url]' },
    );
  }
  const style = byType.get('textStyle')?.attrs ?? {};
  const color = safeColor(style.color);
  if (color) out.push({ key: `color=${color}`, open: `[color=${color}]`, close: '[/color]' });
  const px = safeSize(typeof style.fontSize === 'string' ? style.fontSize : null);
  if (px) {
    const v = SIZE_KEYS.get(px) ?? `${px}px`;
    out.push({ key: `size=${v}`, open: `[size=${v}]`, close: '[/size]' });
  }
  const font = safeFont(style.fontFamily);
  if (font) out.push({ key: `font=${font}`, open: `[font=${quoteAttr(font)}]`, close: '[/font]' });
  for (const [type, tag] of Object.entries(SIMPLE_MARKS)) {
    if (byType.has(type)) out.push({ key: tag, open: `[${tag}]`, close: `[/${tag}]` });
  }
  if (byType.has('code')) out.push({ key: 'icode', open: '[icode]', close: '[/icode]', raw: true });
  return out;
}

const TAG_LIKE = new RegExp(`\\[/?(?:${[...BB_TAGS.keys()].map((k) => k.replace('*', '\\*')).join('|')})(?:[=\\s][^\\]]*)?\\]`, 'gi');

function escapeText(text: string): string {
  return text.replace(TAG_LIKE, (m) => `[noparse]${m}[/noparse]`);
}

function inlineToBB(content: PMNode[] | undefined): string {
  let out = '';
  let active: VMark[] = [];
  const setMarks = (want: VMark[]) => {
    let common = 0;
    while (common < active.length && common < want.length && active[common]!.key === want[common]!.key) common++;
    for (let k = active.length - 1; k >= common; k--) out += active[k]!.close;
    for (let k = common; k < want.length; k++) out += want[k]!.open;
    active = want;
  };

  for (const n of content ?? []) {
    switch (n.type) {
      case 'text': {
        const want = vmarks(n.marks);
        setMarks(want);
        const raw = want.some((m) => m.raw);
        out += raw ? (n.text ?? '').replace(/\[\/icode\]/gi, '[/ icode]') : escapeText(n.text ?? '');
        break;
      }
      case 'hardBreak':
        setMarks(active.filter((m) => !m.raw));
        out += '\n';
        break;
      case 'image': {
        const a = n.attrs ?? {};
        if (!a.src) break;
        setMarks(active.filter((m) => m.key.startsWith('url=')));
        const attrs = [a.width ? ` width=${Number(a.width)}` : '', a.height ? ` height=${Number(a.height)}` : '', a.alt ? ` alt=${quoteAttr(String(a.alt))}` : ''].join('');
        out += `[img${attrs}]${String(a.src).replace(/[[\]\n]/g, '')}[/img]`;
        break;
      }
      case 'customEmoji': {
        const code = String(n.attrs?.code ?? '');
        if (!/^[a-z0-9_-]{2,32}$/.test(code)) break;
        setMarks(vmarks(n.marks).filter((m) => !m.raw));
        out += `:${code}:`;
        break;
      }
      case 'mention': {
        const a = n.attrs ?? {};
        const id = Number(a.id);
        const label = String(a.label ?? '').replace(/[[\]\n]/g, '');
        setMarks([]);
        out += Number.isInteger(id) && id > 0 ? `[mention=${id}]${label}[/mention]` : escapeText('@' + label);
        break;
      }
      default:
        out += inlineToBB(n.content);
    }
  }
  setMarks([]);
  return out;
}

function alignOf(n: PMNode): Align {
  const a = n.attrs?.textAlign;
  return a === 'center' || a === 'right' || a === 'justify' ? a : null;
}

function blocksToBB(blocks: PMNode[] | undefined): string {
  const parts: string[] = [];
  const list = blocks ?? [];
  for (let k = 0; k < list.length; k++) {
    const n = list[k]!;
    if (n.type === 'heading') {
      const level = [2, 3, 4].includes(Number(n.attrs?.level)) ? Number(n.attrs!.level) : 2;
      const text = inlineToBB(n.content);
      if (text.trim()) parts.push(`[h${level}]${text}[/h${level}]`);
      continue;
    }
    if (n.type === 'paragraph') {
      const align = alignOf(n);
      if (!align) {
        parts.push(inlineToBB(n.content));
        continue;
      }
      const group = [inlineToBB(n.content)];
      while (k + 1 < list.length && list[k + 1]!.type === 'paragraph' && alignOf(list[k + 1]!) === align) {
        group.push(inlineToBB(list[++k]!.content));
      }
      parts.push(`[${align}]${group.join('\n')}[/${align}]`);
      continue;
    }
    parts.push(blockToBB(n));
  }
  return parts.join('\n');
}

function blockToBB(n: PMNode): string {
  const a = n.attrs ?? {};
  switch (n.type) {
    case 'blockquote': {
      const attrs = [a.author ? ` author=${quoteAttr(String(a.author))}` : '', a.post ? ` post=${Number(a.post)}` : '', a.date ? ` date=${Number(a.date)}` : ''].join('');
      return `[quote${attrs}]\n${blocksToBB(n.content)}\n[/quote]`;
    }
    case 'spoiler': {
      const title = a.title ? `=${quoteAttr(String(a.title))}` : '';
      return `[spoiler${title}]\n${blocksToBB(n.content)}\n[/spoiler]`;
    }
    case 'codeBlock': {
      const lang = typeof a.language === 'string' && /^[a-z0-9#+-]{1,20}$/i.test(a.language) ? `=${a.language}` : '';
      const text = (n.content ?? []).map((c) => c.text ?? '').join('').replace(/\[\/code\]/gi, '[/ code]');
      return `[code${lang}]${text}[/code]`;
    }
    case 'bulletList':
    case 'orderedList': {
      const type = n.type === 'orderedList' ? `=${['a', 'A', 'i', 'I'].includes(a.type) ? a.type : '1'}` : '';
      const items = (n.content ?? []).map((item) => `[*]${blocksToBB(item.content)}`);
      return `[list${type}]\n${items.join('\n')}\n[/list]`;
    }
    case 'table': {
      const rows = (n.content ?? []).map(
        (row) => `[tr]${(row.content ?? []).map((cell) => {
          const tag = cell.type === 'tableHeader' ? 'th' : 'td';
          return `[${tag}]${blocksToBB(cell.content)}[/${tag}]`;
        }).join('')}[/tr]`,
      );
      return `[table]\n${rows.join('\n')}\n[/table]`;
    }
    case 'media':
      return a.src ? `[media]${String(a.src).replace(/[[\]\n]/g, '')}[/media]` : '';
    case 'horizontalRule':
      return '[hr]';
    case 'image':
    case 'mention':
    case 'customEmoji':
    case 'text':
      return inlineToBB([n]);
    default:
      return n.content ? blocksToBB(n.content) : '';
  }
}

export function docToBBCode(doc: PMNode): string {
  return blocksToBB(doc.content).replace(/^\n+|\n+$/g, '');
}
