import type { AdminNavItem, BrandingAsset } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export interface AppearanceData {
  nav: AdminNavItem[];
  builtins: Array<{ key: string; label: string; url: string; icon: string; permission: string | null; visibility: string }>;
  socialPlatforms: Array<{ key: string; label: string }>;
  socialLinks: Array<{ platform: string; url: string }>;
  footerLinks: Array<{ label: string; url: string; newTab?: boolean }>;
  assets: Record<BrandingAsset, { url: string | null; maxKb: number; label: string }>;
}

export interface SettingsData {
  definitions: Array<{ key: string; section: string; value: unknown }>;
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-appearance');
  const { access } = await parent();
  if (!access.elevated) return { appearance: null, settings: null };
  const [appearance, settings] = await Promise.all([
    apiLoad<AppearanceData>(fetch, '/api/admin/appearance', url),
    apiLoad<SettingsData>(fetch, '/api/admin/settings', url),
  ]);
  return { appearance, settings };
};
