import { load as apiLoad } from '$lib/api';
import type { AdminBan } from '../../users/[id]/+page';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, params, parent }) => {
  const { access } = await parent();
  if (!access.elevated) return { ban: null };
  return { ban: await apiLoad<AdminBan>(fetch, `/api/admin/bans/${params.id}`, url) };
};
