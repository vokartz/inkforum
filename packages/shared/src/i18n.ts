export const LOCALES = ['tr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const SOURCE_LOCALE: Locale = 'tr';

export const LOCALE_INFO: Record<Locale, { name: string; english: string; tag: string; flag: string }> = {
  tr: { name: 'Türkçe', english: 'Turkish', tag: 'tr-TR', flag: '🇹🇷' },
  en: { name: 'English', english: 'English', tag: 'en-US', flag: '🇬🇧' },
};

export const LANG_COOKIE = 'forum_lang';

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export function normalizeLocale(v: string | null | undefined): Locale | null {
  if (!v) return null;
  const base = v.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return isLocale(base) ? base : null;
}

export function matchAcceptLanguage(header: string | null | undefined, enabled: readonly Locale[]): Locale | null {
  if (!header) return null;
  const prefs = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { tag: tag ?? '', q: q ? Number(q.slice(2)) || 0 : 1 };
    })
    .filter((p) => p.tag && p.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const p of prefs) {
    const l = normalizeLocale(p.tag);
    if (l && enabled.includes(l)) return l;
  }
  return null;
}

export type Catalog = Record<string, string>;
export type TParams = Record<string, string | number | null | undefined>;

const pluralCache = new Map<string, Intl.PluralRules>();
function pluralRule(locale: Locale): Intl.PluralRules {
  let r = pluralCache.get(locale);
  if (!r) {
    r = new Intl.PluralRules(LOCALE_INFO[locale].tag);
    pluralCache.set(locale, r);
  }
  return r;
}

function closing(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

export function format(message: string, params: TParams | undefined, locale: Locale): string {
  if (!params || !message.includes('{')) return message;
  let out = '';
  let i = 0;
  while (i < message.length) {
    const open = message.indexOf('{', i);
    if (open === -1) {
      out += message.slice(i);
      break;
    }
    out += message.slice(i, open);
    const end = closing(message, open);
    if (end === -1) {
      out += message.slice(open);
      break;
    }
    const body = message.slice(open + 1, end);
    const m = /^\s*([\w.]+)\s*,\s*plural\s*,([\s\S]*)$/.exec(body);
    if (m) {
      const n = Number(params[m[1]!] ?? 0);
      const options = new Map<string, string>();
      const rest = m[2]!;
      let j = 0;
      while (j < rest.length) {
        const sel = /\s*(=\d+|zero|one|two|few|many|other)\s*\{/y;
        sel.lastIndex = j;
        const sm = sel.exec(rest);
        if (!sm) break;
        const bOpen = sel.lastIndex - 1;
        const bEnd = closing(rest, bOpen);
        if (bEnd === -1) break;
        options.set(sm[1]!, rest.slice(bOpen + 1, bEnd));
        j = bEnd + 1;
      }
      const pick = options.get(`=${n}`) ?? options.get(pluralRule(locale).select(n)) ?? options.get('other') ?? '';
      out += format(pick.replace(/#/g, new Intl.NumberFormat(LOCALE_INFO[locale].tag).format(n)), params, locale);
    } else {
      const key = body.trim();
      out += key in params ? String(params[key] ?? '') : `{${body}}`;
    }
    i = end + 1;
  }
  return out;
}

export const FALLBACK_LOCALE: Locale = 'en';
export function withFallback(catalog: Catalog | null | undefined, fallback: Catalog | null | undefined): Catalog {
  const out: Catalog = {};
  for (const [k, v] of Object.entries(fallback ?? {})) if (v) out[k] = v;
  for (const [k, v] of Object.entries(catalog ?? {})) if (v) out[k] = v;
  return out;
}

export function translate(catalog: Catalog | null | undefined, locale: Locale, source: string, params?: TParams): string {
  const msg = (locale !== SOURCE_LOCALE && catalog?.[source]) || source;
  return format(msg, params, locale);
}

export function createMessageTranslator(catalog: Catalog, locale: Locale): (text: string) => string {
  const patterns: Array<{ re: RegExp; names: string[]; target: string }> = [];
  for (const [key, target] of Object.entries(catalog)) {
    if (!target || !key.includes('{') || /,\s*plural\s*,/.test(key)) continue;
    const names: string[] = [];
    const src = key.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}/g, (_m, n: string) => {
      names.push(n);
      return '([\\s\\S]+?)';
    });
    if (!names.length) continue;
    patterns.push({ re: new RegExp(`^${src}$`), names, target });
  }
  const cache = new Map<string, string>();
  return (text: string) => {
    if (locale === SOURCE_LOCALE || !text) return text;
    const exact = catalog[text];
    if (exact) return exact;
    const hit = cache.get(text);
    if (hit !== undefined) return hit;
    let result = text;
    for (const p of patterns) {
      const m = p.re.exec(text);
      if (m) {
        const params: TParams = {};
        p.names.forEach((n, i) => (params[n] = m[i + 1]));
        result = format(p.target, params, locale);
        break;
      }
    }
    if (cache.size < 5000) cache.set(text, result);
    return result;
  };
}
