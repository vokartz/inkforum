import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export interface JobStats {
  counts: Record<string, number>;
  tasks: Array<{ name: string; interval_ms: number; next_run_at: number; last_run_at: number | null; last_status: string | null; last_error: string | null; is_enabled: number }>;
  failed: Array<{ id: number; type: string; attempts: number; last_error: string | null; finished_at: number | null; created_at: number }>;
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-jobs');
  const { access } = await parent();
  if (!access.elevated) return { stats: null };
  return { stats: await apiLoad<JobStats>(fetch, '/api/admin/jobs', url) };
};
