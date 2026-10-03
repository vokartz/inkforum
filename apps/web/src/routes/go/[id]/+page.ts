import { redirect } from '@sveltejs/kit';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, url }) => {
  const res = await apiLoad<{ url: string }>(fetch, `/api/boards/${params.id}/go`, url);
  redirect(302, res.url);
};
