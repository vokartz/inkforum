import type { AdminCustomPage } from '@forum/shared';
import { error } from '@sveltejs/kit';
import { load as apiLoad } from '$lib/api';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, params, parent, depends }) => {
  depends('app:admin-page');
  const { access } = await parent();
  const isNew = params.id === 'new';
  if (!isNew && !/^\d+$/.test(params.id)) error(404, { message: 'Sayfa bulunamadı.' });
  if (!access.elevated) return { isNew, page: null, canCode: false, landingSlug: null as string | null, groups: [] as GroupDto[] };
  const [res, groups] = await Promise.all([
    isNew
      ? apiLoad<{ canCode: boolean; landingSlug: string | null }>(fetch, '/api/admin/pages', url).then((r) => ({ page: null, canCode: r.canCode, landingSlug: r.landingSlug }))
      : apiLoad<{ page: AdminCustomPage; canCode: boolean; landingSlug: string | null }>(fetch, `/api/admin/pages/${params.id}`, url),
    apiLoad<GroupDto[]>(fetch, '/api/admin/groups', url),
  ]);
  return { isNew, page: res.page, canCode: res.canCode, landingSlug: res.landingSlug, groups };
};
