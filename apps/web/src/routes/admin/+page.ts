import type { UserSummary } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export interface Dashboard {
  stats: {
    total: number;
    pendingApproval: number;
    pendingEmail: number;
    today: number;
    week: number;
    online: number;
    activeBans: number;
    warnings7d: number;
    failedJobs: number;
    pendingRequests: number;
  };
  latestMembers: UserSummary[];
  registrations: Array<{ day: string; count: number }>;
  posts: Array<{ day: string; count: number }>;
  topics: Array<{ day: string; count: number }>;
  recentActions: Array<{ id: number; type: string; action: string; actor: UserSummary | null; targetType: string | null; targetId: number | null; createdAt: number }>;
  forum: { topics: number; posts: number; postsToday: number; pendingPosts: number };
  system: { node: string; platform: string; db: string; mailDriver: string; imageDriver: string; rssMb: number; heapMb: number; uptimeSec: number; appUrl: string; env: string };
}

export const load: PageLoad = async ({ fetch, url, parent }) => {
  const { access } = await parent();
  if (!access.elevated) return { dashboard: null };
  return { dashboard: await apiLoad<Dashboard>(fetch, '/api/admin/dashboard', url) };
};
