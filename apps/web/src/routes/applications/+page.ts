import type { ApplicationFormSummary, ApplicationItem } from '@forum/shared';
import { load as apiLoad, request } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:applications');
  const { viewer } = await parent();
  const [forms, mine] = await Promise.all([
    apiLoad<ApplicationFormSummary[]>(fetch, '/api/applications', url),
    viewer.user ? request<{ items: ApplicationItem[] }>(fetch, '/api/applications/mine').catch(() => ({ items: [] as ApplicationItem[] })) : { items: [] as ApplicationItem[] },
  ]);
  return { forms, mine: mine.items };
};
