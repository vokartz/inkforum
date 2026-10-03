import { error, redirect } from '@sveltejs/kit';
import { plainExcerpt, type ExtensionPageView } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import { articleSeo } from '$lib/seo';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url }) => {
  const path = params.path || '/';
  if (!/^[a-z0-9/-]{1,300}$/i.test(path)) error(404, { message: 'Sayfa bulunamadı.' });
  const query = new URLSearchParams(url.searchParams);
  query.set('path', path);
  const result = await apiLoad<ExtensionPageView | { redirect: string; status: number }>(fetch, `/api/page-route?${query}`, url);
  if ('redirect' in result) redirect(([301, 302, 303, 307, 308].includes(result.status) ? result.status : 302) as 302, result.redirect);
  if (result.kind !== 'extension') error(404, { message: 'Sayfa bulunamadı.' });
  const seo = articleSeo({ title: result.title, description: result.description || plainExcerpt(result.html, 180), path: url.pathname, origin: url.origin });
  return { extPage: result, bare: result.layout === 'blank', seo: { ...seo, type: 'website' as const } };
};
