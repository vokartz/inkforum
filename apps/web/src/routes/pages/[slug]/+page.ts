import { plainExcerpt, type CustomPageView } from '@forum/shared';
import { articleSeo } from '$lib/seo';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url }) => {
  const customPage = await apiLoad<CustomPageView>(fetch, `/api/pages/${encodeURIComponent(params.slug)}`, url);
  // "Boş" düzen: kök layout üst çubuk ve alt bilgiyi çizmez.
  const seo = articleSeo({
    title: customPage.title,
    description: customPage.metaDescription || plainExcerpt(customPage.html, 180),
    path: customPage.isLanding ? '/' : `/pages/${customPage.slug}`,
    origin: url.origin,
    updatedAt: customPage.updatedAt,
    noindex: !customPage.isPublished,
  });
  return { customPage, bare: customPage.layout === 'blank', seo: { ...seo, type: 'website' as const } };
};
