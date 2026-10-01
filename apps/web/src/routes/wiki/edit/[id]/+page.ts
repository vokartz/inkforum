import type { WikiRevisionDetail } from '@forum/shared';
import { load as apiLoad, request } from '$lib/api';
import type { PageLoad } from './$types';

interface EditPage {
  id: number;
  parentId: number | null;
  slug: string;
  title: string;
  icon: string | null;
  summary: string | null;
  body: string;
  isPublished: boolean;
  isLocked: boolean;
  path: string;
}

export const load: PageLoad = async ({ fetch, params, url }) => {
  const page = await apiLoad<EditPage>(fetch, `/api/wiki/pages/${params.id}/edit`, url);
  // ?rev=… : eski bir sürümü geri yükleme
  const rev = Number(url.searchParams.get('rev'));
  const restore = rev > 0 ? await request<WikiRevisionDetail>(fetch, `/api/wiki/pages/${params.id}/revisions/${rev}`).catch(() => null) : null;
  return { edit: page, restore };
};
