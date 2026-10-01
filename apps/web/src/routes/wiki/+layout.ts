import type { WikiIndex } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { LayoutLoad } from './$types';

/** Tüm wiki sayfaları için ağaç (kenar çubuğu) */
export const load: LayoutLoad = async ({ fetch, url, depends }) => {
  depends('app:wiki');
  return { wiki: await apiLoad<WikiIndex>(fetch, '/api/wiki', url) };
};
