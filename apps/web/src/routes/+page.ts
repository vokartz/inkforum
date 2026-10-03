import { effectiveLanding, type CustomPageView } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import { loadForumIndex } from '$lib/forum-index';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, parent, url }) => {
  const { viewer } = await parent();
  const landing = effectiveLanding(viewer.settings);
  if (landing) {
    const customPage = await apiLoad<CustomPageView>(fetch, `/api/pages/${encodeURIComponent(landing)}`, url).catch(() => null);
    if (customPage) return { landing: customPage, index: null, bare: customPage.layout === 'blank', seo: { canonical: '/', description: customPage.metaDescription ?? undefined } };
  }
  return { landing: null, index: await loadForumIndex(fetch, url), seo: { canonical: '/' } };
};
