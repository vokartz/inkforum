import type { BoardPage, ExtensionSlotItem } from '@forum/shared';
import { load as apiLoad, request } from '$lib/api';
import { boardSeo } from '$lib/seo';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url, parent }) => {
  const q = new URLSearchParams();
  for (const k of ['page', 'sort', 'dir', 'prefix']) {
    const v = url.searchParams.get(k);
    if (v) q.set(k, v);
  }
  const board = await apiLoad<BoardPage>(fetch, `/api/boards/${params.id}?${q}`, url);
  const { safeMode } = await parent();
  const ext = safeMode ? null : await request<{ boardTop: ExtensionSlotItem[] }>(fetch, `/api/extensions/board/${board.board.id}`).catch(() => null);
  return { board, extTop: ext?.boardTop ?? [], seo: boardSeo(board, url.origin) };
};
