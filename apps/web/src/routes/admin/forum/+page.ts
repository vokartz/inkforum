import type { AdminCategory, PermissionProfileSummary, TopicPrefix } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export interface AdminForumTree {
  categories: AdminCategory[];
  profiles: PermissionProfileSummary[];
  prefixes: Array<TopicPrefix & { boardIds: number[] | null; sortOrder: number }>;
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-forum');
  const { access } = await parent();
  if (!access.elevated) return { tree: null };
  return { tree: await apiLoad<AdminForumTree>(fetch, '/api/admin/forum', url) };
};
