import { load as apiLoad } from '$lib/api';
import type { AchievementDto } from '$lib/types';
import type { PageLoad } from './$types';

export interface CatalogItem extends AchievementDto {
  earnedAt: number | null;
  rarity: number;
  progress: { current: number; target: number } | null;
}

export interface Catalog {
  categories: Array<{ id: number; name: string; description: string; sortOrder: number }>;
  items: CatalogItem[];
}

export const load: PageLoad = async ({ fetch, url }) => ({
  catalog: await apiLoad<Catalog>(fetch, '/api/achievements', url),
});
