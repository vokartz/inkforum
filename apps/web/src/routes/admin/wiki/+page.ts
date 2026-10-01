import type { WikiIndex } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, depends }) => {
  depends('app:wiki');
  return { wiki: await apiLoad<WikiIndex>(fetch, '/api/wiki', url) };
};
