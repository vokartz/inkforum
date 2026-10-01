import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export interface SettingDef {
  key: string;
  section: string;
  label: string;
  description: string | null;
  input: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'list';
  options: Array<{ value: string; label: string }> | null;
  default: unknown;
  value: unknown;
}

export const load: PageLoad = async ({ fetch, url, params, parent, depends }) => {
  depends('app:admin-settings');
  const { access } = await parent();
  if (!access.elevated) return { settings: null, section: params.section };
  return {
    settings: await apiLoad<{ sections: Record<string, string>; definitions: SettingDef[] }>(fetch, '/api/admin/settings', url),
    section: params.section,
  };
};
