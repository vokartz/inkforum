import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export type BackupKind = 'db' | 'sql' | 'full';

export interface BackupItem {
  name: string;
  size: number;
  createdAt: number;
  label: string;
  kind: BackupKind;
}

export interface BackupList {
  supported: boolean;
  reason: string | null;
  driver: string;
  items: BackupItem[];
  autoBackup: boolean;
  keep: number;
  hour: number;
  kind: BackupKind;
  lastRestore: { ok: boolean; name: string; at: number; message: string; safety: string | null } | null;
  restorePending: boolean;
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-backups');
  const { access } = await parent();
  if (!access.elevated) return { backups: null };
  return { backups: await apiLoad<BackupList>(fetch, '/api/admin/backups', url) };
};
