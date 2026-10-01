import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { sql } from 'kysely';
import { migrations } from '@forum/db';
import { CONFIG, type AppConfig } from '../config/config.js';
import { Db } from '../database/db.service.js';
import { Clock, HOUR } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { requestRestart } from '../common/restart.js';
import { writeTarGz, type TarEntry } from './tar.js';
import { restoreDir, type RestoreResult } from './restore.js';

export type BackupKind = 'db' | 'sql' | 'full';

export interface BackupFile {
  name: string;
  size: number;
  createdAt: number;
  label: string;
  kind: BackupKind;
}

const NAME_RE = /^inkforum-\d{8}-\d{6}-[a-z0-9-]{1,40}\.(db|sql\.gz|tar\.gz)$/;
const kindOf = (name: string): BackupKind => (name.endsWith('.tar.gz') ? 'full' : name.endsWith('.sql.gz') ? 'sql' : 'db');

/**
 * Yedekler (storage/backups):
 *  - db   : SQLite anlık kopyası (VACUUM INTO) / PostgreSQL pg_dump (sıkıştırılmış SQL)
 *  - sql  : SQL dökümü (SQLite için taşınabilir metin; PostgreSQL'de pg_dump)
 *  - full : veritabanı + yüklenen dosyalar + bilgi dosyası (.tar.gz)
 * Geri yükleme uygulama yeniden başlarken, veritabanı açılmadan önce yapılır (bkz. restore.ts).
 */
@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger('Yedek');
  private running = false;

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    // Her saat bakılır: otomatik yedek açıksa, seçilen saatte ve o gün henüz alınmadıysa yedek alınır
    this.jobs.schedule('backups.tick', HOUR, async () => {
      if (!this.settings.get('maintenance.autoBackup') || !this.supported().ok) return;
      const now = new Date(this.clock.now());
      if (now.getHours() !== this.settings.get('maintenance.backupHour')) return;
      const today = this.stamp(this.clock.now()).slice(0, 8);
      if (this.list().some((b) => b.label === 'daily' && b.name.startsWith(`inkforum-${today}`))) return;
      await this.create(this.settings.get('maintenance.backupKind'), 'daily');
      this.prune(this.settings.get('maintenance.backupKeep'));
    });
  }

  get dir(): string {
    return join(this.config.storageDir, 'backups');
  }

  supported(): { ok: boolean; reason: string | null } {
    if (this.config.db.driver === 'sqlite') return this.config.db.sqlitePath === ':memory:' ? { ok: false, reason: 'Bellek içi veritabanı yedeklenemez.' } : { ok: true, reason: null };
    if (this.config.db.driver === 'postgres') return { ok: true, reason: null };
    return { ok: false, reason: 'Bu veritabanı sürücüsü için yedekleme yok.' };
  }

  list(): BackupFile[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((n) => NAME_RE.test(n))
      .map((name) => {
        const st = statSync(join(this.dir, name));
        const label = name.replace(/^inkforum-\d{8}-\d{6}-/, '').replace(/\.(db|sql\.gz|tar\.gz)$/, '');
        return { name, size: st.size, createdAt: st.mtimeMs, label, kind: kindOf(name) };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** İndirme / silme için güvenli yol (yalnızca yedek adı kalıbına uyan dosyalar) */
  resolve(name: string): string {
    if (!NAME_RE.test(name)) throw Errors.notFound();
    const file = join(this.dir, name);
    if (!existsSync(file)) throw Errors.notFound();
    return file;
  }

  remove(name: string): void {
    unlinkSync(this.resolve(name));
  }

  /** Eski yedekleri temizler: etiket başına en yeni `keep` tanesi kalır (yüklenen yedekler hariç) */
  prune(keep: number): number {
    const byLabel = new Map<string, BackupFile[]>();
    for (const b of this.list()) if (b.label !== 'uploaded') byLabel.set(b.label, [...(byLabel.get(b.label) ?? []), b]);
    let removed = 0;
    for (const files of byLabel.values()) {
      for (const f of files.slice(keep)) {
        try {
          unlinkSync(join(this.dir, f.name));
          removed++;
        } catch {
          /* yok say */
        }
      }
    }
    return removed;
  }

  private stamp(ms: number): string {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  }

  private fileName(label: string, ext: string): string {
    const safe = label.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'manual';
    let name = `inkforum-${this.stamp(this.clock.now())}-${safe}.${ext}`;
    // Aynı saniyede ikinci yedek: bir saniye ileri kaydır
    for (let i = 1; existsSync(join(this.dir, name)); i++) name = `inkforum-${this.stamp(this.clock.now() + i * 1000)}-${safe}.${ext}`;
    return name;
  }

  async create(kind: BackupKind = 'db', label = 'manual'): Promise<BackupFile> {
    const support = this.supported();
    if (!support.ok) throw Errors.badRequest(support.reason ?? 'Yedekleme desteklenmiyor.');
    if (this.running) throw Errors.conflict('Şu anda başka bir yedekleme sürüyor.');
    this.running = true;
    const started = Date.now();
    try {
      mkdirSync(this.dir, { recursive: true });
      const sqlite = this.config.db.driver === 'sqlite';
      let name: string;
      if (kind === 'full') {
        name = this.fileName(label, 'tar.gz');
        await this.createFull(join(this.dir, name));
      } else if (kind === 'sql' || !sqlite) {
        name = this.fileName(label, 'sql.gz');
        if (sqlite) await this.sqliteDump(join(this.dir, name));
        else await this.pgDump(join(this.dir, name));
      } else {
        name = this.fileName(label, 'db');
        await sql`VACUUM INTO ${join(this.dir, name)}`.execute(this.db.q);
      }
      const st = statSync(join(this.dir, name));
      this.logger.log(`Yedek alındı: ${name} (${Math.round(st.size / 1024)} KB, ${Date.now() - started} ms)`);
      return { name, size: st.size, createdAt: st.mtimeMs, label, kind: kindOf(name) };
    } finally {
      this.running = false;
    }
  }

  /** Veritabanı + yüklenen dosyalar */
  private async createFull(target: string): Promise<void> {
    const tmp = join(this.dir, `.work-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    try {
      const sqlite = this.config.db.driver === 'sqlite';
      const dbFile = join(tmp, sqlite ? 'database.db' : 'database.sql.gz');
      if (sqlite) await sql`VACUUM INTO ${dbFile}`.execute(this.db.q);
      else await this.pgDump(dbFile);
      const manifest = {
        product: 'InkForum',
        version: this.config.version,
        driver: this.config.db.driver,
        createdAt: this.clock.now(),
        database: sqlite ? 'database.db' : 'database.sql.gz',
        uploads: true,
      };
      const uploads = this.config.uploadsDir;
      const now = this.clock.now();
      async function* entries(): AsyncGenerator<TarEntry> {
        const m = Buffer.from(JSON.stringify(manifest, null, 2));
        yield { name: 'manifest.json', data: m, size: m.length, mtime: now };
        const st = statSync(dbFile);
        yield { name: manifest.database, file: dbFile, size: st.size, mtime: st.mtimeMs };
        const walk = function* (dir: string): Generator<string> {
          if (!existsSync(dir)) return;
          for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, e.name);
            if (e.isDirectory()) yield* walk(p);
            else if (e.isFile()) yield p;
          }
        };
        for (const f of walk(uploads)) {
          const s = statSync(f);
          yield { name: `uploads/${relative(uploads, f).split('\\').join('/')}`, file: f, size: s.size, mtime: s.mtimeMs };
        }
      }
      await writeTarGz(target, entries());
    } catch (err) {
      rmSync(target, { force: true });
      throw err;
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  /** SQLite için taşınabilir SQL dökümü (şema + veriler), satır satır sıkıştırılarak yazılır */
  private async sqliteDump(target: string): Promise<void> {
    const q = this.db.q;
    const objects = await sql<{ type: string; name: string; tbl_name: string; sql: string | null }>`
      select type, name, tbl_name, sql from sqlite_master
      where sql is not null and name not like 'sqlite_%' order by case type when 'table' then 0 when 'index' then 1 else 2 end, name`.execute(q);
    const tables = objects.rows.filter((o) => o.type === 'table');
    const quote = (v: unknown): string => {
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number' || typeof v === 'bigint') return String(v);
      if (v instanceof Uint8Array) return `X'${Buffer.from(v).toString('hex')}'`;
      return `'${String(v).replace(/'/g, "''")}'`;
    };
    const version = this.config.version;
    async function* lines(): AsyncGenerator<string> {
      yield `-- InkForum ${version} SQL dökümü (SQLite) · ${new Date().toISOString()}\n`;
      yield 'PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n';
      for (const t of tables) yield `${t.sql};\n`;
      for (const t of tables) {
        const name = t.name.replace(/"/g, '""');
        let offset = 0;
        for (;;) {
          const rows = await sql<Record<string, unknown>>`select * from ${sql.raw(`"${name}"`)} limit 2000 offset ${offset}`.execute(q);
          if (!rows.rows.length) break;
          for (const r of rows.rows) {
            const cols = Object.keys(r);
            yield `INSERT INTO "${name}" (${cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')}) VALUES (${cols.map((c) => quote(r[c])).join(',')});\n`;
          }
          offset += rows.rows.length;
        }
      }
      for (const o of objects.rows) if (o.type !== 'table') yield `${o.sql};\n`;
      yield 'COMMIT;\n';
    }
    await pipeline(Readable.from(lines()), createGzip({ level: 6 }), createWriteStream(target));
  }

  private async pgDump(target: string): Promise<void> {
    const url = this.config.db.postgresUrl;
    if (!url) throw Errors.badRequest('DATABASE_URL ayarlı değil.');
    const child = spawn('pg_dump', ['--no-owner', '--no-privileges', '--dbname', url], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c: Buffer) => (stderr = (stderr + c.toString()).slice(-4000)));
    const exit = new Promise<number>((resolve, reject) => {
      child.on('error', (err: NodeJS.ErrnoException) =>
        reject(err.code === 'ENOENT' ? Errors.badRequest('pg_dump bulunamadı. PostgreSQL istemci araçlarını kurun (Docker imajında hazır gelir).') : err),
      );
      child.on('close', (code) => resolve(code ?? 1));
    });
    try {
      await pipeline(child.stdout, createGzip({ level: 6 }), createWriteStream(target));
      const code = await exit;
      if (code !== 0) throw Errors.badRequest(`pg_dump başarısız: ${stderr.trim().split('\n').pop() ?? code}`);
    } catch (err) {
      rmSync(target, { force: true });
      throw err;
    }
  }

  stream(name: string) {
    return createReadStream(this.resolve(name));
  }

  // ---------- Yükleme ve geri yükleme ----------

  /** Yüklenen yedeği doğrular ve listeye ekler */
  async adoptUpload(tmpPath: string, originalName: string): Promise<BackupFile> {
    try {
      const head = Buffer.alloc(16);
      const fd = await import('node:fs/promises').then((m) => m.open(tmpPath, 'r'));
      await fd.read(head, 0, 16, 0);
      await fd.close();
      const isSqlite = head.toString('latin1', 0, 15) === 'SQLite format 3';
      const isGzip = head[0] === 0x1f && head[1] === 0x8b;
      const lower = originalName.toLowerCase();
      let ext: string;
      if (isSqlite) ext = 'db';
      else if (isGzip && /\.(tar\.gz|tgz)$/.test(lower)) ext = 'tar.gz';
      else if (isGzip && /\.sql\.gz$/.test(lower)) ext = 'sql.gz';
      else throw Errors.field('file', 'Desteklenmeyen dosya. InkForum yedeği (.db, .sql.gz ya da .tar.gz) yükleyin.');
      if (ext === 'db') {
        if (this.config.db.driver !== 'sqlite') throw Errors.field('file', 'SQLite yedeği PostgreSQL kullanan bir foruma geri yüklenemez.');
        this.validateSqlite(tmpPath);
      }
      mkdirSync(this.dir, { recursive: true });
      const name = this.fileName('uploaded', ext);
      renameSync(tmpPath, join(this.dir, name));
      const st = statSync(join(this.dir, name));
      return { name, size: st.size, createdAt: st.mtimeMs, label: 'uploaded', kind: kindOf(name) };
    } finally {
      rmSync(tmpPath, { force: true });
    }
  }

  /** SQLite yedeğinin InkForum veritabanı olduğunu ve bu sürümden yeni olmadığını denetler */
  private validateSqlite(file: string): void {
    // node:sqlite dinamik; sürücü olarak zaten kullanılıyor
    const { DatabaseSync } = (process as unknown as { getBuiltinModule(n: string): { DatabaseSync: new (p: string, o?: object) => { prepare(s: string): { all(): Array<Record<string, unknown>> }; close(): void } } }).getBuiltinModule('node:sqlite');
    let db: { prepare(s: string): { all(): Array<Record<string, unknown>> }; close(): void } | null = null;
    try {
      db = new DatabaseSync(file, { readOnly: true });
      const tables = new Set(db.prepare("select name from sqlite_master where type='table'").all().map((r) => String(r.name)));
      if (!tables.has('users') || !tables.has('kysely_migration')) throw Errors.field('file', 'Bu dosya bir InkForum veritabanı değil.');
      const applied = db.prepare('select name from kysely_migration').all().map((r) => String(r.name));
      const known = new Set(Object.keys(migrations));
      const unknown = applied.filter((n) => !known.has(n));
      if (unknown.length) throw Errors.field('file', `Yedek daha yeni bir InkForum sürümüne ait (${unknown[0]}). Önce forumu güncelleyin.`);
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err) throw err;
      throw Errors.field('file', 'Veritabanı dosyası okunamadı ya da bozuk.');
    } finally {
      db?.close();
    }
  }

  /**
   * Geri yüklemeyi planlar: önce mevcut durumun yedeği alınır, ardından uygulama yeniden başlar ve
   * açılışta (veritabanı bağlanmadan önce) yedek uygulanır.
   */
  async scheduleRestore(name: string, actorId: number): Promise<{ safety: string }> {
    const file = this.resolve(name);
    const kind = kindOf(name);
    if (kind === 'db' && this.config.db.driver !== 'sqlite') throw Errors.badRequest('SQLite yedeği PostgreSQL kullanan bir foruma geri yüklenemez.');
    if (kind === 'db') this.validateSqlite(file);
    const safety = await this.create('db', 'pre-restore');
    const dir = restoreDir(this.config);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pending.json'), JSON.stringify({ file, name, kind, requestedAt: this.clock.now(), actorId, safety: safety.name }));
    this.logger.warn(`Geri yükleme planlandı: ${name}. Uygulama yeniden başlatılıyor…`);
    if (!this.config.isTest) requestRestart(this.config.root);
    return { safety: safety.name };
  }

  lastRestore(): RestoreResult | null {
    const f = join(restoreDir(this.config), 'last.json');
    if (!existsSync(f)) return null;
    try {
      return JSON.parse(readFileSync(f, 'utf8')) as RestoreResult;
    } catch {
      return null;
    }
  }

  restorePending(): boolean {
    return existsSync(join(restoreDir(this.config), 'pending.json'));
  }
}
