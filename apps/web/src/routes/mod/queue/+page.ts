import type { ModQueuePage } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, depends }) => {
  depends('app:mod-queue');
  const page = Number(url.searchParams.get('page')) || 1;
  const queue = await apiLoad<ModQueuePage>(fetch, `/api/mod/queue?page=${page}`, url);
  return { queue, seo: { noindex: true } };
};
