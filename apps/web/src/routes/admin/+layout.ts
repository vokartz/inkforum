import { error, redirect } from '@sveltejs/kit';
import { request } from '$lib/api';
import { can } from '$lib/viewer';
import type { AdminOnboarding, ExtensionAdminMenu } from '@forum/shared';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ parent, fetch, url, depends }) => {
  depends('app:admin-access');
  const { viewer } = await parent();
  if (!viewer.user) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  if (!can(viewer, 'admin.access')) error(403, { message: 'Yönetim paneline erişim yetkiniz yok.' });
  const access = await request<{
    elevated: boolean;
    elevatedUntil: number | null;
    badges: { pendingUsers: number; pendingPosts: number; groupRequests: number; failedJobs: number };
    version?: { current: string; available: string | null };
    extensions?: ExtensionAdminMenu[];
    onboarding?: AdminOnboarding;
  }>(fetch, '/api/admin/access');
  return { access };
};
