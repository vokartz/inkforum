import { LOCALE_INFO, SOURCE_LOCALE, isLocale, translate, type Catalog, type Locale, type TParams } from '@forum/shared';

/**
 * Arayüz çevirisi. Kullanım: `t('Kaydet')`, `t('{n} konu', { n })`.
 * Anahtar Türkçe kaynak metnin kendisidir; katalogda yoksa Türkçe gösterilir.
 *
 * Dil kök düzende (+layout.svelte) sunucunun belirlediği değere ayarlanır. SSR bileşen çizimi eşzamanlı
 * olduğu için modül düzeyindeki dil değeri istekler arasında karışmaz. Modül düzeyinde (bileşen dışında,
 * bir kez çalışan) kodda t() çağırmayın; metni sabit bırakıp gösterildiği yerde t(metin) kullanın.
 */

// Yalnızca seçilen dilin kataloğu indirilir (her dil ayrı parça)
const loaders = import.meta.glob<{ default: Catalog }>('../../../../packages/shared/i18n/*.json');
const catalogs = new Map<Locale, Catalog>();

class I18nState {
  locale = $state<Locale>(SOURCE_LOCALE);
}
export const i18n = new I18nState();

export async function loadCatalog(locale: Locale): Promise<void> {
  if (locale === SOURCE_LOCALE || catalogs.has(locale)) return;
  const key = Object.keys(loaders).find((k) => k.endsWith(`/${locale}.json`));
  if (!key) return;
  try {
    const mod = await loaders[key]!();
    catalogs.set(locale, mod.default);
  } catch {
    /* katalog yüklenemezse Türkçe gösterilir */
  }
}

export function setLocale(locale: string | null | undefined): void {
  const l = isLocale(locale) ? locale : SOURCE_LOCALE;
  if (i18n.locale !== l) i18n.locale = l;
}

/** Çeviri */
export function t(source: string, params?: TParams): string {
  const l = i18n.locale;
  return translate(catalogs.get(l), l, source, params);
}

/**
 * Veritabanından gelen içerik (grup, başarı adı…): kurulumdaki varsayılan Türkçe metinse çevrilir,
 * yöneticinin yazdığı metin olduğu gibi kalır. Yer tutucu işlenmez.
 */
export function tc(text: string | null | undefined): string {
  if (!text) return text ?? '';
  const l = i18n.locale;
  if (l === SOURCE_LOCALE) return text;
  return catalogs.get(l)?.[text] || text;
}

/** Intl için dil etiketi (ör. "en-US") */
export function localeTag(): string {
  return LOCALE_INFO[i18n.locale].tag;
}
