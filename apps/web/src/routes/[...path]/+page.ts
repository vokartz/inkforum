import { error } from '@sveltejs/kit';
import { loadCustomPage } from '$lib/custom-page-load';
import type { PageLoad } from './$types';

/**
 * Kök adresli özel sayfalar (/ucp, /ucp/karakterler…). Forumun kendi sayfaları her zaman önce
 * eşleşir; burası yalnızca başka hiçbir sayfaya uymayan adresler için çalışır.
 */
export const load: PageLoad = ({ fetch, params, url }) => {
  if (!/^[a-z0-9/-]{1,300}$/i.test(params.path)) error(404, { message: 'Sayfa bulunamadı.' });
  const query = new URLSearchParams(url.searchParams);
  query.set('path', params.path);
  return loadCustomPage(fetch, `/api/page-route?${query}`, url);
};
