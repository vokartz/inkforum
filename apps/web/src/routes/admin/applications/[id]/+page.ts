import type { AdminApplicationForm } from '@forum/shared';
import { error } from '@sveltejs/kit';
import { load as apiLoad } from '$lib/api';
import type { GroupDto } from '$lib/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, params, parent }) => {
  const { access } = await parent();
  const isNew = params.id === 'new';
  if (!isNew && !/^\d+$/.test(params.id)) error(404, { message: 'Form bulunamadı.' });
  if (!access.elevated) return { form: null, groups: [] as GroupDto[], isNew };
  const [list, groups] = await Promise.all([
    apiLoad<{ items: AdminApplicationForm[] }>(fetch, '/api/admin/application-forms', url),
    apiLoad<GroupDto[]>(fetch, '/api/admin/groups', url),
  ]);
  const form = isNew ? null : (list.items.find((f) => String(f.id) === params.id) ?? null);
  if (!isNew && !form) error(404, { message: 'Form bulunamadı.' });
  return { form, groups, isNew };
};
