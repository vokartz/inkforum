import { error } from '@sveltejs/kit';
import type { ExtensionProfileSlots } from '@forum/shared';
import { load as apiLoad, request } from '$lib/api';
import { profileSeo } from '$lib/seo';
import type { PublicProfile } from '$lib/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url, parent }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) error(404, { message: 'Üye bulunamadı.' });
  const [profile, { viewer, safeMode }] = await Promise.all([apiLoad<PublicProfile>(fetch, `/api/users/${id}`, url), parent()]);
  const extSlots = safeMode ? null : await request<ExtensionProfileSlots>(fetch, `/api/extensions/profile/${id}`).catch(() => null);
  return { profile, extSlots, seo: profileSeo(profile, url.origin, viewer.settings) };
};
