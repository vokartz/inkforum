/* eslint-disable no-control-regex -- işaretçiler bilerek kontrol karakterleriyle yazılır */
/**
 * Mesaj gövdesi dönüştürücüleri: SMF, phpBB (eski biçim ve 3.2+ s9e XML), MyBB MyCode ve IPS HTML
 * → InkForum BBCode. Alıntı, bahsetme ve eklenti başvuruları işaretçiyle yazılır (bkz. model.ts).
 */
import { decodeEntities } from './text.js';
import { mark } from './model.js';

// ---------- Ortak ----------

/** Kontrol karakterleri (işaretçilerle çakışmasın) ve satır sonu biçimleri */
export function cleanText(s: string): string {
  return s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

export function tidy(s: string): string {
  return s
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Alıntı yazarı: tırnak ve köşeli parantez parser'ı bozmasın */
const author = (s: string) => decodeEntities(s).replace(/["[\]]/g, '').trim().slice(0, 80);
const quoteTag = (name: string | null, postId: string | null) =>
  `[quote${name ? ` author="${author(name)}"` : ''}${postId && /^\d+$/.test(postId) ? ` post=${mark('p', postId)}` : ''}]`;

interface Protected {
  text: string;
  restore(s: string): string;
}

/** Kod blokları dönüştürmeden korunur (içlerindeki BBCode örnekleri bozulmasın) */
function protect(s: string, tags: string[], wrap: (tag: string, value: string | undefined, body: string) => string): Protected {
  const saved: string[] = [];
  const re = new RegExp(`\\[(${tags.join('|')})(?:=([^\\]]*))?\\]([\\s\\S]*?)\\[\\/\\1\\]`, 'gi');
  const text = s.replace(re, (_m, tag: string, value: string | undefined, body: string) => {
    saved.push(wrap(tag.toLowerCase(), value, body));
    return `\u0003${saved.length - 1}\u0004`;
  });
  return { text, restore: (out) => out.replace(/\u0003(\d+)\u0004/g, (_m, i: string) => saved[Number(i)] ?? '') };
}

/** Genel etiket yeniden yazıcı: `fn(ad, değer/öznitelik, kapanış mı)` null dönerse etiket olduğu gibi kalır */
function rewriteTags(s: string, fn: (name: string, rest: string, closing: boolean) => string | null): string {
  return s.replace(/\[(\/?)([a-z][a-z0-9]*|\*)((?:=|\s)[^\]\n]*)?\]/gi, (m, slash: string, name: string, rest: string | undefined) => {
    const out = fn(name.toLowerCase(), rest ?? '', slash === '/');
    return out ?? m;
  });
}

const attr = (rest: string, key: string): string | null => {
  const m = new RegExp(`${key}=(?:"([^"]*)"|'([^']*)'|&quot;(.*?)&quot;|([^\\s\\]]*))`, 'i').exec(rest);
  return m ? (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '') : null;
};
const mainValue = (rest: string): string | null => {
  if (!rest.startsWith('=')) return null;
  const v = rest.slice(1).trim();
  const m = /^(?:"([^"]*)"|'([^']*)'|&quot;(.*?)&quot;|([^\s]*))/.exec(v);
  return m ? (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '') : v;
};

const COLOR_TAGS = new Set(['black', 'red', 'blue', 'green', 'white']);
const STRIP_TAGS = new Set(['ltr', 'rtl', 'glow', 'shadow', 'move', 'anchor', 'abbr', 'acronym', 'bdo', 'float', 'marquee', 'align_center']);

const fmtDate = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 16).replace('T', ' ');

// ---------- SMF ----------

export function smfToBBCode(raw: string): string {
  let s = cleanText(raw);
  const p = protect(s, ['code', 'php', 'nobbc', 'html', 'pre', 'tt'], (tag, value, body) => {
    const text = decodeEntities(body.replace(/<br\s*\/?>/gi, '\n')).replace(/\u00a0/g, ' ');
    if (tag === 'nobbc') return `[noparse]${text}[/noparse]`;
    if (tag === 'tt') return `[icode]${text}[/icode]`;
    const lang = tag === 'php' ? 'php' : tag === 'html' ? 'html' : /^[a-z0-9#+-]{1,20}$/i.test(value ?? '') ? value!.toLowerCase() : '';
    return `[code${lang ? `=${lang}` : ''}]${text}[/code]`;
  });
  s = p.text.replace(/<br\s*\/?>/gi, '\n');
  s = decodeEntities(s).replace(/\u00a0/g, ' ');
  s = rewriteTags(s, (name, rest, closing) => {
    if (name === 'quote') {
      if (closing) return '[/quote]';
      const link = attr(rest, 'link');
      const msg = link ? /msg(\d+)/.exec(link)?.[1] ?? null : null;
      // SMF yazar adını tırnaksız ve boşluklu yazar: [quote author=Ali Veli link=… date=…]
      const who = /author=(?:"([^"]*)"|(.+?))(?=\s+(?:link|date)=|$)/.exec(rest.trim());
      return quoteTag(who ? (who[1] ?? who[2] ?? '') : mainValue(rest), msg);
    }
    if (name === 'li') return closing ? '' : '[*]';
    if (name === 'list') {
      if (closing) return '[/list]';
      const type = attr(rest, 'type') ?? '';
      return /decimal|roman|alpha|^1$/i.test(type) ? '[list=1]' : '[list]';
    }
    if (name === 'iurl' || name === 'ftp') return closing ? '[/url]' : `[url${rest}]`;
    if (name === 'size') return closing ? '[/size]' : `[size=${(mainValue(rest) ?? '').replace(/\s/g, '')}]`;
    if (COLOR_TAGS.has(name)) return closing ? '[/color]' : `[color=${name}]`;
    if (STRIP_TAGS.has(name)) return '';
    if (name === 'member') return closing ? '[/mention]' : `[mention=${mark('u', mainValue(rest) ?? '0')}]`;
    if (name === 'attach' || name === 'attachimg' || name === 'attachurl' || name === 'attachmini') {
      if (closing) return '\u0005';
      const id = attr(rest, 'id') ?? mainValue(rest);
      return id ? `${mark('a', id)}\u0006` : '';
    }
    if (name === 'me') return closing ? '' : `* ${mainValue(rest) ?? ''} `;
    if (name === 'youtube') return closing ? '[/media]' : '[media]';
    if (name === 'flash') return closing ? '[/url]' : '[url]';
    if (name === 'time') return closing ? '\u0007' : '\u0008';
    return null;
  });
  // [attach]…[/attach] içindeki dosya adı atılır; [time]zaman[/time] tarihe çevrilir
  s = s.replace(/\u0006[^\u0005]*\u0005/g, '').replace(/[\u0005\u0006]/g, '');
  s = s.replace(/\u0008\s*(\d{9,11})\s*\u0007/g, (_m, t: string) => fmtDate(Number(t))).replace(/[\u0007\u0008]/g, '');
  return tidy(p.restore(s));
}

// ---------- phpBB ----------

const isS9e = (s: string) => /^<[rt][ >]/.test(s);

/** phpBB 3.0/3.1 eski biçim (bbcode_uid ile) */
export function phpbbLegacyDecode(text: string, uid: string): string {
  let t = text.split('<br />').join('\n');
  if (uid) {
    for (const x of [`[/*:m:${uid}]`, `:u:${uid}`, `:o:${uid}`, `:m:${uid}`, `:${uid}`]) t = t.split(x).join('');
  }
  t = t
    .replace(/<!-- e --><a href="mailto:(.*?)">.*?<\/a><!-- e -->/g, '$1')
    .replace(/<!-- l --><a (?:class="[\w-]+" )?href="(.*?)(?:(&amp;|\?)sid=[0-9a-f]{32})?">.*?<\/a><!-- l -->/g, '$1')
    .replace(/<!-- ([mw]) --><a (?:class="[\w-]+" )?href="http:\/\/(.*?)">\2<\/a><!-- \1 -->/g, '$2')
    .replace(/<!-- ([mw]) --><a (?:class="[\w-]+" )?href="(.*?)">.*?<\/a><!-- \1 -->/g, '$2')
    .replace(/<!-- s(.*?) --><img src="\{SMILIES_PATH\}\/.*? \/><!-- s\1 -->/g, '$1')
    .replace(/<!-- [\s\S]*? -->/g, '')
    .replace(/<[\s\S]*?>/g, '');
  return decodeEntities(t);
}

/** phpBB yüzde boyutu → 1–7 ölçeği */
function phpbbSize(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '3';
  if (n <= 50) return '1';
  if (n <= 85) return '2';
  if (n <= 110) return '3';
  if (n <= 140) return '4';
  if (n <= 160) return '5';
  if (n <= 185) return '6';
  return '7';
}

/**
 * phpBB metni → BBCode. `attachmentAt(i)` satır içi `[attachment=i]` dizinini eklenti kimliğine çevirir
 * (dizin, mesajın eklentilerinin attach_id azalan sırasıdır).
 */
export function phpbbToBBCode(raw: string, uid: string, attachmentAt: (index: number) => string | null = () => null): string {
  let s = cleanText(raw);
  s = isS9e(s) ? decodeEntities(s.replace(/<br\s*\/?>/g, '').replace(/<[^>]*>/g, '')) : phpbbLegacyDecode(s, uid);
  s = s.replace(/\u00a0/g, ' ');
  const p = protect(s, ['code'], (_tag, value, body) => `[code${value && /^[a-z0-9#+-]{1,20}$/i.test(value) ? `=${value.toLowerCase()}` : ''}]${body}[/code]`);
  s = p.text.replace(/\[attachment=(\d+)\]([\s\S]*?)\[\/attachment\]/gi, (_m, i: string) => {
    const id = attachmentAt(Number(i));
    return id ? mark('a', id) : '';
  });
  s = rewriteTags(s, (name, rest, closing) => {
    if (name === 'quote') {
      if (closing) return '[/quote]';
      return quoteTag(mainValue(rest.replace(/\s(post_id|time|user_id|msg_id)=\S+/g, '')) ?? attr(rest, 'author'), attr(rest, 'post_id'));
    }
    if (name === 'size') return closing ? '[/size]' : `[size=${phpbbSize(mainValue(rest) ?? '')}]`;
    if (name === 'flash') return closing ? '[/url]' : '[url]';
    if (name === 'list') {
      if (closing) return '[/list]';
      const v = mainValue(rest) ?? '';
      return /^[1aAiI]$/.test(v) ? `[list=${v}]` : v === 'disc' || v === 'circle' || v === 'square' || !v ? '[list]' : '[list=1]';
    }
    return null;
  });
  return tidy(p.restore(s));
}

// ---------- MyBB ----------

const MYBB_SIZES: Record<string, string> = { 'xx-small': '1', 'x-small': '1', small: '2', medium: '3', large: '5', 'x-large': '6', 'xx-large': '7' };

export function mybbToBBCode(raw: string): string {
  let s = cleanText(raw);
  const p = protect(s, ['code', 'php'], (tag, _v, body) => `[code${tag === 'php' ? '=php' : ''}]${body}[/code]`);
  s = p.text.replace(/\[attachment=(\d+)\]/gi, (_m, id: string) => mark('a', id));
  s = s.replace(/\[video=[a-z_]+\]([\s\S]*?)\[\/video\]/gi, '[media]$1[/media]');
  s = rewriteTags(s, (name, rest, closing) => {
    if (name === 'quote') {
      if (closing) return '[/quote]';
      const cleaned = rest.replace(/\s(pid|dateline)=('[^']*'|"[^"]*"|\S+)/g, '');
      return quoteTag(mainValue(cleaned), attr(rest, 'pid'));
    }
    if (name === 'size') {
      if (closing) return '[/size]';
      const v = (mainValue(rest) ?? '').toLowerCase();
      return `[size=${MYBB_SIZES[v] ?? v}]`;
    }
    if (name === 'align') {
      if (closing) return '\u0005';
      const v = (mainValue(rest) ?? '').toLowerCase();
      return ['left', 'center', 'right', 'justify'].includes(v) ? `\u0006${v}\u0006` : '\u0006\u0006';
    }
    return null;
  });
  // [align=x]…[/align] → [x]…[/x]
  s = s.replace(/\u0006(\w*)\u0006([\s\S]*?)\u0005/g, (_m, a: string, body: string) => (a ? `[${a}]${body}[/${a}]` : body));
  return tidy(p.restore(s));
}

// ---------- IPS (HTML) ----------

interface HNode {
  tag: string;
  attrs: Record<string, string>;
  children: Array<HNode | string>;
}

const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'embed', 'param', 'track', 'area']);

/** Hoşgörülü küçük HTML ayrıştırıcı (editör çıktısı için yeterli) */
export function parseHtml(html: string): HNode {
  const root: HNode = { tag: '#root', attrs: {}, children: [] };
  const stack: HNode[] = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const top = () => stack[stack.length - 1]!;
  while ((m = re.exec(html))) {
    if (m.index > last) top().children.push(html.slice(last, m.index));
    last = re.lastIndex;
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) {
      const name = m[1].toLowerCase();
      const idx = stack.map((n) => n.tag).lastIndexOf(name);
      if (idx > 0) stack.length = idx;
      continue;
    }
    const name = m[2]!.toLowerCase();
    const attrs: Record<string, string> = {};
    for (const a of (m[3] ?? '').matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[a[1]!.toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
    }
    const node: HNode = { tag: name, attrs, children: [] };
    top().children.push(node);
    if (!VOID.has(name) && !m[4]) stack.push(node);
  }
  if (last < html.length) top().children.push(html.slice(last));
  return root;
}

const hasClass = (n: HNode, c: string) => (n.attrs.class ?? '').split(/\s+/).includes(c);

function textContent(n: HNode | string): string {
  if (typeof n === 'string') return decodeEntities(n);
  if (n.tag === 'br') return '\n';
  return n.children.map(textContent).join('');
}

export interface IpsContext {
  baseUrl: string;
  /** Depolama yolu (monthly_…/x.jpg) veya kimlikten eklenti kimliği */
  attachment: (ref: { id?: string; path?: string }) => string | null;
}

/** IPS yer tutucuları → gerçek adresler */
export function ipsPlaceholders(s: string, baseUrl: string): string {
  return s
    .replace(/<___base_url___>/g, baseUrl)
    .replace(/<fileStore\.core_(?:Attachment|Emoticons|Profile|Theme)>/g, `${baseUrl}/uploads`)
    .replace(/<#EMO_DIR#>/g, 'default');
}

function youtubeId(url: string): string | null {
  return /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|v\/)|youtu\.be\/)([\w-]{11})/.exec(url)?.[1] ?? null;
}

const STYLE = (n: HNode, prop: string) => new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(n.attrs.style ?? '')?.[1]?.trim() ?? null;

function ipsNode(n: HNode | string, ctx: IpsContext, pre = false): string {
  if (typeof n === 'string') {
    const t = decodeEntities(n);
    return pre ? t : t.replace(/\s+/g, ' ');
  }
  const kids = (nodes = n.children) => nodes.map((c) => ipsNode(c, ctx, pre)).join('');
  const wrap = (open: string, close: string) => {
    const inner = kids();
    return inner.trim() ? `${open}${inner}${close}` : inner;
  };
  switch (n.tag) {
    case 'script':
    case 'style':
    case 'noscript':
      return '';
    case 'br':
      return '\n';
    case 'hr':
      return '\n[hr]\n';
    case 'strong':
    case 'b':
      return wrap('[b]', '[/b]');
    case 'em':
    case 'i':
      return wrap('[i]', '[/i]');
    case 'u':
      return wrap('[u]', '[/u]');
    case 's':
    case 'strike':
    case 'del':
      return wrap('[s]', '[/s]');
    case 'sup':
      return wrap('[sup]', '[/sup]');
    case 'sub':
      return wrap('[sub]', '[/sub]');
    case 'code':
      return pre ? kids() : `[icode]${textContent(n)}[/icode]`;
    case 'pre':
      return `\n[code]${textContent(n).replace(/^\n|\n$/g, '')}[/code]\n`;
    case 'h1':
    case 'h2':
      return `\n[h2]${kids().trim()}[/h2]\n`;
    case 'h3':
      return `\n[h3]${kids().trim()}[/h3]\n`;
    case 'h4':
    case 'h5':
    case 'h6':
      return `\n[h4]${kids().trim()}[/h4]\n`;
    case 'ul':
    case 'ol':
      return `\n[list${n.tag === 'ol' ? '=1' : ''}]\n${n.children.filter((c) => typeof c !== 'string').map((c) => ipsNode(c, ctx)).join('')}[/list]\n`;
    case 'li':
      return `[*]${kids().trim()}\n`;
    case 'table':
    case 'tbody':
    case 'thead':
    case 'tfoot': {
      const rows = collect(n, 'tr');
      return `\n[table]\n${rows.map((r) => `[tr]${r.children.filter((c): c is HNode => typeof c !== 'string' && (c.tag === 'td' || c.tag === 'th')).map((c) => `[${c.tag}]${ipsNode({ ...c, tag: 'span' }, ctx).trim()}[/${c.tag}]`).join('')}[/tr]\n`).join('')}[/table]\n`;
    }
    case 'blockquote': {
      const name = n.attrs['data-ipsquote-username'] ?? null;
      const post = n.attrs['data-ipsquote-contentcommentid'] ?? null;
      const body = n.children.filter((c) => typeof c === 'string' || !hasClass(c, 'ipsQuote_citation'));
      return `\n${quoteTag(name, post)}${kids(body).trim()}[/quote]\n`;
    }
    case 'iframe':
    case 'video':
    case 'embed': {
      const src = n.attrs['data-embed-src'] ?? n.attrs.src ?? n.attrs['data-src'] ?? collect(n, 'source')[0]?.attrs.src ?? '';
      const yt = youtubeId(src);
      if (yt) return `\n[media]https://www.youtube.com/watch?v=${yt}[/media]\n`;
      const embedded = /[?&]url=([^&]+)/.exec(src)?.[1];
      if (embedded && /controller=embed/.test(src)) return `\n[media]${safeDecode(embedded)}[/media]\n`;
      return src ? `\n[url]${src}[/url]\n` : '';
    }
    case 'img': {
      if (n.attrs['data-emoticon'] !== undefined || hasClass(n, 'ipsEmoji') || /emoticons\//.test(n.attrs.src ?? '')) return n.attrs.alt ?? n.attrs.title ?? '';
      const src = n.attrs['data-src'] || n.attrs.src || '';
      if (!/^https?:\/\//i.test(src)) return '';
      const path = /\/uploads\/(monthly_[^?#]+)/.exec(src)?.[1];
      const id = path ? ctx.attachment({ path: path.replace(/\.thumb(\.[a-z]+)$/i, '$1') }) : null;
      return id ? mark('a', id) : `[img]${src}[/img]`;
    }
    case 'a': {
      const href = n.attrs.href ?? '';
      if (n.attrs['data-mentionid']) return `[mention=${mark('u', n.attrs['data-mentionid'])}]${textContent(n).replace(/^@/, '').trim()}[/mention]`;
      const fileId = n.attrs['data-fileid'] ?? /attachment\.php\?id=(\d+)/.exec(href)?.[1] ?? /attach_id=(\d+)/.exec(href)?.[1];
      const path = /\/uploads\/(monthly_[^?#]+)/.exec(href)?.[1];
      if (fileId || (path && hasClass(n, 'ipsAttachLink'))) {
        const id = ctx.attachment({ id: fileId, path });
        if (id) return mark('a', id);
      }
      const inner = kids();
      if (!href || href.startsWith('#')) return inner;
      const plain = inner.trim();
      if (!plain) return '';
      if (plain === href || /^\[img\]/.test(plain)) return /^\[img\]/.test(plain) ? `[url=${href}]${plain}[/url]` : `[url]${href}[/url]`;
      return `[url=${href}]${inner}[/url]`;
    }
    case 'span': {
      let out = kids();
      if (!out.trim()) return out;
      const color = STYLE(n, 'color');
      const size = STYLE(n, 'font-size');
      const font = STYLE(n, 'font-family');
      if (color) out = `[color=${rgbToHex(color)}]${out}[/color]`;
      if (size && /^\d+px$/.test(size)) out = `[size=${size}]${out}[/size]`;
      if (font) out = `[font=${font.split(',')[0]!.replace(/["']/g, '').trim()}]${out}[/font]`;
      return out;
    }
    default: {
      if (hasClass(n, 'ipsSpoiler')) {
        const contents = collect(n, 'div').find((d) => hasClass(d, 'ipsSpoiler_contents'));
        return `\n[spoiler]${(contents ? kids(contents.children) : kids()).trim()}[/spoiler]\n`;
      }
      if (hasClass(n, 'ipsSpoiler_header') || hasClass(n, 'ipsQuote_citation')) return '';
      const block = n.tag === 'p' || n.tag === 'div' || n.tag === 'section' || n.tag === 'article' || n.tag === 'figure' || n.tag === 'center';
      let inner = kids();
      const align = n.tag === 'center' ? 'center' : (STYLE(n, 'text-align') ?? '').toLowerCase();
      if (['center', 'right', 'left', 'justify'].includes(align) && align !== 'left' && inner.trim()) inner = `[${align}]${inner.trim()}[/${align}]`;
      return block ? `${inner}\n` : inner;
    }
  }
}

function collect(n: HNode, tag: string, out: HNode[] = []): HNode[] {
  for (const c of n.children) {
    if (typeof c === 'string') continue;
    if (c.tag === tag) out.push(c);
    else collect(c, tag, out);
  }
  return out;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function rgbToHex(v: string): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(v);
  if (!m) return v;
  return `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`;
}

/** IPB 3 döneminden kalan BBCode benzeri içerik */
function ipbLegacyTags(s: string): string {
  return s
    .replace(/\[quote\s+([^\]]*\bname=[^\]]*)\]/gi, (_m, rest: string) => quoteTag(attr(` ${rest}`, 'name'), attr(` ${rest}`, 'post')))
    .replace(/\[member=['"]?([^'"\]]+)['"]?\]/gi, '@$1')
    .replace(/\[attachment=(\d+):[^\]]*\]/gi, (_m, id: string) => mark('a', id));
}

export function ipsToBBCode(html: string, ctx: IpsContext): string {
  const src = ipsPlaceholders(cleanText(html), ctx.baseUrl);
  // HTML değilse (çok eski içerik) satır sonları korunur
  const out = /<[a-z][\s\S]*>/i.test(src) ? ipsNode(parseHtml(src), ctx) : decodeEntities(src);
  return tidy(ipbLegacyTags(out).replace(/\u00a0/g, ' ').replace(/[ \t]{2,}/g, ' ').replace(/\n /g, '\n'));
}
