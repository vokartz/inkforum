import { load as apiLoad } from '$lib/api';
import type { AdminBan } from '../users/[id]/+page';
import type { PageLoad } from './$types';

export interface BanStats {
  active: number;
  permanent: number;
  expiringSoon: number;
  blocked24h: number;
  blocked7d: number;
  byContext: Record<string, number>;
  topTriggers: Array<{ id: number; type: string; value: string; hits: number; lastHitAt: number | null; banId: number; banName: string }>;
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-bans');
  const { access } = await parent();
  const filter = url.searchParams.get('filter') ?? 'active';
  if (!access.elevated) return { bans: [] as AdminBan[], filter, stats: null };
  const [bans, stats] = await Promise.all([apiLoad<AdminBan[]>(fetch, `/api/admin/bans?filter=${filter}`, url), apiLoad<BanStats>(fetch, '/api/admin/bans/stats', url)]);
  return { bans, filter, stats };
};
