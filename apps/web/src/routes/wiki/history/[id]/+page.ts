import type { WikiRevisionDetail, WikiRevisionItem } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url }) => {
  const { items } = await apiLoad<{ items: WikiRevisionItem[] }>(fetch, `/api/wiki/pages/${params.id}/revisions`, url);
  const revId = Number(url.searchParams.get('rev')) || items[0]?.id;
  const selected = revId ? await apiLoad<WikiRevisionDetail>(fetch, `/api/wiki/pages/${params.id}/revisions/${revId}`, url) : null;
  return { pageId: Number(params.id), revisions: items, selected };
};
