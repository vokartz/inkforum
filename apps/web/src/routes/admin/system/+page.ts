import type { DeployMode } from '@forum/shared';
import { load as apiLoad } from '$lib/api';
import type { PageLoad } from './$types';

export interface SystemInfo {
  app: {
    product: string;
    version: string;
    build: string | null;
    deploy: DeployMode;
    env: string;
    appUrl: string;
    startedAt: number;
    uptimeSec: number;
    pid: number;
    timezone: string;
    trustProxy: string;
    secureCookies: boolean;
  };
  runtime: {
    node: string;
    platform: string;
    os: string;
    host: string;
    cpus: number;
    cpuModel: string;
    load: number[];
    memTotal: number;
    memFree: number;
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  database: {
    driver: string;
    version: string;
    sizeBytes: number | null;
    path: string | null;
    journal: string | null;
    migrations: { applied: number; pending: number };
    counts: Record<string, number>;
  };
  storage: { dir: string; uploadsBytes: number; uploadsFiles: number; disk: { free: number; total: number } | null };
  services: { mail: string; images: string; worker: boolean; jobs: Record<string, number> };
  checks: Array<{ key: string; label: string; status: 'ok' | 'warn' | 'fail'; detail: string }>;
}

export const load: PageLoad = async ({ fetch, url, parent, depends }) => {
  depends('app:admin-system');
  const { access } = await parent();
  if (!access.elevated) return { system: null };
  return { system: await apiLoad<SystemInfo>(fetch, '/api/admin/system', url) };
};
