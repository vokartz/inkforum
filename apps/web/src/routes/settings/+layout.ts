import { redirect } from '@sveltejs/kit';
import type { ExtensionAccountMenuItem } from '@forum/shared';
import { request } from '$lib/api';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ parent, url, fetch }) => {
  const { viewer, safeMode } = await parent();
  if (!viewer.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  const extPages = safeMode ? [] : await request<ExtensionAccountMenuItem[]>(fetch, '/api/extensions/account').catch(() => [] as ExtensionAccountMenuItem[]);
  return { extPages };
};
