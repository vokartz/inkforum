import { spawn } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import type { AppConfig } from '../config/config.js';
import { extractTarGz } from './tar.js';

export interface RestoreResult {
  ok: boolean;
  name: string;
  at: number;
  message: string;
  safety: string | null;
}

interface Pending {
  file: string;
  name: string;
  kind: 'db' | 'sql' | 'full';
  requestedAt: number;
  safety?: string;
}

export const restoreDir = (config: AppConfig) => join(config.storageDir, 'restore');

type SqliteDb = { exec(sql: string): void; close(): void };
const openSqlite = (path: string): SqliteDb => {
  const mod = (process as unknown as { getBuiltinModule(n: string): { DatabaseSync: new (p: string) => SqliteDb } }).getBuiltinModule('node:sqlite');
  return new mod.DatabaseSync(path);
};

function replaceSqliteFile(config: AppConfig, source: string): void {
  const target = config.db.sqlitePath;
  mkdirSync(join(target, '..'), { recursive: true });
  const tmp = `${target}.restore-tmp`;
  copyFileSync(source, tmp);
  for (const suffix of ['-wal', '-shm', '-journal']) rmSync(`${target}${suffix}`, { force: true });
  renameSync(tmp, target);
}

async function sqliteFromDump(config: AppConfig, dump: string): Promise<void> {
  const tmp = `${config.db.sqlitePath}.restore-new`;
  rmSync(tmp, { force: true });
  const db = openSqlite(tmp);
  try {
    let stmt = '';
    let inQuote = false;
    for await (const chunk of createReadStream(dump).pipe(createGunzip())) {
      const text = (chunk as Buffer).toString('utf8');
      let start = 0;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === "'") inQuote = !inQuote;
        else if (ch === ';' && !inQuote) {
          stmt += text.slice(start, i + 1);
          start = i + 1;
          const s = stmt.trim();
          stmt = '';
          if (s && s !== ';') db.exec(s);
        }
      }
      stmt += text.slice(start);
    }
    if (stmt.trim()) db.exec(stmt);
  } finally {
    db.close();
  }
  replaceSqliteFile(config, tmp);
  rmSync(tmp, { force: true });
}

function run(cmd: string, args: string[], input?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr!.on('data', (c: Buffer) => (err = (err + c.toString()).slice(-3000)));
    child.on('error', (e: NodeJS.ErrnoException) => reject(e.code === 'ENOENT' ? new Error(`${cmd} bulunamadı (PostgreSQL istemci araçları gerekli).`) : e));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} başarısız: ${err.trim().split('\n').pop() ?? code}`))));
    if (input !== undefined) child.stdin!.end(input);
  });
}

async function postgresFromDump(config: AppConfig, dump: string): Promise<void> {
  const url = config.db.postgresUrl;
  if (!url) throw new Error('DATABASE_URL ayarlı değil.');
  await run('psql', ['-v', 'ON_ERROR_STOP=1', '--dbname', url, '-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;']);
  await new Promise<void>((resolve, reject) => {
    const child = spawn('psql', ['-v', 'ON_ERROR_STOP=1', '--quiet', '--dbname', url], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (c: Buffer) => (err = (err + c.toString()).slice(-3000)));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`psql başarısız: ${err.trim().split('\n').pop() ?? code}`))));
    createReadStream(dump).pipe(createGunzip()).pipe(child.stdin);
  });
}

async function applyDatabase(config: AppConfig, file: string, kind: 'db' | 'sql'): Promise<void> {
  if (config.db.driver === 'sqlite') {
    if (kind === 'db') replaceSqliteFile(config, file);
    else await sqliteFromDump(config, file);
  } else if (config.db.driver === 'postgres') {
    if (kind === 'db') throw new Error('SQLite yedeği PostgreSQL veritabanına uygulanamaz.');
    await postgresFromDump(config, file);
  } else throw new Error('Bu veritabanı sürücüsünde geri yükleme yapılamaz.');
}

export async function applyPendingRestore(config: AppConfig, log: (m: string) => void = console.log): Promise<RestoreResult | null> {
  const dir = restoreDir(config);
  const pendingFile = join(dir, 'pending.json');
  if (!existsSync(pendingFile)) return null;
  let p: Pending;
  try {
    p = JSON.parse(readFileSync(pendingFile, 'utf8')) as Pending;
  } catch {
    rmSync(pendingFile, { force: true });
    return null;
  }
  rmSync(pendingFile, { force: true });
  log(`[geri yükleme] ${p.name} uygulanıyor…`);
  const result: RestoreResult = { ok: false, name: p.name, at: Date.now(), message: '', safety: p.safety ?? null };
  const work = join(dir, `work-${Date.now()}`);
  try {
    if (!existsSync(p.file)) throw new Error('Yedek dosyası bulunamadı.');
    if (p.kind === 'full') {
      mkdirSync(work, { recursive: true });
      await extractTarGz(p.file, work);
      const manifest = JSON.parse(readFileSync(join(work, 'manifest.json'), 'utf8')) as { driver: string; database: string; uploads?: boolean };
      if (manifest.driver !== config.db.driver) throw new Error(`Yedek ${manifest.driver} veritabanına ait; bu forum ${config.db.driver} kullanıyor.`);
      await applyDatabase(config, join(work, manifest.database), manifest.database.endsWith('.db') ? 'db' : 'sql');
      const uploads = join(work, 'uploads');
      if (existsSync(uploads)) {
        if (existsSync(config.uploadsDir)) renameSync(config.uploadsDir, `${config.uploadsDir}.before-restore-${Date.now()}`);
        renameSync(uploads, config.uploadsDir);
      }
    } else {
      await applyDatabase(config, p.file, p.kind);
    }
    result.ok = true;
    result.message = 'Yedek başarıyla geri yüklendi.';
    log(`[geri yükleme] tamamlandı: ${p.name}`);
  } catch (err) {
    result.message = err instanceof Error ? err.message : String(err);
    log(`[geri yükleme] BAŞARISIZ: ${result.message}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'last.json'), JSON.stringify(result));
  }
  return result;
}
