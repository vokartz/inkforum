import { redirect } from '@sveltejs/kit';
import type { OAuthAuthorizeInfo } from '@forum/shared';
import { ApiError, request } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, parent }) => {
  const { viewer } = await parent();
  if (!viewer.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  try {
    const info = await request<OAuthAuthorizeInfo>(fetch, `/api/oauth/authorize${url.search}`);
    return { info, error: null, bare: true };
  } catch (e) {
    return { info: null, error: e instanceof ApiError ? e.message : 'Yetkilendirme isteği geçersiz.', bare: true };
  }
};
