import type { AdminCustomPage } from '@forum/shared';
import { error, redirect } from '@sveltejs/kit';
import { load as apiLoad, request } from '$lib/api';
import { can } from '$lib/viewer';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

/** Stüdyo: sayfaları tam ekranda düzenleme (yönetim paneli çerçevesi olmadan). */
export const load: PageLoad = async ({ fetch, url, params, parent, depends }) => {
  depends('app:studio');
  const { viewer } = await parent();
  if (!viewer.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
  if (!can(viewer, 'admin.access') || !can(viewer, 'admin.pages.manage')) error(403, { message: 'Sayfaları düzenleme yetkiniz yok.' });
  const isNew = params.id === 'new';
  if (!isNew && !/^\d+$/.test(params.id)) error(404, { message: 'Sayfa bulunamadı.' });

  const access = await request<{ elevated: boolean }>(fetch, '/api/admin/access');
  const base = { bare: true, isNew, elevated: access.elevated };
  if (!access.elevated) return { ...base, page: null, canCode: false, landingSlug: null as string | null, groups: [] as GroupDto[] };

  const [res, groups] = await Promise.all([
    isNew
      ? apiLoad<{ pages: AdminCustomPage[]; canCode: boolean; landingSlug: string | null }>(fetch, '/api/admin/pages', url).then((r) => ({ page: null, canCode: r.canCode, landingSlug: r.landingSlug }))
      : apiLoad<{ page: AdminCustomPage; canCode: boolean; landingSlug: string | null }>(fetch, `/api/admin/pages/${params.id}`, url),
    apiLoad<GroupDto[]>(fetch, '/api/admin/groups', url),
  ]);
  return { ...base, page: res.page, canCode: res.canCode, landingSlug: res.landingSlug, groups };
};
