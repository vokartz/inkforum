import { emojify, type EmojiRenderOptions } from './emoji.js';
import { parseBBCode, rawContent, type BBNode, type BBTag } from './parser.js';
import { safeColor, safeFont, safeImageUrl, safeSize, safeUrl } from './tags.js';
import { resolveEmbed, type EmbedOptions, type EmbedResult } from './embeds.js';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface BBRenderOptions {
  /** Görseller (yoksa bağlantıya dönüşür). İmzalarda kapatılabilir. */
  images?: boolean;
  /** Gömülü içerik (video, müzik, gönderi). Kapalıysa bağlantı olarak gösterilir. */
  media?: boolean;
  /** Tek başına satırdaki desteklenen bağlantılar otomatik gömülsün. */
  autoEmbed?: boolean;
  /** Gömülü içerik ziyaretçi tıklayınca yüklensin (gizlilik). */
  clickToLoad?: boolean;
  /** Sağlayıcı ayarları (site alan adı, kapalı sağlayıcılar, özel sağlayıcılar). */
  embeds?: EmbedOptions;
  /** Tablo, alıntı, spoiler gibi bloklar (kısa metinlerde kapatılabilir). */
  blocks?: boolean;
  /** İç içe alıntı derinliği sınırı; aşan alıntılar "[…]" olur. */
  maxQuoteDepth?: number;
  /** Profil bağlantısı üretici. */
  profileHref?: (id: number, name: string) => string;
  /** Mesaj bağlantısı üretici. */
  postHref?: (id: number) => string;
  /** Unicode emojileri görsele çevir (Twemoji). */
  emoji?: EmojiRenderOptions;
}

export interface BBRenderResult {
  html: string;
  /** `[mention=id]` ile bahsedilen üyeler. */
  mentions: number[];
  /** `[quote post=id]` ile alıntılanan mesajlar. */
  quotedPosts: number[];
  /** Metindeki görsel sayısı. */
  imageCount: number;
  /** Gömülü içerik sayısı. */
  embedCount: number;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'`[\]]+[^\s<>"'`[\].,;:!?)]/gi;

const SIMPLE: Record<string, string> = { b: 'strong', i: 'em', u: 'u', s: 's', sub: 'sub', sup: 'sup' };

interface Ctx {
  opts: Required<Omit<BBRenderOptions, 'profileHref' | 'postHref' | 'embeds' | 'emoji'>> & Pick<BBRenderOptions, 'profileHref' | 'postHref' | 'embeds' | 'emoji'>;
  mentions: Set<number>;
  quotedPosts: Set<number>;
  imageCount: number;
  embedCount: number;
  quoteDepth: number;
  inLink: boolean;
  headingIds: Set<string>;
}

/** Başlık metninden bağlantı kimliği (Türkçe harfler sadeleştirilir, tekrarlar numaralanır). */
export function headingSlug(text: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => map[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Oluşturulmuş HTML'deki başlıklar (içindekiler tablosu). */
export function extractHeadings(html: string): Array<{ id: string; text: string; level: 2 | 3 | 4 }> {
  const out: Array<{ id: string; text: string; level: 2 | 3 | 4 }> = [];
  for (const m of html.matchAll(/<h([234]) class="bb-h" id="([^"]+)">([\s\S]*?)<\/h\1>/g)) {
    const text = m[3]!.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    if (text) out.push({ id: m[2]!, text, level: Number(m[1]) as 2 | 3 | 4 });
  }
  return out;
}

const MAX_EMBEDS = 30;
const RATIO = /^\d{1,2}\/\d{1,2}$/;
const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms';

/** Metin parçası: HTML kaçırma + emoji görselleri. */
function esc(text: string, ctx: Ctx): string {
  return emojify(escapeHtml(text), ctx.opts.emoji);
}

function linkifyLine(text: string, ctx: Ctx): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    out += esc(text.slice(last, m.index), ctx);
    const url = safeUrl(m[0]);
    out += url ? linkHtml(url, escapeHtml(m[0])) : escapeHtml(m[0]);
    last = m.index! + m[0].length;
  }
  return out + esc(text.slice(last), ctx);
}

/** Satırda tek başına duran ve desteklenen bir bağlantıysa gömülü içerik HTML'i. */
function standaloneEmbed(line: string, ctx: Ctx): string | null {
  if (!ctx.opts.autoEmbed || !ctx.opts.media || ctx.quoteDepth > 0) return null;
  const t = line.trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return null;
  const e = resolveEmbed(t, ctx.opts.embeds);
  return e ? embedHtml(e, ctx) : null;
}

function textHtml(text: string, ctx: Ctx): string {
  if (ctx.inLink) return esc(text, ctx).replace(/\n/g, '<br>');
  let out = '';
  let prevBlock = false;
  text.split('\n').forEach((line, i) => {
    const embed = standaloneEmbed(line, ctx);
    if (embed) {
      out += embed;
      prevBlock = true;
      return;
    }
    if (i > 0 && !prevBlock) out += '<br>';
    out += linkifyLine(line, ctx);
    prevBlock = false;
  });
  return out;
}

/** Gömülü içerik bloğu. */
function embedHtml(e: EmbedResult, ctx: Ctx): string {
  if (ctx.embedCount >= MAX_EMBEDS) return linkHtml(e.url, escapeHtml(e.url));
  ctx.embedCount++;
  const maxWidth = Math.min(Math.max(e.maxWidth ?? 720, 200), 1200);
  const attrs = `data-provider="${escapeHtml(e.provider)}" data-kind="${e.kind}"`;
  if (!e.src && e.card) {
    return (
      `<a class="bb-embed-card" ${attrs} href="${escapeHtml(e.card.href)}" rel="nofollow ugc noopener noreferrer" target="_blank" style="max-width:${maxWidth}px">` +
      `<span class="bb-embed-card-icon" aria-hidden="true"></span>` +
      `<span class="bb-embed-card-body"><strong>${escapeHtml(e.card.title)}</strong><span>${escapeHtml(e.card.subtitle)}</span></span>` +
      `<span class="bb-embed-card-action">${escapeHtml(e.card.action)}</span></a>`
    );
  }
  if (!e.src) return linkHtml(e.url, escapeHtml(e.url));
  const ratio = e.ratio && RATIO.test(e.ratio) ? e.ratio : null;
  const height = ratio ? null : Math.min(Math.max(e.height ?? 400, 80), 1200);
  const wrapStyle = `max-width:${maxWidth}px${ratio ? `;aspect-ratio:${ratio}` : ''}`;
  const frameStyle = height ? ` style="height:${height}px"` : '';
  const allow = e.allow ? ` allow="${escapeHtml(e.allow)}"` : '';
  const title = `${escapeHtml(e.name)} içeriği`;
  const cls = `bb-embed${ratio ? ' bb-embed-ratio' : ''}`;
  const source = `<a class="bb-embed-source" href="${escapeHtml(e.url)}" rel="nofollow ugc noopener noreferrer" target="_blank">${escapeHtml(e.name)}</a>`;
  if (ctx.opts.clickToLoad) {
    return (
      `<div class="${cls} bb-embed-deferred" ${attrs} style="${wrapStyle}" data-embed-src="${escapeHtml(e.src)}" data-embed-title="${title}"` +
      `${e.allow ? ` data-embed-allow="${escapeHtml(e.allow)}"` : ''}${height ? ` data-embed-height="${height}"` : ''}>` +
      `<button type="button" class="bb-embed-load"${height ? ` style="height:${height}px"` : ''}><span class="bb-embed-load-name">${escapeHtml(e.name)}</span><span>İçeriği yüklemek için tıklayın</span></button>${source}</div>`
    );
  }
  return (
    `<div class="${cls}" ${attrs} style="${wrapStyle}">` +
    `<iframe src="${escapeHtml(e.src)}" title="${title}" loading="lazy"${allow} allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="${SANDBOX}"${frameStyle}></iframe>` +
    `${source}</div>`
  );
}

function linkHtml(href: string, inner: string): string {
  const external = /^https?:/i.test(href);
  const rel = external ? ' rel="nofollow ugc noopener noreferrer" target="_blank"' : '';
  return `<a href="${escapeHtml(href)}"${rel}>${inner}</a>`;
}

function children(tag: BBTag, ctx: Ctx): string {
  return nodesHtml(tag.children, ctx);
}

function nodesHtml(nodes: BBNode[], ctx: Ctx): string {
  let out = '';
  for (const n of nodes) out += n.type === 'text' ? textHtml(n.text, ctx) : tagHtml(n, ctx);
  return out;
}

/** Etiket geçersizse kaynağını metin olarak yazar ve içeriğini işler. */
function fallback(tag: BBTag, ctx: Ctx): string {
  const open = tag.value !== null ? `[${tag.name}=${tag.value}]` : `[${tag.name}]`;
  return escapeHtml(open) + children(tag, ctx) + escapeHtml(`[/${tag.name}]`);
}

function tagHtml(tag: BBTag, ctx: Ctx): string {
  const simple = SIMPLE[tag.name];
  if (simple) return `<${simple}>${children(tag, ctx)}</${simple}>`;

  switch (tag.name) {
    case 'color': {
      const c = safeColor(tag.value);
      return c ? `<span style="color:${c}">${children(tag, ctx)}</span>` : children(tag, ctx);
    }
    case 'size': {
      const px = safeSize(tag.value);
      return px ? `<span style="font-size:${px}px">${children(tag, ctx)}</span>` : children(tag, ctx);
    }
    case 'font': {
      const f = safeFont(tag.value);
      return f ? `<span style="font-family:'${f}'">${children(tag, ctx)}</span>` : children(tag, ctx);
    }
    case 'url': {
      const plain = tag.children.every((c) => c.type === 'text') ? tag.children.map((c) => (c as { text: string }).text).join('') : '';
      const href = safeUrl(tag.value ?? plain, { allowMailto: true });
      if (!href || ctx.inLink) return children(tag, ctx);
      ctx.inLink = true;
      const inner = tag.children.length ? children(tag, ctx) : escapeHtml(href);
      ctx.inLink = false;
      return linkHtml(href, inner);
    }
    case 'email': {
      const addr = (tag.value ?? rawText(tag.children)).trim();
      if (!/^[^@\s<>"']+@[^@\s<>"']+\.[^@\s<>"']+$/.test(addr)) return children(tag, ctx);
      ctx.inLink = true;
      const inner = children(tag, ctx) || escapeHtml(addr);
      ctx.inLink = false;
      return `<a href="mailto:${escapeHtml(addr)}">${inner}</a>`;
    }
    case 'icode':
      return `<code class="bb-icode">${escapeHtml(rawContent(tag))}</code>`;
    case 'noparse':
      return textHtml(rawContent(tag), ctx);
    case 'img': {
      const src = safeImageUrl(rawContent(tag));
      if (!src) return escapeHtml(rawContent(tag));
      if (!ctx.opts.images) return ctx.inLink ? escapeHtml(src) : linkHtml(src, escapeHtml(src));
      ctx.imageCount++;
      let w = Number(tag.attrs.width) || 0;
      let h = Number(tag.attrs.height) || 0;
      const dim = /^(\d{1,4})x(\d{1,4})$/i.exec(tag.value ?? '');
      if (dim) [w, h] = [Number(dim[1]), Number(dim[2])];
      const size = `${w > 0 && w <= 4000 ? ` width="${w}"` : ''}${h > 0 && h <= 4000 ? ` height="${h}"` : ''}`;
      const alt = escapeHtml((tag.attrs.alt ?? '').slice(0, 200));
      return `<img class="bb-img" src="${escapeHtml(src)}" alt="${alt}"${size} loading="lazy" decoding="async">`;
    }
    case 'mention': {
      const id = Number(tag.value);
      const name = rawContent(tag).trim().replace(/^@/, '');
      if (!Number.isInteger(id) || id <= 0 || !name) return escapeHtml(rawContent(tag));
      ctx.mentions.add(id);
      const href = ctx.opts.profileHref?.(id, name) ?? `/u/${id}`;
      return `<a class="bb-mention" href="${escapeHtml(href)}" data-user-id="${id}">@${escapeHtml(name)}</a>`;
    }
    case 'code': {
      const lang = /^[a-z0-9#+-]{1,20}$/i.test(tag.value ?? '') ? tag.value!.toLowerCase() : null;
      const code = rawContent(tag).replace(/^\n/, '').replace(/\n$/, '');
      return `<pre class="bb-code"${lang ? ` data-lang="${lang}"` : ''}><code>${escapeHtml(code)}</code></pre>`;
    }
    case 'media':
    case 'youtube':
    case 'embed': {
      let src = rawContent(tag).trim();
      if (/^[A-Za-z0-9_-]{11}$/.test(src)) src = `https://youtu.be/${src}`;
      const embed = resolveEmbed(src, ctx.opts.embeds);
      if (!embed) return textHtml(rawContent(tag), ctx);
      if (!ctx.opts.media) return linkHtml(embed.url, escapeHtml(embed.url));
      return embedHtml(embed, ctx);
    }
    case 'quote': {
      if (!ctx.opts.blocks) return children(tag, ctx);
      if (ctx.quoteDepth >= ctx.opts.maxQuoteDepth) return '<blockquote class="bb-quote bb-quote-collapsed">[…]</blockquote>';
      const author = (tag.attrs.author ?? tag.value ?? '').trim().slice(0, 80);
      const postId = Number(tag.attrs.post);
      const validPost = Number.isInteger(postId) && postId > 0;
      if (validPost) ctx.quotedPosts.add(postId);
      let head = '';
      if (author || validPost) {
        const who = author ? `<span class="bb-quote-author">${escapeHtml(author)}</span> yazdı:` : 'Alıntı:';
        const link = validPost ? ` <a class="bb-quote-link" href="${escapeHtml(ctx.opts.postHref?.(postId) ?? `/p/${postId}`)}" aria-label="Alıntılanan mesaja git">↑</a>` : '';
        head = `<div class="bb-quote-head">${who}${link}</div>`;
      }
      ctx.quoteDepth++;
      const body = children(tag, ctx);
      ctx.quoteDepth--;
      return `<blockquote class="bb-quote"${validPost ? ` data-post="${postId}"` : ''}>${head}<div class="bb-quote-body">${body}</div></blockquote>`;
    }
    case 'spoiler': {
      if (!ctx.opts.blocks) return children(tag, ctx);
      const title = escapeHtml((tag.value ?? tag.attrs.title ?? '').trim().slice(0, 100) || 'Spoiler');
      return `<details class="bb-spoiler"><summary>${title}</summary><div class="bb-spoiler-body">${children(tag, ctx)}</div></details>`;
    }
    case 'list': {
      const type = (tag.value ?? tag.attrs.type ?? '').trim();
      const ordered = type === '1' || type === 'a' || type === 'A' || type === 'i' || type === 'I';
      const items = tag.children.map((c) => (c.type === 'tag' && c.name === '*' ? `<li>${children(c, ctx)}</li>` : c.type === 'text' ? '' : tagHtml(c, ctx))).join('');
      return ordered ? `<ol class="bb-list" type="${type}">${items}</ol>` : `<ul class="bb-list">${items}</ul>`;
    }
    case '*':
      return `<li>${children(tag, ctx)}</li>`;
    case 'table':
      if (!ctx.opts.blocks) return children(tag, ctx);
      return `<div class="bb-table-wrap"><table class="bb-table"><tbody>${tag.children.filter((c) => c.type === 'tag').map((c) => tagHtml(c as BBTag, ctx)).join('')}</tbody></table></div>`;
    case 'tr':
      return `<tr>${tag.children.filter((c) => c.type === 'tag').map((c) => tagHtml(c as BBTag, ctx)).join('')}</tr>`;
    case 'td':
    case 'th':
      return `<${tag.name}>${children(tag, ctx)}</${tag.name}>`;
    case 'left':
    case 'center':
    case 'right':
    case 'justify':
      return `<div class="bb-align" style="text-align:${tag.name}">${children(tag, ctx)}</div>`;
    case 'hr':
      return '<hr class="bb-hr">';
    case 'h2':
    case 'h3':
    case 'h4': {
      const inner = children(tag, ctx).replace(/^(<br>)+|(<br>)+$/g, '');
      if (!ctx.opts.blocks) return `<strong>${inner}</strong>`;
      let id = headingSlug(rawText(tag.children)) || 'bolum';
      for (let n = 2; ctx.headingIds.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
      ctx.headingIds.add(id);
      return `<${tag.name} class="bb-h" id="${id}">${inner}</${tag.name}>`;
    }
    default:
      return fallback(tag, ctx);
  }
}

function rawText(nodes: BBNode[]): string {
  return nodes.map((n) => (n.type === 'text' ? n.text : rawText(n.children))).join('');
}

/** BBCode → güvenli HTML. Tüm metin kaçışlanır; nitelikler yalnızca doğrulanmış değerlerden üretilir. */
export function renderBBCode(input: string, options: BBRenderOptions = {}): BBRenderResult {
  const ctx: Ctx = {
    opts: {
      images: options.images ?? true,
      media: options.media ?? true,
      blocks: options.blocks ?? true,
      maxQuoteDepth: options.maxQuoteDepth ?? 3,
      autoEmbed: options.autoEmbed ?? false,
      clickToLoad: options.clickToLoad ?? false,
      embeds: options.embeds,
      profileHref: options.profileHref,
      postHref: options.postHref,
      emoji: options.emoji,
    },
    mentions: new Set(),
    quotedPosts: new Set(),
    imageCount: 0,
    embedCount: 0,
    quoteDepth: 0,
    inLink: false,
    headingIds: new Set(),
  };
  const html = nodesHtml(parseBBCode(input), ctx);
  return { html, mentions: [...ctx.mentions], quotedPosts: [...ctx.quotedPosts], imageCount: ctx.imageCount, embedCount: ctx.embedCount };
}
