import { redirect } from '@sveltejs/kit';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

/** Bağlantı bölümü: tıklama sayılır ve hedefe yönlendirilir. */
export const load: PageLoad = async ({ fetch, params, url }) => {
  const res = await apiLoad<{ url: string }>(fetch, `/api/boards/${params.id}/go`, url);
  redirect(302, res.url);
};
