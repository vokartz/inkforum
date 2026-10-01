import type { Paginated } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export interface BanLogRow {
  id: number;
  ban_id: number;
  ban_name: string;
  user_id: number | null;
  ip: string | null;
  email: string | null;
  context: string;
  created_at: number;
}

export const load: PageLoad = async ({ fetch, url, parent }) => {
  const { access } = await parent();
  if (!access.elevated) return { log: null };
  const page = url.searchParams.get('page') ?? '1';
  return { log: await apiLoad<Paginated<BanLogRow>>(fetch, `/api/admin/bans/log?page=${page}&perPage=50`, url) };
};
