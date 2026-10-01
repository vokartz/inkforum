import type { GameServerInput } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-gameservers');
  const { access } = await parent();
  if (!access.elevated) return { servers: null };
  return {
    servers: (
      await apiLoad<{ servers: Array<GameServerInput & { id: string }> }>(
        fetch,
        '/api/admin/gameservers',
        url,
      )
    ).servers,
  };
};
