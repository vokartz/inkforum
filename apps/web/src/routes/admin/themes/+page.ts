import type { ThemeSummary } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-themes');
  const { access } = await parent();
  if (!access.elevated) return { themes: null };
  return { themes: (await apiLoad<{ items: ThemeSummary[] }>(fetch, '/api/admin/themes', url)).items };
};
