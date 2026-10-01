import type { Paginated, UnreadTopicItem } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
  const page = Number(url.searchParams.get('page')) || 1;
  const unread = await apiLoad<Paginated<UnreadTopicItem>>(fetch, `/api/forum/unread?page=${page}`, url);
  return { unread };
};
