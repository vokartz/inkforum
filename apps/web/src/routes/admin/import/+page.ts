import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export type ImportStatus = 'staging' | 'ready' | 'running' | 'done' | 'failed' | 'cancelled';
export type Charset = 'utf8' | 'windows-1254' | 'windows-1252';

export interface ImportCounts {
  users: number;
  groups: number;
  categories: number;
  boards: number;
  topics: number;
  posts: number;
  polls: number;
  conversations: number;
  attachments: number;
}

export interface ImportRun {
  id: number;
  platform: string;
  platformName: string;
  version: string;
  sourceName: string;
  sourceSize: number;
  status: ImportStatus;
  options: Record<string, unknown>;
  analysis: { platform?: string; platformName?: string; version?: string; prefix?: string; counts?: ImportCounts; baseUrl?: string | null; charset?: Charset; mojibake?: boolean; rows?: number };
  stats: Record<string, number>;
  log: Array<{ t: number; level: 'info' | 'warn' | 'error'; msg: string }>;
  progress: { phase: string; done: number; total: number } | null;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-import');
  const { access } = await parent();
  if (!access.elevated) return { imports: null };
  return { imports: await apiLoad<{ busy: boolean; runs: ImportRun[] }>(fetch, '/api/admin/import', url) };
};
