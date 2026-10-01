import { error } from '@sveltejs/kit';
import { load as apiLoad } from '$lib/api';
import { profileSeo } from '$lib/seo';
import type { PublicProfile } from '$lib/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url, parent }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) error(404, { message: 'Üye bulunamadı.' });
  const profile = await apiLoad<PublicProfile>(fetch, `/api/users/${id}`, url);
  const { viewer } = await parent();
  return { profile, seo: profileSeo(profile, url.origin, viewer.settings) };
};
