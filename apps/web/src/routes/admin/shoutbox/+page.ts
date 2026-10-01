import type { ShoutboxSettings } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-shoutbox');
  const { access } = await parent();
  if (!access.elevated) return { shoutbox: null };
  return {
    shoutbox: await apiLoad<{ settings: ShoutboxSettings; stats: { total: number; today: number } }>(
      fetch,
      '/api/admin/shoutbox',
      url,
    ),
  };
};
