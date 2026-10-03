import type { OgCard } from '@forum/shared';

export interface CardContent {
  kicker: string;
  title: string;
  meta: string;
  forum: string;
}

export interface CardAssets {
  logo: string | null;
  background: string | null;
}

const FONTS: Record<OgCard['font'], string> = {
  sans: "'DejaVu Sans', 'Noto Sans', 'Noto Sans CJK SC', 'WenQuanYi Zen Hei', sans-serif",
  serif: "'DejaVu Serif', 'Noto Serif', 'Noto Serif CJK SC', serif",
  mono: "'DejaVu Sans Mono', 'Noto Sans Mono', monospace",
};

const W = 1200;
const H = 630;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hexOk = (v: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function wrap(text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (`${cur} ${w}`.length <= width) cur = `${cur} ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > max) {
    const kept = lines.slice(0, max);
    kept[max - 1] = truncate(`${kept[max - 1]} ${lines.slice(max).join(' ')}`, width);
    return kept;
  }
  return lines.map((l) => truncate(l, width + 6));
}

function isLightBg(card: OgCard): boolean {
  const b = card.background;
  if (b.kind === 'light') return true;
  if (b.kind === 'color') {
    const n = parseInt(b.color.slice(1), 16);
    const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    return lum > 0.6;
  }
  return false;
}

export function renderCardSvg(c: CardContent, card: OgCard, forumAccent: string, assets: CardAssets): string {
  const accent = hexOk(card.accent || forumAccent, '#7b61ff');
  const lightText = card.text === 'light' || (card.text === 'auto' && !isLightBg(card));
  const fg = lightText ? '#ffffff' : '#111318';
  const b = card.background;

  const defs: string[] = [];
  let bg = '';
  if (b.kind === 'dark' || (b.kind === 'image' && !assets.background)) {
    defs.push('<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151821"/><stop offset="1" stop-color="#0b0d12"/></linearGradient>');
    bg = `<rect width="${W}" height="${H}" fill="url(#bg)"/>`;
  } else if (b.kind === 'light') {
    defs.push('<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef0f5"/></linearGradient>');
    bg = `<rect width="${W}" height="${H}" fill="url(#bg)"/>`;
  } else if (b.kind === 'color') {
    bg = `<rect width="${W}" height="${H}" fill="${hexOk(b.color, '#111827')}"/>`;
  } else if (b.kind === 'gradient') {
    const a = ((b.angle - 90) * Math.PI) / 180;
    const x = Math.cos(a) / 2;
    const y = Math.sin(a) / 2;
    defs.push(
      `<linearGradient id="bg" x1="${(0.5 - x).toFixed(3)}" y1="${(0.5 - y).toFixed(3)}" x2="${(0.5 + x).toFixed(3)}" y2="${(0.5 + y).toFixed(3)}"><stop offset="0" stop-color="${hexOk(b.from, '#1e1b4b')}"/><stop offset="1" stop-color="${hexOk(b.to, '#0f766e')}"/></linearGradient>`,
    );
    bg = `<rect width="${W}" height="${H}" fill="url(#bg)"/>`;
  } else if (b.kind === 'image' && assets.background) {
    bg = `<rect width="${W}" height="${H}" fill="#0b0b0f"/><image href="${assets.background}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/><rect width="${W}" height="${H}" fill="#000000" fill-opacity="${(b.dim / 100).toFixed(2)}"/>`;
  }

  const patternColor = lightText ? '#ffffff' : '#000000';
  if (card.pattern === 'dots') defs.push(`<pattern id="pt" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="${patternColor}" fill-opacity="0.09"/></pattern>`);
  if (card.pattern === 'grid') defs.push(`<pattern id="pt" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="${patternColor}" stroke-opacity="0.07" stroke-width="2"/></pattern>`);
  if (card.pattern === 'lines') defs.push(`<pattern id="pt" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="22" fill="${patternColor}" fill-opacity="0.06"/></pattern>`);
  const pattern = card.pattern !== 'none' ? `<rect width="${W}" height="${H}" fill="url(#pt)"/>` : '';
  if (card.glow) defs.push(`<radialGradient id="gl" cx="0.9" cy="0" r="0.9"><stop offset="0" stop-color="${accent}" stop-opacity="0.5"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>`);
  const glow = card.glow ? `<rect width="${W}" height="${H}" fill="url(#gl)"/>` : '';

  const footer = truncate(card.footer || c.forum, 40);
  const kicker = card.kicker && c.kicker ? truncate(c.kicker, 50) : '';
  const meta = card.meta && c.meta ? c.meta : '';
  const logo = card.logo ? assets.logo : null;
  let body = '';

  if (card.layout === 'centered') {
    const lines = wrap(c.title, 28, 3);
    const size = lines.length > 2 ? 56 : 64;
    const startY = 300 - ((lines.length - 1) * size * 1.18) / 2;
    body += logo ? `<image href="${logo}" x="${W / 2 - 160}" y="66" width="320" height="72" preserveAspectRatio="xMidYMid meet"/>` : `<rect x="${W / 2 - 32}" y="96" width="64" height="8" rx="4" fill="${accent}"/>`;
    if (kicker) body += `<text x="${W / 2}" y="${Math.round(startY - size - 18)}" text-anchor="middle" font-size="28" font-weight="600" fill="${fg}" fill-opacity="0.7">${esc(kicker)}</text>`;
    body += lines.map((l, i) => `<text x="${W / 2}" y="${Math.round(startY + i * size * 1.18)}" text-anchor="middle" font-size="${size}" font-weight="800" fill="${fg}">${esc(l)}</text>`).join('');
    if (meta) body += `<text x="${W / 2}" y="${Math.round(startY + lines.length * size * 1.18 + 20)}" text-anchor="middle" font-size="27" fill="${fg}" fill-opacity="0.72">${esc(truncate(meta, 72))}</text>`;
    body += `<text x="${W / 2}" y="574" text-anchor="middle" font-size="28" font-weight="800" fill="${accent}">${esc(footer)}</text>`;
  } else if (card.layout === 'split') {
    defs.push(`<linearGradient id="sp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${accent}" stop-opacity="0.6"/></linearGradient>`);
    body += `<rect x="780" y="0" width="420" height="${H}" fill="url(#sp)"/>`;
    body += logo
      ? `<image href="${logo}" x="830" y="235" width="320" height="160" preserveAspectRatio="xMidYMid meet"/>`
      : `<text x="990" y="335" text-anchor="middle" font-size="44" font-weight="800" fill="#ffffff">${esc(truncate(c.forum, 14))}</text>`;
    const lines = wrap(c.title, 21, 4);
    const size = lines.length > 3 ? 50 : lines.length > 2 ? 56 : 62;
    const startY = 290 - (lines.length - 1) * (size * 0.55);
    if (kicker) body += `<text x="72" y="130" font-size="28" font-weight="600" fill="${fg}" fill-opacity="0.7">${esc(truncate(kicker, 36))}</text>`;
    body += lines.map((l, i) => `<text x="72" y="${Math.round(startY + i * size * 1.18)}" font-size="${size}" font-weight="800" fill="${fg}">${esc(l)}</text>`).join('');
    if (meta) body += `<text x="72" y="520" font-size="26" fill="${fg}" fill-opacity="0.72">${esc(truncate(meta, 48))}</text>`;
    body += `<text x="72" y="572" font-size="28" font-weight="800" fill="${accent}">${esc(truncate(footer, 30))}</text>`;
  } else if (card.layout === 'minimal') {
    const lines = wrap(c.title, 24, 3);
    const size = lines.length > 2 ? 64 : 76;
    const startY = 300 - (lines.length - 1) * (size * 0.58);
    body += lines.map((l, i) => `<text x="80" y="${Math.round(startY + i * size * 1.16)}" font-size="${size}" font-weight="800" fill="${fg}">${esc(l)}</text>`).join('');
    body += logo ? `<image href="${logo}" x="${W - 80 - 220}" y="520" width="220" height="56" preserveAspectRatio="xMaxYMid meet"/>` : `<text x="${W - 80}" y="566" text-anchor="end" font-size="28" font-weight="800" fill="${accent}">${esc(footer)}</text>`;
  } else {
    const lines = wrap(c.title, 30, 3);
    const size = lines.length > 2 ? 58 : 66;
    const startY = 250 - (lines.length - 1) * (size * 0.6);
    body += `<rect x="80" y="84" width="64" height="8" rx="4" fill="${accent}"/>`;
    if (kicker) body += `<text x="80" y="140" font-size="30" font-weight="600" fill="${fg}" fill-opacity="0.7">${esc(kicker)}</text>`;
    body += lines.map((l, i) => `<text x="80" y="${Math.round(startY + i * size * 1.18)}" font-size="${size}" font-weight="800" fill="${fg}">${esc(l)}</text>`).join('');
    if (meta) body += `<text x="80" y="520" font-size="28" fill="${fg}" fill-opacity="0.72">${esc(truncate(meta, 70))}</text>`;
    if (logo) body += `<image href="${logo}" x="80" y="540" width="240" height="48" preserveAspectRatio="xMinYMid meet"/>`;
    else body += `<text x="80" y="572" font-size="30" font-weight="800" fill="${accent}">${esc(footer)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${defs.join('')}</defs>
${bg}${pattern}${glow}
<g font-family="${FONTS[card.font]}">${body}</g>
</svg>`;
}
