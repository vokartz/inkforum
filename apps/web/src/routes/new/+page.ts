import { redirect } from '@sveltejs/kit';
import type { ForumIndex } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent }) => {
  const { viewer } = await parent();
  if (!viewer.user) redirect(303, `/login?next=${encodeURIComponent('/new')}`);
  const forum = await apiLoad<ForumIndex>(fetch, '/api/forum', url);
  if (forum.postableBoards.length === 1) redirect(303, `/f/${forum.postableBoards[0]!.id}/new`);
  return { forum };
};
