import type { AdminTicketCategory } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-tickets');
  const { access } = await parent();
  if (!access.elevated) return { items: null, groups: [] as GroupDto[] };
  const [cats, groups] = await Promise.all([apiLoad<{ items: AdminTicketCategory[] }>(fetch, '/api/admin/ticket-categories', url), apiLoad<GroupDto[]>(fetch, '/api/admin/groups', url)]);
  return { items: cats.items, groups };
};
