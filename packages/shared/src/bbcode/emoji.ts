export const EMOJI_RE =
  /[#*0-9]️?⃣|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])?(?:‍\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])?)*/gu;

const TEXT_DEFAULT = new Set([0xa9, 0xae, 0x203c, 0x2049, 0x2122, 0x2139, 0x2194, 0x2195, 0x2196, 0x2197, 0x2198, 0x2199, 0x21a9, 0x21aa]);

export function emojiCode(emoji: string): string {
  const cps = [...emoji].map((c) => c.codePointAt(0)!);
  const zwj = cps.includes(0x200d);
  return cps
    .filter((c) => zwj || c !== 0xfe0f)
    .map((c) => c.toString(16))
    .join('-');
}

export interface EmojiRenderOptions {
  has: (code: string) => boolean;
  base?: string;
  custom?: (shortcode: string) => { url: string; name: string } | undefined;
}

export const EMOJI_SHORTCODE = /^[a-z0-9_-]{2,32}$/;
const SHORTCODE_RE = /:([a-z0-9_-]{2,32}):/g;

export function emojify(escaped: string, opts: EmojiRenderOptions | undefined): string {
  if (!opts) return escaped;
  const base = opts.base ?? '/emoji/';
  let out = escaped.replace(EMOJI_RE, (m) => {
    const cps = [...m];
    if (cps.length === 1 && TEXT_DEFAULT.has(m.codePointAt(0)!)) return m;
    const code = emojiCode(m);
    if (!opts.has(code)) return m;
    return `<img class="bb-emoji" src="${base}${code}.svg" alt="${m}" draggable="false" loading="lazy">`;
  });
  const custom = opts.custom;
  if (custom && out.includes(':')) {
    out = out.replace(SHORTCODE_RE, (m, code: string) => {
      const e = custom(code);
      if (!e) return m;
      const attr = (s: string) => s.replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]!);
      return `<img class="bb-emoji bb-emoji-custom" src="${attr(e.url)}" alt=":${code}:" title="${attr(e.name)}" draggable="false" loading="lazy">`;
    });
  }
  return out;
}
