import { redirect } from '@sveltejs/kit';
import type { ConversationListItem, Paginated } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:messages');
  const { viewer } = await parent();
  if (!viewer.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  const page = Number(url.searchParams.get('liste') ?? 1) || 1;
  return { inbox: await apiLoad<Paginated<ConversationListItem>>(fetch, `/api/messages?page=${page}`, url) };
};
