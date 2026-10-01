import { load as apiLoad } from '$lib/api';
import type { AchievementDto, GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export interface CriteriaType {
  type: string;
  label: string;
  description: string;
  fields: Array<{ key: string; label: string; type: 'number' | 'group'; min?: number }>;
}

export interface AdminAchievements {
  items: AchievementDto[];
  categories: Array<{ id: number; name: string; description: string; sortOrder: number }>;
  criteriaTypes: CriteriaType[];
  tiers: Array<{ value: number; label: string }>;
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-achievements');
  const { access } = await parent();
  if (!access.elevated) return { data: null, groups: [] as GroupDto[] };
  const [data, groups] = await Promise.all([
    apiLoad<AdminAchievements>(fetch, '/api/admin/achievements', url),
    apiLoad<GroupDto[]>(fetch, '/api/admin/groups', url).catch(() => [] as GroupDto[]),
  ]);
  return { data, groups };
};
