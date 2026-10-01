import type { Paginated, UserSummary } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export interface LogRow {
  id: number;
  type: string;
  action: string;
  actor: UserSummary | null;
  targetType: string | null;
  targetId: number | null;
  target: UserSummary | null;
  ip: string | null;
  data: Record<string, unknown> | null;
  createdAt: number;
}

export const load: PageLoad = async ({ fetch, url, parent }) => {
  const { access } = await parent();
  if (!access.elevated) return { logs: null };
  const qs = new URLSearchParams();
  for (const k of ['type', 'action', 'actorId', 'targetId', 'page']) {
    const v = url.searchParams.get(k);
    if (v) qs.set(k, v);
  }
  return { logs: await apiLoad<Paginated<LogRow>>(fetch, `/api/admin/logs?${qs}`, url) };
};
