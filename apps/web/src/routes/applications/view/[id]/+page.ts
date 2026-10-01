import type { ApplicationDetail } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url, depends }) => {
  depends('app:application');
  return { app: await apiLoad<ApplicationDetail>(fetch, `/api/applications/${params.id}`, url) };
};
