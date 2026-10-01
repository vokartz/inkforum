import type { AdminCustomEmoji } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-emojis');
  const { access } = await parent();
  if (!access.elevated) return { items: null };
  const { items } = await apiLoad<{ items: AdminCustomEmoji[] }>(fetch, '/api/admin/emojis', url);
  return { items };
};
