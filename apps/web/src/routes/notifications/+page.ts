import type { Paginated } from '@forum/shared';
import { redirect } from '@sveltejs/kit';
import { load as apiLoad } from '$lib/api';
import type { NotificationItem } from '$lib/notifications';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:notifications');
  const { viewer } = await parent();
  if (!viewer.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
  const page = url.searchParams.get('page') ?? '1';
  const unread = url.searchParams.get('unread') === '1' ? '&unread=1' : '';
  return { notifications: await apiLoad<Paginated<NotificationItem>>(fetch, `/api/me/notifications?page=${page}&perPage=25${unread}`, url) };
};
