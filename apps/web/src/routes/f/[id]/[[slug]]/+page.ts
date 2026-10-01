import type { BoardPage } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import { boardSeo } from '$lib/seo';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url }) => {
  const q = new URLSearchParams();
  for (const k of ['page', 'sort', 'dir', 'prefix']) {
    const v = url.searchParams.get(k);
    if (v) q.set(k, v);
  }
  const board = await apiLoad<BoardPage>(fetch, `/api/boards/${params.id}?${q}`, url);
  return { board, seo: boardSeo(board, url.origin) };
};
