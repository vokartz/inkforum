import type { NewTopicContext } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url }) => {
  const ctx = await apiLoad<NewTopicContext>(fetch, `/api/boards/${params.id}/new`, url);
  return { ctx };
};
