/**
 * Küçük ve güvenli Markdown dönüştürücü (sürüm notları, değişiklik günlüğü).
 * Ham HTML desteklenmez: tüm metin önce kaçışlanır, yalnızca bilinen sözdizimi etikete çevrilir.
 * Desteklenenler: başlıklar, paragraflar, madde / numaralı listeler (iç içe), alıntı, kod bloğu,
 * satır içi kod, kalın, italik, üstü çizili, bağlantılar ve yatay çizgi.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (/^https?:\/\/[^\s]+$/i.test(url)) return url;
  if (/^\/(?![/\\])[^\s]*$/.test(url) || /^#[\w-]*$/.test(url)) return url;
  return null;
}

function inline(src: string): string {
  // Satır içi kodu ayır (içinde başka biçimlendirme uygulanmaz)
  const parts = src.split(/(`[^`]+`)/g);
  return parts
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${esc(part.slice(1, -1))}</code>`;
      let s = esc(part);
      // [metin](adres)
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) => {
        const h = safeHref(href.replace(/&amp;/g, '&'));
        return h ? `<a href="${esc(h)}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>` : text;
      });
      // Çıplak adresler (bağlantı içinde olmayanlar)
      s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_m, pre: string, url: string) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`);
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
      s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>').replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>');
      s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      return s;
    })
    .join('');
}

interface ListFrame {
  type: 'ul' | 'ol';
  indent: number;
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  const lists: ListFrame[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  let code: string[] | null = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${renderMarkdown(quote.join('\n'))}</blockquote>`);
    quote = [];
  };
  const closeLists = (toIndent = -1) => {
    while (lists.length && lists[lists.length - 1]!.indent > toIndent) out.push(`</li></${lists.pop()!.type}>`);
  };

  for (const raw of lines) {
    if (code) {
      if (/^\s*```/.test(raw)) {
        out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
        code = null;
      } else code.push(raw);
      continue;
    }
    if (/^\s*```/.test(raw)) {
      flushPara();
      flushQuote();
      closeLists();
      code = [];
      continue;
    }
    const line = raw.replace(/\t/g, '  ');
    if (!line.trim()) {
      flushPara();
      flushQuote();
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) {
      flushPara();
      closeLists();
      quote.push(q[1]!);
      continue;
    }
    flushQuote();
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      flushPara();
      closeLists();
      const level = Math.min(6, Math.max(3, h[1]!.length + 2));
      out.push(`<h${level}>${inline(h[2]!)}</h${level}>`);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushPara();
      closeLists();
      out.push('<hr>');
      continue;
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      const indent = li[1]!.length;
      const type: ListFrame['type'] = /\d/.test(li[2]!) ? 'ol' : 'ul';
      const top = lists[lists.length - 1];
      if (!top || indent > top.indent) {
        lists.push({ type, indent });
        out.push(`<${type}><li>`);
      } else {
        closeLists(indent);
        const cur = lists[lists.length - 1];
        if (cur && cur.indent === indent && cur.type === type) out.push('</li><li>');
        else {
          if (cur && cur.indent === indent) out.push(`</li></${lists.pop()!.type}>`);
          lists.push({ type, indent });
          out.push(`<${type}><li>`);
        }
      }
      // Görev listesi: - [x] / - [ ]
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(li[3]!);
      out.push(task ? `<span class="md-task" data-done="${task[1] !== ' '}">${inline(task[2]!)}</span>` : inline(li[3]!));
      continue;
    }
    if (lists.length && /^\s{2,}\S/.test(line)) {
      out.push(` ${inline(line.trim())}`);
      continue;
    }
    closeLists();
    para.push(line.trim());
  }
  if (code) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  flushPara();
  flushQuote();
  closeLists();
  return out.join('');
}
