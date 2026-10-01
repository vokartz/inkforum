/**
 * Kullanıcı adı / görünen ad / e-posta için karşılaştırma anahtarları.
 * Veritabanında `*_canonical` sütunlarında saklanır ve düz UNIQUE index ile korunur.
 * Türkçe İ/ı dahil tüm varyantlar aynı anahtara katlanır: Ilker = İlker = ılker = ilker.
 */

const ZERO_WIDTH = new RegExp(`[${String.fromCharCode(0x200b)}-${String.fromCharCode(0x200d)}${String.fromCharCode(0x2060)}${String.fromCharCode(0xfeff)}]`, 'g');
const COMBINING_DOT_ABOVE = /̇/g;
const WHITESPACE = /\s+/g;

export function canonicalName(input: string): string {
  return input
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .toLowerCase() // locale bağımsız: İ -> i̇ (i + U+0307)
    .replace(COMBINING_DOT_ABOVE, '')
    .replace(/ı/g, 'i')
    .replace(WHITESPACE, ' ')
    .trim();
}

export function canonicalEmail(input: string): string {
  const trimmed = input.normalize('NFKC').replace(ZERO_WIDTH, '').trim();
  const at = trimmed.lastIndexOf('@');
  if (at < 1) return trimmed.toLowerCase();
  const local = trimmed.slice(0, at).toLowerCase();
  const domain = trimmed.slice(at + 1).toLowerCase();
  return `${local}@${domainToAscii(domain)}`;
}

export function emailDomain(canonical: string): string {
  const at = canonical.lastIndexOf('@');
  return at < 0 ? '' : canonical.slice(at + 1);
}

function domainToAscii(domain: string): string {
  try {
    // URL ayrıştırıcısı IDN alan adlarını punycode'a çevirir (tarayıcı ve Node'da aynı).
    return new URL(`http://${domain}`).hostname;
  } catch {
    return domain;
  }
}

/** Arama için LIKE deseni: canonical değer + joker karakter kaçışı. */
export function likePattern(term: string, mode: 'prefix' | 'contains' = 'contains'): string {
  const escaped = canonicalName(term).replace(/[\\%_]/g, (c) => `\\${c}`);
  return mode === 'prefix' ? `${escaped}%` : `%${escaped}%`;
}

/** URL'lerde kullanılacak basit slug (profil bağlantıları için). */
export function slugify(input: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' };
  const slug = canonicalName(input)
    .replace(/[çğıöşü]/g, (c) => map[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'uye';
}
