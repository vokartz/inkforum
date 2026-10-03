import { TextDecoder } from 'node:util';

export type SourceCharset = 'utf8' | 'windows-1254' | 'windows-1252';

const decoders = new Map<string, TextDecoder>();
function decoder(cs: SourceCharset): TextDecoder {
  let d = decoders.get(cs);
  if (!d) {
    d = new TextDecoder(cs === 'utf8' ? 'utf-8' : cs, { fatal: false });
    decoders.set(cs, d);
  }
  return d;
}

const CP1252_HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

function encodeCp1252(s: string): Buffer | null {
  const out = Buffer.alloc(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x100 && (c < 0x80 || c > 0x9f)) out[i] = c;
    else if (CP1252_HIGH[c] !== undefined) out[i] = CP1252_HIGH[c]!;
    else if (c >= 0x80 && c <= 0x9f) out[i] = c;
    else return null;
  }
  return out;
}

const MOJIBAKE = /Ã[\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™]|Å[\u009e\u009fŽŸƒ¸¾º»¡\u00a0žšŠ]|Ä[±°ŸŽƒ\u009f\u009ež]|â€/;

export function looksDoubleEncoded(s: string): boolean {
  return MOJIBAKE.test(s);
}

export function fixDoubleEncoding(s: string): string {
  if (!looksDoubleEncoded(s)) return s;
  const bytes = encodeCp1252(s);
  if (!bytes) return s;
  const fixed = bytes.toString('utf8');
  return fixed.includes('�') ? s : fixed;
}

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', euro: '€', trade: '™', middot: '·', bull: '•', deg: '°',
};

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]{1,8});/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function makeText(charset: SourceCharset, fixMojibake: boolean) {
  return (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);
    const buf = v instanceof Uint8Array ? v : Buffer.from(String(v), 'utf8');
    const s = decoder(charset).decode(buf);
    return fixMojibake ? fixDoubleEncoding(s) : s;
  };
}

export const num = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (v instanceof Uint8Array) return Number(Buffer.from(v).toString('latin1')) || 0;
  return Number(v) || 0;
};

export function ipText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const buf = v instanceof Uint8Array ? Buffer.from(v) : Buffer.from(String(v), 'utf8');
  if (buf.length === 4) return [...buf].join('.');
  if (buf.length === 16 && !/^[\d.:a-f]+$/i.test(buf.toString('latin1'))) {
    const parts: string[] = [];
    for (let i = 0; i < 16; i += 2) parts.push(buf.readUInt16BE(i).toString(16));
    return parts.join(':');
  }
  const s = buf.toString('latin1').trim();
  return /^[\d.:a-f]{3,45}$/i.test(s) ? s : null;
}
