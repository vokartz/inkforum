import { error, redirect } from '@sveltejs/kit';
import { plainExcerpt, type CustomPageResult, type ExtensionPageView } from '@forum/shared';
import { loadCustomPage } from '$lib/custom-page-load';
import { load as apiLoad } from '$lib/api';
import { articleSeo } from '$lib/seo';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url }) => {
  if (!/^[a-z0-9/-]{1,300}$/i.test(params.path)) error(404, { message: 'Sayfa bulunamadı.' });
  const query = new URLSearchParams(url.searchParams);
  query.set('path', params.path);
  const result = await apiLoad<CustomPageResult | ExtensionPageView>(fetch, `/api/page-route?${query}`, url);
  if ('kind' in result && result.kind === 'extension') {
    const seo = articleSeo({ title: result.title, description: result.description || plainExcerpt(result.html, 180), path: result.path, origin: url.origin });
    return { extPage: result, customPage: null, bare: result.layout === 'blank', seo: { ...seo, type: 'website' as const } };
  }
  if ('redirect' in result) redirect(([301, 302, 303, 307, 308].includes(result.status) ? result.status : 302) as 302, result.redirect);
  return { extPage: null, ...(await loadCustomPage(fetch, '', url, result as CustomPageResult)) };
};
