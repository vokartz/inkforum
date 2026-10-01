import { effectiveLanding, type CustomPageView } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import { loadForumIndex } from '$lib/forum-index';
import type { PageLoad } from './$types';

/** Ana sayfa: açılış sayfası seçiliyse o sayfa (forum /forum adresinde), değilse forum dizini. */
export const load: PageLoad = async ({ fetch, parent, url }) => {
  const { viewer } = await parent();
  // Açılış sayfası eklentisi kapalıysa ana sayfa her zaman forum dizinidir
  const landing = effectiveLanding(viewer.settings);
  if (landing) {
    const customPage = await apiLoad<CustomPageView>(fetch, `/api/pages/${encodeURIComponent(landing)}`, url).catch(() => null);
    if (customPage) return { landing: customPage, index: null, bare: customPage.layout === 'blank', seo: { canonical: '/', description: customPage.metaDescription ?? undefined } };
  }
  return { landing: null, index: await loadForumIndex(fetch, url), seo: { canonical: '/' } };
};
