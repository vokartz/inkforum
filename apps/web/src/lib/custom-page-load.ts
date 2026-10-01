import { redirect } from '@sveltejs/kit';
import { plainExcerpt, type CustomPageResult, type CustomPageView } from '@forum/shared';
import { articleSeo } from '$lib/seo';
import { load as apiLoad } from '$lib/api';

/**
 * Özel sayfa verisi: sayfanın sunucu kodu yönlendirme döndürürse (ör. misafiri /login'e) bu,
 * sunucuda çizim sırasında gerçek bir HTTP yönlendirmesi olur.
 */
export async function loadCustomPage(fetch: typeof globalThis.fetch, apiPath: string, url: URL) {
  const result = await apiLoad<CustomPageResult>(fetch, apiPath, url);
  if ('redirect' in result) redirect(([301, 302, 303, 307, 308].includes(result.status) ? result.status : 302) as 302, result.redirect);
  const customPage = result as CustomPageView;
  const path = customPage.isLanding ? '/' : customPage.route ? `/${customPage.route}` : `/pages/${customPage.slug}`;
  const seo = articleSeo({
    title: customPage.title,
    description: customPage.metaDescription || plainExcerpt(customPage.html, 180),
    path,
    origin: url.origin,
    updatedAt: customPage.updatedAt,
    noindex: !customPage.isPublished,
  });
  // "Boş" düzen: kök layout üst çubuk ve alt bilgiyi çizmez.
  return { customPage, bare: customPage.layout === 'blank', seo: { ...seo, type: 'website' as const } };
}
