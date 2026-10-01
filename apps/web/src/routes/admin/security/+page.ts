import type { AdminWaf } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-waf');
  const { access } = await parent();
  if (!access.elevated) return { waf: null };
  return { waf: await apiLoad<AdminWaf>(fetch, '/api/admin/waf', url) };
};
