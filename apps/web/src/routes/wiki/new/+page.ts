import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, url }) => {
  const { wiki } = await parent();
  const p = Number(url.searchParams.get('parent'));
  return { parentId: Number.isInteger(p) && p > 0 ? p : null, canEdit: wiki.canEdit };
};
