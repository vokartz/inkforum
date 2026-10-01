import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export interface AdminProfileField {
  id: number;
  key: string;
  name: string;
  description: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'url' | 'number' | 'date';
  options: string[];
  regex: string | null;
  maxLength: number;
  isRequired: boolean;
  showOnRegister: boolean;
  showInProfile: boolean;
  showInPosts: boolean;
  visibility: 'public' | 'members' | 'owner_staff' | 'staff';
  editableBy: 'owner' | 'staff';
  isActive: boolean;
  sortOrder: number;
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-fields');
  const { access } = await parent();
  if (!access.elevated) return { fields: [] as AdminProfileField[] };
  return { fields: await apiLoad<AdminProfileField[]>(fetch, '/api/admin/profile-fields', url) };
};
