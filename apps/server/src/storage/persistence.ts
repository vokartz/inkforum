import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { StorageWarning } from '@forum/shared';
import type { AppConfig } from '../config/config.js';

/**
 * Docker'da depolama klasörünün (veritabanı, yüklemeler, yedekler) kalıcı olup olmadığını anlar.
 * İmaj /app/storage için VOLUME tanımlar; platform (ör. Coolify'da tek imaj) buraya kalıcı bir disk bağlamazsa
 * Docker her kapsayıcı için yeni, isimsiz bir birim açar ve yeniden dağıtımda eski veriler görünmez olur.
 */

export type StorageEphemeralReason = 'anonymous-volume' | 'container-fs';

export interface StoragePersistence {
  ephemeral: boolean;
  reason: StorageEphemeralReason | null;
  /** Kapsayıcı bir isimsiz birimdeyse birimin adı (sunucuda eski verileri bulmak için) */
  volume: string | null;
}

const PERSISTENT: StoragePersistence = { ephemeral: false, reason: null, volume: null };

/** /proc/self/mountinfo satırındaki kaçışlı karakterler (\040 = boşluk) */
const unescape = (s: string) => s.replace(/\\([0-7]{3})/g, (_m, o: string) => String.fromCharCode(parseInt(o, 8)));

export function detectStoragePersistence(storageDir: string, mountinfo: string): StoragePersistence {
  const dir = resolve(storageDir);
  let best: { mountPoint: string; root: string; fsType: string } | null = null;
  for (const line of mountinfo.split('\n')) {
    const f = line.split(' ');
    if (f.length < 5) continue;
    const root = unescape(f[3]!);
    const mountPoint = unescape(f[4]!);
    const fsType = f[f.indexOf('-', 6) + 1] ?? '';
    const covers = mountPoint === '/' || dir === mountPoint || dir.startsWith(mountPoint + sep);
    if (covers && (!best || mountPoint.length >= best.mountPoint.length)) best = { mountPoint, root, fsType };
  }
  if (!best) return PERSISTENT;
  // Kapsayıcının kök dosya sistemi (overlay) ya da bellek (tmpfs): kapsayıcıyla birlikte silinir
  if ((best.mountPoint === '/' && best.fsType === 'overlay') || best.fsType === 'tmpfs') return { ephemeral: true, reason: 'container-fs', volume: null };
  // Docker/Podman birimleri …/volumes/<ad>/_data altındadır; isimsiz birimlerin adı 64 haneli onaltılık sayıdır
  const m = /\/volumes\/([^/]+)\/_data(?:\/|$)/.exec(best.root);
  if (m && /^[0-9a-f]{64}$/.test(m[1]!)) return { ephemeral: true, reason: 'anonymous-volume', volume: m[1]! };
  return PERSISTENT;
}

let cached: { dir: string; value: StoragePersistence } | null = null;
let mountinfoOverride: string | null = null;

/** Testler için: /proc/self/mountinfo yerine verilen içerik kullanılır (null = gerçek dosya) */
export function overrideMountinfo(text: string | null): void {
  mountinfoOverride = text;
  cached = null;
}

/** Yalnızca Docker kurulumlarında denetlenir; INKFORUM_STORAGE_CHECK=off denetimi kapatır */
export function storagePersistence(storageDir: string, deploy: string): StoragePersistence {
  if (deploy !== 'docker' || process.env.INKFORUM_STORAGE_CHECK === 'off') return PERSISTENT;
  if (cached?.dir === storageDir) return cached.value;
  let value = PERSISTENT;
  try {
    value = detectStoragePersistence(storageDir, mountinfoOverride ?? readFileSync('/proc/self/mountinfo', 'utf8'));
  } catch {
    /* mountinfo okunamıyor (Linux dışı): bilinmiyor, uyarı gösterilmez */
  }
  cached = { dir: storageDir, value };
  return value;
}

/** Depolama kalıcı değilse yönetim panelinde ve kurulumda gösterilecek uyarı; kalıcıysa null */
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
