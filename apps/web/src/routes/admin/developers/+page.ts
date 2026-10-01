import type { AdminApiKey, AdminOAuthClient, AdminSocialProvider, AdminWebhook } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export interface DevOverview {
  clients: AdminOAuthClient[];
  keys: AdminApiKey[];
  webhooks: AdminWebhook[];
  social: AdminSocialProvider[];
  metadata: Record<string, unknown> & { authorization_endpoint: string; token_endpoint: string; userinfo_endpoint: string };
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-developers');
  const { access } = await parent();
  if (!access.elevated) return { dev: null };
  return { dev: await apiLoad<DevOverview>(fetch, '/api/admin/developers', url) };
};
