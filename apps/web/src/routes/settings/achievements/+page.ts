import { load as apiLoad } from '$lib/api';
import type { EarnedAchievement } from '$lib/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => ({
  achievements: await apiLoad<EarnedAchievement[]>(fetch, '/api/me/achievements', url),
});
