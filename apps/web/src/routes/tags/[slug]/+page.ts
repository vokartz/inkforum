import type { TagPage } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, params }) => {
  const page = Number(url.searchParams.get('page')) || 1;
  const tagPage = await apiLoad<TagPage>(fetch, `/api/tags/${encodeURIComponent(params.slug)}?page=${page}`, url);
  return { tagPage };
};
