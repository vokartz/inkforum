import { plainExcerpt, type WikiPageView } from '@forum/shared';
import { articleSeo, breadcrumbLd } from '$lib/seo';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url, depends }) => {
  depends('app:wiki-page');
  const page = await apiLoad<WikiPageView>(fetch, `/api/wiki/page?path=${encodeURIComponent(params.path)}`, url);
  const seo = articleSeo({
    title: page.title,
    description: page.summary || plainExcerpt(page.html, 180),
    path: `/wiki/${page.path}`,
    origin: url.origin,
    updatedAt: page.updatedAt,
    section: 'Wiki',
    noindex: !page.isPublished,
  });
  const crumbs = [{ label: 'Wiki', href: '/wiki' }, ...page.breadcrumbs.map((b) => ({ label: b.title, href: `/wiki/${b.path}` }))];
  seo.jsonLd = [seo.jsonLd as Record<string, unknown>, breadcrumbLd(crumbs, url.origin, { label: page.title, href: `/wiki/${page.path}` })];
  return { page, seo };
};
