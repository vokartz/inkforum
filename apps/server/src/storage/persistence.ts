import { readFileSync } from 'node:fs';
import { posix, resolve, sep } from 'node:path';
import type { StorageWarning } from '@forum/shared';
import type { AppConfig } from '../config/config.js';

export type StorageEphemeralReason = 'anonymous-volume' | 'container-fs';

export interface StoragePersistence {
  ephemeral: boolean;
  reason: StorageEphemeralReason | null;
  volume: string | null;
}

const PERSISTENT: StoragePersistence = { ephemeral: false, reason: null, volume: null };

const unescape = (s: string) => s.replace(/\\([0-7]{3})/g, (_m, o: string) => String.fromCharCode(parseInt(o, 8)));

export function detectStoragePersistence(storageDir: string, mountinfo: string): StoragePersistence {
  const dir = (storageDir.startsWith('/') ? posix.resolve(storageDir) : resolve(storageDir)).replace(/\\/g, '/');
  let best: { mountPoint: string; root: string; fsType: string } | null = null;
  for (const line of mountinfo.split('\n')) {
    const f = line.split(' ');
    if (f.length < 5) continue;
    const root = unescape(f[3]!);
    const mountPoint = unescape(f[4]!).replace(/\\/g, '/');
    const fsType = f[f.indexOf('-', 6) + 1] ?? '';
    const covers = mountPoint === '/' || dir === mountPoint || dir.startsWith(mountPoint + '/');
    if (covers && (!best || mountPoint.length >= best.mountPoint.length)) best = { mountPoint, root, fsType };
  }
  if (!best) return PERSISTENT;
  if ((best.mountPoint === '/' && best.fsType === 'overlay') || best.fsType === 'tmpfs') return { ephemeral: true, reason: 'container-fs', volume: null };
  const m = /\/volumes\/([^/]+)\/_data(?:\/|$)/.exec(best.root);
  if (m && /^[0-9a-f]{64}$/.test(m[1]!)) return { ephemeral: true, reason: 'anonymous-volume', volume: m[1]! };
  return PERSISTENT;
}

let cached: { dir: string; value: StoragePersistence } | null = null;
let mountinfoOverride: string | null = null;

export function overrideMountinfo(text: string | null): void {
  mountinfoOverride = text;
  cached = null;
}

export function storagePersistence(storageDir: string, deploy: string): StoragePersistence {
  if (deploy !== 'docker' || process.env.INKFORUM_STORAGE_CHECK === 'off') return PERSISTENT;
  if (cached?.dir === storageDir) return cached.value;
  let value = PERSISTENT;
  try {
    value = detectStoragePersistence(storageDir, mountinfoOverride ?? readFileSync('/proc/self/mountinfo', 'utf8'));
  } catch {
  }
  cached = { dir: storageDir, value };
  return value;
}

export function storageWarning(config: AppConfig): StorageWarning | null {
  const p = storagePersistence(config.storageDir, config.deploy);
  if (!p.ephemeral || !p.reason) return null;
  const dir = resolve(config.storageDir);
  const dbPath = config.db.driver === 'sqlite' ? resolve(config.db.sqlitePath) : null;
  return {
    reason: p.reason,
    volume: p.volume,
    path: dir,
    database: config.db.driver === 'pglite' || (!!dbPath && (dbPath === dir || dbPath.startsWith(dir + sep))),
    coolify: config.coolify,
  };
}
