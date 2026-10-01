import type { AdminReaction } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-reactions');
  const { access } = await parent();
  if (!access.elevated) return { items: null };
  const { items } = await apiLoad<{ items: AdminReaction[] }>(fetch, '/api/admin/forum/reactions', url);
  return { items };
};
