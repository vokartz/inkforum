import { loadForumIndex } from '$lib/forum-index';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, parent, url }) => {
  await parent();
  return { index: await loadForumIndex(fetch, url), seo: { title: 'Forum', canonical: '/forum' } };
};
