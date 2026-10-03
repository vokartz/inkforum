/* eslint-disable no-control-regex -- işaretçiler bilerek kontrol karakterleriyle yazılır */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { sql } from 'kysely';
import { canonicalEmail, canonicalName, slugify } from '@forum/shared';
import type { ImportRunStatus, Row } from '@forum/db';
import { CONFIG, type AppConfig } from '../config/config.js';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { StorageService } from '../storage/storage.service.js';
import { safeFetch } from '../security/safe-fetch.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { GroupsService } from '../groups/groups.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { ForumCacheService } from '../forum/forum-cache.service.js';
import { ForumCountersService } from '../forum/forum-counters.service.js';
import { PostRenderService, RENDER_VERSION } from '../forum/post-render.service.js';
import { BansService } from '../bans/bans.service.js';
import { BackupService } from '../maintenance/backup.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { stageDump } from './sql-dump.js';
import { detectPlatform, keepRow, keepTable, Stage, type Stmt } from './stage.js';
import { looksDoubleEncoded, makeText, type SourceCharset } from './text.js';
import { MARK_RE, PLATFORM_NAMES, type Platform, type ReaderContext, type SourceCounts, type SourceReader, type SrcAccess, type SrcAttachment } from './model.js';
import { SmfReader } from './readers/smf.js';
import { PhpbbReader } from './readers/phpbb.js';
import { IpsReader } from './readers/ips.js';
import { MybbReader } from './readers/mybb.js';
import { XenforoReader } from './readers/xenforo.js';

export interface ImportOptions {
  charset: SourceCharset;
  fixMojibake: boolean;
  baseUrl: string;
  clearForum: boolean;
  replaceRanks: boolean;
  include: { polls: boolean; conversations: boolean; bans: boolean };
  files: { avatars: boolean; groupIcons: boolean; attachmentImages: boolean };
}

export interface ImportAnalysis {
  platform: Platform;
  platformName: string;
  version: string;
  prefix: string;
  counts: SourceCounts;
  baseUrl: string | null;
  charset: SourceCharset;
  mojibake: boolean;
  tables: number;
  rows: number;
}

export interface ImportProgress {
  phase: string;
  done: number;
  total: number;
}

export type ImportStats = Record<string, number>;

interface LogLine {
  t: number;
  level: 'info' | 'warn' | 'error';
  msg: string;
}

interface ActiveRun {
  id: number;
  progress: ImportProgress;
  log: LogLine[];
  stats: ImportStats;
  cancel: boolean;
}

const BATCH = 500;
const MAX_LOG = 400;
const FETCH_TIMEOUT = 15_000;

export const DEFAULT_OPTIONS: Omit<ImportOptions, 'charset' | 'fixMojibake' | 'baseUrl'> = {
  clearForum: true,
  replaceRanks: true,
  include: { polls: true, conversations: true, bans: true },
  files: { avatars: true, groupIcons: true, attachmentImages: true },
};

class Cancelled extends Error {}

@Injectable()
export class ImportService implements OnModuleInit {
  private readonly logger = new Logger('Import');
  private active: ActiveRun | null = null;

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly storage: StorageService,
    private readonly groupCache: GroupCacheService,
    private readonly groups: GroupsService,
    private readonly permissions: PermissionsService,
    private readonly forumCache: ForumCacheService,
    private readonly counters: ForumCountersService,
    private readonly render: PostRenderService,
    private readonly bans: BansService,
    private readonly backups: BackupService,
    private readonly settings: SettingsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.db.q
        .updateTable('import_runs')
        .set({ status: 'failed', error: 'Sunucu yeniden başlatıldığı için işlem yarıda kaldı.', finished_at: this.clock.now() })
        .where('status', 'in', ['staging', 'running'])
        .execute();
    } catch {
    }
  }

  get dir(): string {
    return join(this.config.storageDir, 'import');
  }

  incomingDir(): string {
    const d = join(this.dir, '.incoming');
    mkdirSync(d, { recursive: true });
    return d;
  }

  private runDir(id: number): string {
    return join(this.dir, `run-${id}`);
  }

  private stagePath(id: number): string {
    return join(this.runDir(id), 'stage.db');
  }

  async list(): Promise<Array<ReturnType<ImportService['dto']>>> {
    const rows = await this.db.q.selectFrom('import_runs').selectAll().orderBy('id', 'desc').limit(20).execute();
    return rows.map((r) => this.dto(r));
  }

  async get(id: number): Promise<ReturnType<ImportService['dto']>> {
    return this.dto(await this.require(id));
  }

  private async require(id: number): Promise<Row<'import_runs'>> {
    const row = await this.db.q.selectFrom('import_runs').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) throw Errors.notFound('İçe aktarma kaydı bulunamadı.');
    return row;
  }

  dto(r: Row<'import_runs'>) {
    const live = this.active?.id === r.id ? this.active : null;
    return {
      id: r.id,
      platform: r.platform,
      platformName: r.platform ? PLATFORM_NAMES[r.platform as Platform] : '',
      version: r.version,
      sourceName: r.source_name,
      sourceSize: r.source_size,
      status: r.status as ImportRunStatus,
      options: JSON.parse(r.options_json) as Partial<ImportOptions>,
      analysis: JSON.parse(r.analysis_json) as Partial<ImportAnalysis>,
      stats: live ? live.stats : (JSON.parse(r.stats_json) as ImportStats),
      log: live ? live.log : (JSON.parse(r.log_json) as LogLine[]),
      progress: live?.progress ?? null,
      error: r.error,
      createdAt: r.created_at,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    };
  }

  async adoptUpload(tmpPath: string, originalName: string, size: number, userId: number): Promise<number> {
    if (this.busy()) {
      rmSync(tmpPath, { force: true });
      throw Errors.conflict('Şu anda başka bir içe aktarma işlemi sürüyor.');
    }
    const name = originalName.replace(/[^\w.-]+/g, '_').slice(-120) || 'dump.sql';
    if (!/\.sql(\.gz)?$/i.test(name)) {
      rmSync(tmpPath, { force: true });
      throw Errors.field('file', 'Yalnızca .sql veya .sql.gz dosyaları yüklenebilir.');
    }
    const row = await this.db.q
      .insertInto('import_runs')
      .values({ source_name: name, source_size: size, status: 'staging', created_by: userId, created_at: this.clock.now() })
      .returning('id')
      .executeTakeFirstOrThrow();
    const dir = this.runDir(row.id);
    mkdirSync(dir, { recursive: true });
    const target = join(dir, /\.gz$/i.test(name) ? 'source.sql.gz' : 'source.sql');
    renameSync(tmpPath, target);
    this.active = { id: row.id, progress: { phase: 'staging', done: 0, total: size }, log: [], stats: {}, cancel: false };
    void this.stageRun(row.id, target);
    return row.id;
  }

  busy(): boolean {
    return !!this.active;
  }

  private async stageRun(id: number, file: string): Promise<void> {
    const run = this.active!;
    try {
      this.log(run, 'info', 'Döküm dosyası okunuyor…');
      const result = await stageDump(file, this.stagePath(id), keepTable, (p) => (run.progress = { phase: 'staging', done: p.rows, total: 0 }), keepRow);
      const stage = new Stage(this.stagePath(id));
      try {
        const det = detectPlatform(stage);
        if (!det) throw new Error('Döküm tanınamadı. SMF 2.x, phpBB 3.x, Invision Community 4/5 veya MyBB 1.8 veritabanı dökümü yükleyin.');
        const probe = this.reader(det.platform, stage, det.prefix, { charset: 'utf8', fixMojibake: false, baseUrl: '' });
        const charset = this.guessCharset(det.platform, stage, det.prefix);
        const text = makeText(charset, false);
        const mojibake = probe.samples().some((v) => looksDoubleEncoded(text(v)));
        const analysis: ImportAnalysis = {
          platform: det.platform,
          platformName: PLATFORM_NAMES[det.platform],
          version: probe.version(),
          prefix: det.prefix,
          counts: probe.counts(),
          baseUrl: probe.guessBaseUrl(),
          charset,
          mojibake,
          tables: Object.keys(result.tables).length,
          rows: Object.values(result.tables).reduce((a, b) => a + b, 0),
        };
        this.log(run, 'info', `${analysis.platformName} ${analysis.version} bulundu: ${analysis.counts.users} üye, ${analysis.counts.topics} konu, ${analysis.counts.posts} mesaj.`);
        await this.db.q
          .updateTable('import_runs')
          .set({ platform: det.platform, version: analysis.version, status: 'ready', analysis_json: JSON.stringify(analysis), log_json: JSON.stringify(run.log) })
          .where('id', '=', id)
          .execute();
      } finally {
        stage.close();
      }
      rmSync(file, { force: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(run, 'error', msg);
      await this.db.q
        .updateTable('import_runs')
        .set({ status: 'failed', error: msg, finished_at: this.clock.now(), log_json: JSON.stringify(run.log) })
        .where('id', '=', id)
        .execute();
    } finally {
      this.active = null;
    }
  }

  private guessCharset(platform: Platform, stage: Stage, prefix: string): SourceCharset {
    if (platform !== 'smf') return 'utf8';
    const row = stage.has(`${prefix}settings`) ? stage.get(`SELECT value FROM "${prefix}settings" WHERE variable = 'global_character_set'`) : undefined;
    const cs = row ? Buffer.from(row.value as Uint8Array).toString('latin1').toLowerCase() : '';
    if (cs.includes('utf')) return 'utf8';
    if (cs.includes('8859-9') || cs.includes('1254')) return 'windows-1254';
    if (cs.includes('8859-1') || cs.includes('1252')) return 'windows-1252';
    return 'utf8';
  }

  private reader(platform: Platform, stage: Stage, prefix: string, opts: Pick<ImportOptions, 'charset' | 'fixMojibake' | 'baseUrl'>): SourceReader {
    const ctx: ReaderContext = { text: makeText(opts.charset, opts.fixMojibake), baseUrl: opts.baseUrl.replace(/\/+$/, ''), charset: opts.charset };
    switch (platform) {
      case 'smf':
        return new SmfReader(stage, prefix, ctx);
      case 'phpbb':
        return new PhpbbReader(stage, prefix, ctx);
      case 'ips':
        return new IpsReader(stage, prefix, ctx);
      case 'mybb':
        return new MybbReader(stage, prefix, ctx);
      case 'xenforo':
        return new XenforoReader(stage, prefix, ctx);
    }
  }

  async preview(id: number, charset: SourceCharset, fixMojibake: boolean): Promise<string[]> {
    const run = await this.require(id);
    if (run.status !== 'ready') throw Errors.badRequest('Önizleme yalnızca analiz tamamlandıktan sonra yapılabilir.');
    const analysis = JSON.parse(run.analysis_json) as ImportAnalysis;
    const stage = new Stage(this.stagePath(id));
    try {
      const reader = this.reader(analysis.platform, stage, analysis.prefix, { charset, fixMojibake, baseUrl: '' });
      const text = makeText(charset, fixMojibake);
      return reader
        .samples()
        .map((v) => text(v).trim())
        .filter((v, i, all) => v && all.indexOf(v) === i);
    } finally {
      stage.close();
    }
  }

  async remove(id: number): Promise<void> {
    if (this.active?.id === id) throw Errors.conflict('Çalışan bir işlem silinemez; önce durdurun.');
    await this.require(id);
    rmSync(this.runDir(id), { recursive: true, force: true });
    await this.db.q.deleteFrom('import_runs').where('id', '=', id).execute();
  }

  cancel(id: number): void {
    if (this.active?.id === id) this.active.cancel = true;
  }

  async redirect(kind: string, oldId: string): Promise<number | null> {
    const row = await this.db.q.selectFrom('import_redirects').select('new_id').where('kind', '=', kind).where('old_id', '=', oldId).executeTakeFirst();
    return row?.new_id ?? null;
  }

  cleanupIncoming(): void {
    const dir = join(this.dir, '.incoming');
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) rmSync(join(dir, f), { force: true });
  }

  async start(id: number, options: ImportOptions, actorId: number): Promise<void> {
    if (this.busy()) throw Errors.conflict('Şu anda başka bir içe aktarma işlemi sürüyor.');
    const row = await this.require(id);
    if (row.status !== 'ready') throw Errors.badRequest('Bu döküm aktarmaya hazır değil.');
    if (!existsSync(this.stagePath(id))) throw Errors.badRequest('Ara depo bulunamadı; dökümü yeniden yükleyin.');
    const now = this.clock.now();
    await this.db.q
      .updateTable('import_runs')
      .set({ status: 'running', options_json: JSON.stringify(options), started_at: now, error: null })
      .where('id', '=', id)
      .execute();
    this.active = { id, progress: { phase: 'prepare', done: 0, total: 0 }, log: [], stats: {}, cancel: false };
    void this.execute(id, JSON.parse(row.analysis_json) as ImportAnalysis, options, actorId);
  }

  private log(run: ActiveRun, level: LogLine['level'], msg: string): void {
    run.log.push({ t: this.clock.now(), level, msg });
    if (run.log.length > MAX_LOG) run.log.splice(0, run.log.length - MAX_LOG);
    if (level === 'error') this.logger.error(msg);
  }

  private async persist(run: ActiveRun): Promise<void> {
    await this.db.q
      .updateTable('import_runs')
      .set({ stats_json: JSON.stringify(run.stats), log_json: JSON.stringify(run.log) })
      .where('id', '=', run.id)
      .execute();
  }

  private phase(run: ActiveRun, phase: string, total: number): void {
    if (run.cancel) throw new Cancelled('İşlem durduruldu.');
    run.progress = { phase, done: 0, total };
  }

  private tick(run: ActiveRun, n = 1): void {
    run.progress.done += n;
  }

  private stat(run: ActiveRun, key: string, n = 1): void {
    run.stats[key] = (run.stats[key] ?? 0) + n;
  }

  private async execute(id: number, analysis: ImportAnalysis, options: ImportOptions, actorId: number): Promise<void> {
    const run = this.active!;
    const stage = new Stage(this.stagePath(id));
    let status: ImportRunStatus = 'done';
    let error: string | null = null;
    try {
      stage.db.exec('CREATE TABLE IF NOT EXISTS _map (kind TEXT NOT NULL, src TEXT NOT NULL, id INTEGER NOT NULL, PRIMARY KEY (kind, src)); DELETE FROM _map;');
      const reader = this.reader(analysis.platform, stage, analysis.prefix, options);
      const job = new ImportJob(this, run, stage, reader, options, actorId, id);
      await job.run();
      this.log(run, 'info', 'İçe aktarma tamamlandı.');
    } catch (err) {
      if (err instanceof Cancelled) {
        status = 'cancelled';
        error = err.message;
        this.log(run, 'warn', err.message);
      } else {
        status = 'failed';
        error = err instanceof Error ? err.message : String(err);
        this.log(run, 'error', `Hata: ${error}`);
        this.logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
      }
    } finally {
      stage.close();
      await this.db.q
        .updateTable('import_runs')
        .set({ status, error, finished_at: this.clock.now(), stats_json: JSON.stringify(run.stats), log_json: JSON.stringify(run.log) })
        .where('id', '=', id)
        .execute();
      this.active = null;
      await this.forumCache.invalidate();
      await this.groupCache.invalidate();
      await this.permissions.invalidate();
    }
  }

  get deps() {
    return {
      db: this.db,
      clock: this.clock,
      storage: this.storage,
      groupCache: this.groupCache,
      groups: this.groups,
      permissions: this.permissions,
      counters: this.counters,
      render: this.render,
      bans: this.bans,
      backups: this.backups,
      settings: this.settings,
      log: (run: ActiveRun, level: LogLine['level'], msg: string) => this.log(run, level, msg),
      persist: (run: ActiveRun) => this.persist(run),
      phase: (run: ActiveRun, phase: string, total: number) => this.phase(run, phase, total),
      tick: (run: ActiveRun, n?: number) => this.tick(run, n),
      stat: (run: ActiveRun, key: string, n?: number) => this.stat(run, key, n),
    };
  }
}

type Deps = ImportService['deps'];

class ImportJob {
  private readonly d: Deps;
  private readonly users = new Map<string, { id: number; name: string }>();
  private readonly topics = new Map<string, { id: number; board: number }>();
  private readonly boardMap = new Map<string, number>();
  private readonly groupMap = new Map<string, number | null>();
  private sys!: Record<'admin' | 'global_moderator' | 'moderator' | 'member' | 'guest', number>;
  private fallbackCategory: number | null = null;
  private fallbackBoard: number | null = null;
  private mapInsert!: Stmt;
  private mapGet!: Stmt;
  private firstTopicId = 0;
  private firstUserId = 0;
  private readonly mergedUsers = new Set<number>();
  private readonly avatars: Array<{ userId: number; url: string }> = [];
  private downloadFailures = 0;

  constructor(
    svc: ImportService,
    private readonly state: ActiveRun,
    private readonly stage: Stage,
    private readonly reader: SourceReader,
    private readonly opts: ImportOptions,
    private readonly actorId: number,
    private readonly runId: number,
  ) {
    this.d = svc.deps;
  }

  private get q() {
    return this.d.db.q;
  }

  private now(): number {
    return this.d.clock.now();
  }

  private info(msg: string): void {
    this.d.log(this.state, 'info', msg);
  }

  private warn(msg: string): void {
    this.d.log(this.state, 'warn', msg);
  }

  async run(): Promise<void> {
    this.mapInsert = this.stage.db.prepare('INSERT OR REPLACE INTO _map (kind, src, id) VALUES (?, ?, ?)');
    this.mapGet = this.stage.db.prepare('SELECT id FROM _map WHERE kind = ? AND src = ?');
    this.sys = {
      admin: (await this.d.groupCache.bySystemKey('admin')).id,
      global_moderator: (await this.d.groupCache.bySystemKey('global_moderator')).id,
      moderator: (await this.d.groupCache.bySystemKey('moderator')).id,
      member: (await this.d.groupCache.bySystemKey('member')).id,
      guest: (await this.d.groupCache.bySystemKey('guest')).id,
    };

    await this.backup();
    if (this.opts.clearForum) await this.clearForum();
    await this.importGroups();
    await this.importUsers();
    await this.importStructure();
    await this.importTopics();
    await this.importPosts();
    if (this.opts.include.polls) await this.importPolls();
    if (this.opts.include.conversations) await this.importConversations();
    if (this.opts.include.bans) await this.importBans();
    await this.recount();
    if (this.opts.files.avatars) await this.downloadAvatars();
    if (this.downloadFailures) this.warn(`${this.downloadFailures} dosya indirilemedi; eski adresleriyle bağlantı olarak bırakıldı.`);
  }

  private async backup(): Promise<void> {
    this.d.phase(this.state, 'backup', 1);
    if (!this.d.backups.supported().ok) {
      this.warn('Otomatik yedek alınamadı (bu kurulumda yedekleme desteklenmiyor).');
      return;
    }
    try {
      const file = await this.d.backups.create('db', 'pre-import');
      this.info(`Aktarma öncesi yedek alındı: ${file.name}`);
    } catch (err) {
      this.warn(`Aktarma öncesi yedek alınamadı: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async clearForum(): Promise<void> {
    this.d.phase(this.state, 'clear', 1);
    await this.d.db.tx(async () => {
      for (const table of [
        'poll_votes',
        'poll_options',
        'polls',
        'topic_tags',
        'topic_subscriptions',
        'topic_reads',
        'topic_viewers',
        'post_reactions',
        'post_revisions',
        'posts',
        'topics',
        'board_reads',
        'board_moderators',
        'boards',
        'forum_categories',
      ] as const) {
        await this.q.deleteFrom(table).execute();
      }
      await this.q.updateTable('users').set({ post_count: 0 }).execute();
    });
    this.info('Mevcut kategoriler, bölümler ve konular temizlendi.');
  }

  private async download(url: string, maxBytes: number): Promise<Buffer | null> {
    if (!/^https?:\/\//i.test(url)) return null;
    try {
      const res = await safeFetch(url, { timeoutMs: FETCH_TIMEOUT, maxBytes: maxBytes + 1, headers: { 'User-Agent': 'InkForum-Importer/1.0' } });
      if (res.status !== 200 || res.body.length > maxBytes || !/^image\//i.test(res.contentType)) {
        this.downloadFailures++;
        return null;
      }
      return res.body;
    } catch {
      this.downloadFailures++;
      return null;
    }
  }

  private color(v: string | null): string | null {
    if (!v) return null;
    const s = v.trim().toLowerCase();
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(s)) return s;
    if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`;
    return /^[a-z]{3,20}$/.test(s) ? s : null;
  }

  private async importGroups(): Promise<void> {
    const groups = this.reader.groups();
    this.d.phase(this.state, 'groups', groups.length);
    const hasRanks = groups.some((g) => g.minPosts !== null);
    if (hasRanks && this.opts.replaceRanks) {
      const old = await this.q.selectFrom('member_groups').select('id').where('kind', '=', 'post_count').where('system_key', 'is', null).execute();
      if (old.length) {
        const ids = old.map((g) => g.id);
        await this.q.updateTable('users').set({ post_group_id: null }).where('post_group_id', 'in', ids).execute();
        await this.q.deleteFrom('group_members').where('group_id', 'in', ids).execute();
        await this.q.deleteFrom('member_groups').where('id', 'in', ids).execute();
        this.info(`${old.length} varsayılan rütbe grubu kaldırıldı; kaynak forumun rütbeleri kullanılacak.`);
      }
    }
    const existing = await this.q.selectFrom('member_groups').select(['id', 'name', 'icon_file_id', 'color']).execute();
    const byName = new Map(existing.map((g) => [g.name.toLocaleLowerCase('tr'), g]));
    let sort = 100;
    for (const g of groups) {
      this.d.tick(this.state);
      let id: number | null;
      if (g.role === 'member' || g.role === 'guest') {
        this.groupMap.set(g.id, null);
        continue;
      }
      if (g.role !== 'custom') id = this.sys[g.role];
      else {
        const found = byName.get(g.name.toLocaleLowerCase('tr'));
        if (found) id = found.id;
        else {
          const now = this.now();
          const row = await this.q
            .insertInto('member_groups')
            .values({
              system_key: null,
              name: g.name.slice(0, 80) || `Grup ${g.id}`,
              description: g.description.slice(0, 500),
              color: this.color(g.color),
              icon_count: g.iconCount,
              kind: g.minPosts !== null ? 'post_count' : 'regular',
              min_posts: g.minPosts,
              join_type: 'closed',
              is_protected: 0,
              visibility: g.hidden ? 'hidden' : 'visible',
              parent_id: null,
              require_2fa: 0,
              sort_order: sort++,
              created_at: now,
              updated_at: now,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          id = row.id;
          this.d.stat(this.state, 'groups');
        }
      }
      this.groupMap.set(g.id, id);
      const current = existing.find((e) => e.id === id);
      if (g.iconUrl && this.opts.files.groupIcons && !current?.icon_file_id) {
        const buf = await this.download(g.iconUrl, 1024 * 1024);
        if (buf) {
          try {
            const saved = await this.d.storage.saveImage(buf, { purpose: 'group_icon', ownerUserId: null, maxBytes: 1024 * 1024, maxDimension: 1600, allowGif: true });
            await this.q.updateTable('member_groups').set({ icon_file_id: saved.id, icon_count: g.iconCount }).where('id', '=', id).execute();
            this.d.stat(this.state, 'groupIcons');
          } catch {
            this.downloadFailures++;
          }
        }
      }
      if (current && !current.color && this.color(g.color)) await this.q.updateTable('member_groups').set({ color: this.color(g.color) }).where('id', '=', id).execute();
    }
    await this.d.groupCache.invalidate();
    this.info(`${this.state.stats.groups ?? 0} grup/rütbe oluşturuldu, ${this.state.stats.groupIcons ?? 0} rütbe görseli indirildi.`);
  }

  private async importUsers(): Promise<void> {
    this.d.phase(this.state, 'users', this.reader.counts().users);
    const taken = new Set<string>();
    const emails = new Map<string, number>();
    for (const u of await this.q.selectFrom('users').select(['id', 'username_canonical', 'display_name_canonical', 'email_canonical']).execute()) {
      taken.add(u.username_canonical);
      taken.add(u.display_name_canonical);
      emails.set(u.email_canonical, u.id);
    }
    const unique = (name: string, fallback: string): string => {
      let base = name.trim().replace(/\s+/g, ' ').slice(0, 40) || fallback;
      if (!canonicalName(base)) base = fallback;
      let candidate = base;
      for (let i = 2; taken.has(canonicalName(candidate)); i++) candidate = `${base.slice(0, 36)}_${i}`;
      taken.add(canonicalName(candidate));
      return candidate;
    };
    const now = this.now();
    let batch: Array<() => Promise<void>> = [];
    const flush = async () => {
      if (!batch.length) return;
      const jobs = batch;
      batch = [];
      await this.d.db.tx(async () => {
        for (const j of jobs) await j();
      });
      await this.d.persist(this.state);
    };

    for (const u of this.reader.users()) {
      this.d.tick(this.state);
      const emailCanon = u.email.includes('@') ? canonicalEmail(u.email) : '';
      const existing = emailCanon ? emails.get(emailCanon) : undefined;
      if (existing) {
        const row = await this.q.selectFrom('users').select('display_name').where('id', '=', existing).executeTakeFirstOrThrow();
        this.users.set(u.id, { id: existing, name: row.display_name });
        this.mergedUsers.add(existing);
        this.d.stat(this.state, 'usersMerged');
        continue;
      }
      const username = unique(u.username, `uye${u.id}`);
      const displayName = canonicalName(u.displayName) === canonicalName(username) ? username : unique(u.displayName, username);
      const email = emailCanon ? u.email.trim() : `imported-${u.id}@example.invalid`;
      if (emailCanon) emails.set(emailCanon, -1);
      const primary = u.primaryGroup !== null ? (this.groupMap.get(u.primaryGroup) ?? null) : null;
      const extra = [...new Set(u.groups.map((g) => this.groupMap.get(g)).filter((g): g is number => typeof g === 'number' && g !== primary))];
      const src = u;
      batch.push(async () => {
        const row = await this.q
          .insertInto('users')
          .values({
            username,
            username_canonical: canonicalName(username),
            display_name: displayName,
            display_name_canonical: canonicalName(displayName),
            email,
            email_canonical: canonicalEmail(email),
            password_hash: src.passwordHash || '!',
            must_change_password: 0,
            email_verified_at: src.status === 'active' && emailCanon ? src.registeredAt : null,
            status: src.status,
            primary_group_id: primary,
            post_group_id: null,
            post_count: src.postCount,
            locale: '',
            custom_title: src.customTitle?.slice(0, 80) || null,
            registered_at: src.registeredAt,
            registered_ip: src.ip,
            last_login_at: src.lastActiveAt,
            last_active_at: src.lastActiveAt,
            last_ip: src.ip,
            created_at: src.registeredAt,
            updated_at: now,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        if (!this.firstUserId) this.firstUserId = row.id;
        this.users.set(src.id, { id: row.id, name: displayName });
        await this.q
          .insertInto('user_profiles')
          .values({
            user_id: row.id,
            signature: src.signature.slice(0, 5000),
            birthdate: src.birthdate,
            birth_md: src.birthdate ? src.birthdate.slice(5) : null,
            location: src.location.slice(0, 100),
            website_url: /^https?:\/\//i.test(src.website) ? src.website.slice(0, 300) : '',
            updated_at: now,
          })
          .execute();
        if (extra.length) {
          await this.q
            .insertInto('group_members')
            .values(extra.map((g) => ({ user_id: row.id, group_id: g, source: 'manual' as const, added_by: this.actorId, added_at: now, expires_at: null })))
            .execute();
        }
        if (src.bannedUntil !== null) this.bannedUsers.push({ userId: row.id, until: src.bannedUntil, reason: src.banReason ?? '' });
        if (src.avatarUrl && this.opts.files.avatars) this.avatars.push({ userId: row.id, url: src.avatarUrl });
        await this.q
          .insertInto('import_redirects')
          .values({ kind: 'user', old_id: src.id, new_id: row.id, run_id: this.runId })
          .onConflict((oc) => oc.columns(['kind', 'old_id']).doUpdateSet({ new_id: row.id, run_id: this.runId }))
          .execute();
        this.d.stat(this.state, 'users');
      });
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    this.info(`${this.state.stats.users ?? 0} üye aktarıldı${this.state.stats.usersMerged ? `, ${this.state.stats.usersMerged} üye mevcut hesaplarla eşleştirildi` : ''}.`);
  }

  private readonly bannedUsers: Array<{ userId: number; until: number; reason: string }> = [];

  private readonly profileCache = new Map<string, number>();

  private async accessProfile(access: SrcAccess): Promise<number | null> {
    if (access.kind === 'public') return null;
    const profiles = await this.d.permissions.profiles();
    if (access.kind === 'members') return profiles.find((p) => p.key === 'members_only')?.id ?? null;
    const groupIds =
      access.kind === 'groups'
        ? [...new Set(access.groups.map((g) => this.groupMap.get(g)).filter((g): g is number => typeof g === 'number'))].sort((a, b) => a - b)
        : [];
    const key = access.kind === 'staff' || !groupIds.length ? 'staff' : groupIds.join(',');
    const cached = this.profileCache.get(key);
    if (cached) return cached;
    let name = 'Yalnızca yetkililer';
    if (key !== 'staff') {
      const names = await this.q.selectFrom('member_groups').select('name').where('id', 'in', groupIds).execute();
      name = `Özel erişim: ${names.map((n) => n.name).join(', ')}`.slice(0, 80);
    }
    const existing = profiles.find((p) => p.name === name);
    let id: number;
    if (existing) id = existing.id;
    else {
      const defaultId = await this.d.permissions.defaultProfileId();
      id = await this.d.permissions.createProfile({ name, description: 'İçe aktarılan forumun bölüm erişiminden oluşturuldu.', copyFromId: defaultId });
      const memberRows = await this.q.selectFrom('permission_profile_entries').selectAll().where('profile_id', '=', id).where('group_id', '=', this.sys.member).execute();
      await this.q.deleteFrom('permission_profile_entries').where('profile_id', '=', id).where('group_id', 'in', [this.sys.member, this.sys.guest]).execute();
      for (const g of groupIds) {
        if (!memberRows.length) break;
        await this.q
          .insertInto('permission_profile_entries')
          .values(memberRows.map((r) => ({ profile_id: id, group_id: g, permission: r.permission, value: r.value })))
          .onConflict((oc) => oc.columns(['profile_id', 'group_id', 'permission']).doNothing())
          .execute();
      }
      await this.d.permissions.invalidate();
      this.d.stat(this.state, 'profiles');
    }
    this.profileCache.set(key, id);
    return id;
  }

  private async ensureFallbackCategory(): Promise<number> {
    if (this.fallbackCategory) return this.fallbackCategory;
    const now = this.now();
    const row = await this.q
      .insertInto('forum_categories')
      .values({ name: PLATFORM_NAMES[this.reader.platform], description: '', is_collapsible: 1, sort_order: 999, created_at: now, updated_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    this.fallbackCategory = row.id;
    return row.id;
  }

  private async ensureFallbackBoard(): Promise<number> {
    if (this.fallbackBoard) return this.fallbackBoard;
    const now = this.now();
    const row = await this.q
      .insertInto('boards')
      .values({ category_id: await this.ensureFallbackCategory(), name: 'Arşiv', slug: 'arsiv', description: '', sort_order: 999, created_at: now, updated_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    this.fallbackBoard = row.id;
    this.warn('Bölümü bulunamayan konular "Arşiv" bölümüne alındı.');
    return row.id;
  }

  private async importStructure(): Promise<void> {
    const categories = this.reader.categories();
    const boards = this.reader.boards();
    this.d.phase(this.state, 'boards', categories.length + boards.length);
    const now = this.now();
    const catMap = new Map<string, number>();
    let order = 0;
    for (const c of categories) {
      const row = await this.q
        .insertInto('forum_categories')
        .values({ name: c.name.slice(0, 120) || 'Kategori', description: c.description.slice(0, 500), is_collapsible: 1, sort_order: order++, created_at: now, updated_at: now })
        .returning('id')
        .executeTakeFirstOrThrow();
      catMap.set(c.id, row.id);
      this.d.tick(this.state);
      this.d.stat(this.state, 'categories');
    }
    order = 0;
    for (const b of boards) {
      const category = catMap.get(b.categoryId) ?? (await this.ensureFallbackCategory());
      const row = await this.q
        .insertInto('boards')
        .values({
          category_id: category,
          parent_id: null,
          type: b.redirectUrl ? 'redirect' : 'forum',
          name: b.name.slice(0, 120) || 'Bölüm',
          slug: slugify(b.name).slice(0, 80) || `bolum-${b.id}`,
          description: b.description.slice(0, 1000),
          redirect_url: b.redirectUrl,
          permission_profile_id: await this.accessProfile(b.access),
          count_posts: b.countPosts ? 1 : 0,
          sort_order: order++,
          created_at: now,
          updated_at: now,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      this.boardMap.set(b.id, row.id);
      await this.q
        .insertInto('import_redirects')
        .values({ kind: 'board', old_id: b.id, new_id: row.id, run_id: this.runId })
        .onConflict((oc) => oc.columns(['kind', 'old_id']).doUpdateSet({ new_id: row.id, run_id: this.runId }))
        .execute();
      this.d.tick(this.state);
      this.d.stat(this.state, 'boards');
    }
    for (const b of boards) {
      if (!b.parentId) continue;
      const parent = this.boardMap.get(b.parentId);
      const self = this.boardMap.get(b.id);
      if (parent && self) await this.q.updateTable('boards').set({ parent_id: parent }).where('id', '=', self).execute();
    }
    for (const m of this.reader.moderators()) {
      const board = this.boardMap.get(m.boardId);
      if (!board) continue;
      const userId = m.userId ? this.users.get(m.userId)?.id : undefined;
      const groupId = m.groupId ? this.groupMap.get(m.groupId) : undefined;
      if (!userId && (typeof groupId !== 'number' || Object.values(this.sys).includes(groupId))) continue;
      await this.q
        .insertInto('board_moderators')
        .values({ board_id: board, user_id: userId ?? null, group_id: userId ? null : (groupId as number), created_at: now })
        .execute();
      this.d.stat(this.state, 'moderators');
    }
    this.info(`${this.state.stats.categories ?? 0} kategori, ${this.state.stats.boards ?? 0} bölüm, ${this.state.stats.moderators ?? 0} bölüm moderatörü aktarıldı.`);
  }

  private async importTopics(): Promise<void> {
    this.d.phase(this.state, 'topics', this.reader.counts().topics);
    let batch: Array<() => Promise<void>> = [];
    const flush = async () => {
      if (!batch.length) return;
      const jobs = batch;
      batch = [];
      await this.d.db.tx(async () => {
        for (const j of jobs) await j();
      });
      if (this.state.cancel) throw new Cancelled('İşlem durduruldu.');
    };
    for (const t of this.reader.topics()) {
      this.d.tick(this.state);
      const board = this.boardMap.get(t.boardId) ?? (await this.ensureFallbackBoard());
      const user = t.userId ? this.users.get(t.userId) : undefined;
      const src = t;
      batch.push(async () => {
        const row = await this.q
          .insertInto('topics')
          .values({
            board_id: board,
            title: src.title.slice(0, 200),
            slug: slugify(src.title).slice(0, 80) || 'konu',
            user_id: user?.id ?? null,
            author_name: user?.name ?? (src.authorName || 'Misafir'),
            last_post_at: src.createdAt,
            view_count: src.views,
            is_pinned: src.pinned ? 1 : 0,
            is_locked: src.locked ? 1 : 0,
            is_approved: src.approved ? 1 : 0,
            deleted_at: src.deleted ? src.createdAt : null,
            created_at: src.createdAt,
            updated_at: src.createdAt,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        if (!this.firstTopicId) this.firstTopicId = row.id;
        this.topics.set(src.id, { id: row.id, board });
        await this.q
          .insertInto('import_redirects')
          .values({ kind: 'topic', old_id: src.id, new_id: row.id, run_id: this.runId })
          .onConflict((oc) => oc.columns(['kind', 'old_id']).doUpdateSet({ new_id: row.id, run_id: this.runId }))
          .execute();
        this.d.stat(this.state, 'topics');
      });
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    await this.d.persist(this.state);
    this.info(`${this.state.stats.topics ?? 0} konu aktarıldı.`);
  }

  private async finalizeBody(body: string, attachments: SrcAttachment[], ownerId: number | null): Promise<string> {
    const used = new Set<string>();
    const byId = new Map(attachments.map((a) => [a.id, a]));
    const rendered = new Map<string, string>();
    const renderAttachment = async (a: SrcAttachment): Promise<string> => {
      const hit = rendered.get(a.id);
      if (hit !== undefined) return hit;
      let out: string;
      if (!a.url) out = a.name;
      else if (a.isImage && this.opts.files.attachmentImages) {
        const buf = await this.download(a.url, 8 * 1024 * 1024);
        let local: string | null = null;
        if (buf) {
          try {
            const saved = await this.d.storage.saveImage(buf, { purpose: 'post_image', ownerUserId: ownerId, maxBytes: 8 * 1024 * 1024, maxDimension: 8000 });
            local = this.d.storage.publicUrl(saved);
            this.d.stat(this.state, 'images');
          } catch {
            this.downloadFailures++;
          }
        }
        out = `[img]${local ?? a.url}[/img]`;
      } else out = a.isImage ? `[img]${a.url}[/img]` : `[url=${a.url}]${a.name.replace(/[[\]]/g, '')}[/url]`;
      rendered.set(a.id, out);
      return out;
    };

    const attachIds = [...body.matchAll(MARK_RE)].filter((m) => m[1] === 'a').map((m) => m[2]!);
    for (const id of attachIds) {
      const a = byId.get(id);
      if (a) {
        used.add(id);
        await renderAttachment(a);
      }
    }
    let out = body
      .replace(/\[mention=\u0001u:([^\u0002]+)\u0002\]([\s\S]*?)\[\/mention\]/g, (_m, src: string, name: string) => {
        const u = this.users.get(src);
        return u ? `[mention=${u.id}]${u.name}[/mention]` : `@${name}`;
      })
      .replace(MARK_RE, (m: string, kind: string, id: string) => (kind === 'a' ? (rendered.get(id) ?? '') : kind === 'p' ? m : ''));
    const rest = attachments.filter((a) => !used.has(a.id));
    if (rest.length) {
      const parts: string[] = [];
      for (const a of rest) parts.push(await renderAttachment(a));
      out = `${out}\n\n${parts.join('\n')}`;
    }
    return out.trim() || '…';
  }

  private resolveQuotes(body: string): string {
    return body
      .replace(/ post=\u0001p:([^\u0002]+)\u0002/g, (_m, src: string) => {
        const row = this.mapGet.get('p', src);
        return row ? ` post=${Number(row.id)}` : '';
      })
      .replace(MARK_RE, '');
  }

  private async importPosts(): Promise<void> {
    this.d.phase(this.state, 'posts', this.reader.counts().posts);
    let batch: Array<() => Promise<void>> = [];
    let skipped = 0;
    const flush = async () => {
      if (!batch.length) return;
      const jobs = batch;
      batch = [];
      this.stage.db.exec('BEGIN');
      try {
        await this.d.db.tx(async () => {
          for (const j of jobs) await j();
        });
        this.stage.db.exec('COMMIT');
      } catch (err) {
        this.stage.db.exec('ROLLBACK');
        throw err;
      }
      await this.d.persist(this.state);
      if (this.state.cancel) throw new Cancelled('İşlem durduruldu.');
    };
    for (const p of this.reader.posts()) {
      this.d.tick(this.state);
      const topic = this.topics.get(p.topicId);
      if (!topic) {
        skipped++;
        continue;
      }
      const user = p.userId ? this.users.get(p.userId) : undefined;
      const attachments = this.reader.attachments(p.id);
      const body = await this.finalizeBody(p.body, attachments, user?.id ?? null);
      const src = p;
      batch.push(async () => {
        const text = this.resolveQuotes(body);
        const row = await this.q
          .insertInto('posts')
          .values({
            topic_id: topic.id,
            board_id: topic.board,
            user_id: user?.id ?? null,
            author_name: user?.name ?? (src.authorName || 'Misafir'),
            body_bbcode: text,
            body_html: this.d.render.post(text).html,
            render_version: RENDER_VERSION,
            ip: src.ip,
            is_approved: src.approved ? 1 : 0,
            deleted_at: src.deleted ? src.createdAt : null,
            edited_at: src.editedAt,
            edit_reason: src.editReason?.slice(0, 200) ?? null,
            edit_count: src.editedAt ? 1 : 0,
            created_at: src.createdAt,
            updated_at: src.editedAt ?? src.createdAt,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        this.mapInsert.run('p', src.id, row.id);
        await this.q
          .insertInto('import_redirects')
          .values({ kind: 'post', old_id: src.id, new_id: row.id, run_id: this.runId })
          .onConflict((oc) => oc.columns(['kind', 'old_id']).doUpdateSet({ new_id: row.id, run_id: this.runId }))
          .execute();
        this.d.stat(this.state, 'posts');
      });
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    if (skipped) this.warn(`${skipped} mesaj, konusu bulunamadığı için atlandı.`);
    this.info(`${this.state.stats.posts ?? 0} mesaj aktarıldı${this.state.stats.images ? `, ${this.state.stats.images} görsel indirildi` : ''}.`);
  }

  private async importPolls(): Promise<void> {
    this.d.phase(this.state, 'polls', this.reader.counts().polls);
    for (const p of this.reader.polls()) {
      this.d.tick(this.state);
      const topic = this.topics.get(p.topicId);
      if (!topic || !p.options.length) continue;
      await this.d.db.tx(async () => {
        const voters = new Set(p.votes.map((v) => v.userId));
        const poll = await this.q
          .insertInto('polls')
          .values({
            topic_id: topic.id,
            question: p.question.slice(0, 300) || '—',
            max_choices: Math.max(1, Math.min(p.maxChoices, p.options.length)),
            allow_change: p.allowChange ? 1 : 0,
            closes_at: p.closesAt,
            closed_at: p.closesAt && p.closesAt < this.now() ? p.closesAt : null,
            voter_count: voters.size,
            created_at: p.createdAt,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        const optionIds = new Map<string, number>();
        let i = 0;
        for (const o of p.options) {
          const row = await this.q
            .insertInto('poll_options')
            .values({ poll_id: poll.id, label: o.label.slice(0, 200) || '—', sort_order: i++, vote_count: o.votes })
            .returning('id')
            .executeTakeFirstOrThrow();
          optionIds.set(o.id, row.id);
        }
        const seen = new Set<string>();
        for (const v of p.votes) {
          const user = this.users.get(v.userId);
          const option = optionIds.get(v.optionId);
          const key = `${user?.id}:${option}`;
          if (!user || !option || seen.has(key)) continue;
          seen.add(key);
          await this.q.insertInto('poll_votes').values({ poll_id: poll.id, option_id: option, user_id: user.id, created_at: p.createdAt }).execute();
        }
      });
      this.d.stat(this.state, 'polls');
    }
    this.info(`${this.state.stats.polls ?? 0} anket aktarıldı.`);
  }

  private async importConversations(): Promise<void> {
    this.d.phase(this.state, 'conversations', this.reader.counts().conversations);
    for (const c of this.reader.conversations()) {
      this.d.tick(this.state);
      if (this.state.cancel) throw new Cancelled('İşlem durduruldu.');
      const participants = [...new Set(c.participants.map((p) => this.users.get(p)?.id).filter((id): id is number => typeof id === 'number'))];
      if (participants.length < 1 || !c.messages.length) continue;
      await this.d.db.tx(async () => {
        const first = c.messages[0]!;
        const firstUser = first.userId ? this.users.get(first.userId) : undefined;
        const conv = await this.q
          .insertInto('conversations')
          .values({ title: c.title.slice(0, 200) || null, created_by: firstUser?.id ?? participants[0]!, last_message_at: first.createdAt, message_count: 0, created_at: first.createdAt })
          .returning('id')
          .executeTakeFirstOrThrow();
        let lastId = 0;
        let last = first;
        let lastUser = firstUser;
        for (const m of c.messages) {
          const user = m.userId ? this.users.get(m.userId) : undefined;
          const body = this.resolveQuotes(await this.finalizeBody(m.body, [], user?.id ?? null));
          const row = await this.q
            .insertInto('conversation_messages')
            .values({ conversation_id: conv.id, user_id: user?.id ?? null, author_name: user?.name ?? (m.authorName || 'Misafir'), body_bbcode: body, body_html: this.d.render.post(body).html, created_at: m.createdAt })
            .returning('id')
            .executeTakeFirstOrThrow();
          lastId = row.id;
          last = m;
          lastUser = user;
        }
        await this.q
          .updateTable('conversations')
          .set({ last_message_id: lastId, last_message_at: last.createdAt, last_message_user_id: lastUser?.id ?? null, message_count: c.messages.length })
          .where('id', '=', conv.id)
          .execute();
        await this.q
          .insertInto('conversation_participants')
          .values(participants.map((u) => ({ conversation_id: conv.id, user_id: u, last_read_message_id: lastId, joined_at: first.createdAt, left_at: null })))
          .execute();
      });
      this.d.stat(this.state, 'conversations');
    }
    this.info(`${this.state.stats.conversations ?? 0} özel mesaj konuşması aktarıldı.`);
  }

  private async importBans(): Promise<void> {
    const list = this.reader.bans();
    this.d.phase(this.state, 'bans', list.length + this.bannedUsers.length);
    for (const b of this.bannedUsers) {
      this.d.tick(this.state);
      try {
        await this.d.bans.create(
          {
            name: 'İçe aktarılan yasak',
            reasonPublic: b.reason || null,
            notesPrivate: `${PLATFORM_NAMES[this.reader.platform]} forumundan aktarıldı.`,
            cannotAccess: false,
            cannotLogin: true,
            cannotRegister: false,
            cannotPost: true,
            expiresAt: b.until > 0 ? b.until : null,
            triggers: [{ type: 'user', value: String(b.userId) }],
          },
          this.actorId,
        );
        this.d.stat(this.state, 'bans');
      } catch {
      }
    }
    const groups = new Map<string, typeof list>();
    for (const b of list) {
      const key = `${b.reason}|${b.expiresAt ?? 0}`;
      groups.set(key, [...(groups.get(key) ?? []), b]);
    }
    for (const items of groups.values()) {
      this.d.tick(this.state, items.length);
      const triggers: Array<{ type: 'ip' | 'email'; value: string }> = [];
      for (const b of items) {
        try {
          this.d.bans.normalizeTrigger({ type: b.kind, value: b.value });
          triggers.push({ type: b.kind, value: b.value });
        } catch {
        }
      }
      if (!triggers.length) continue;
      await this.d.bans.create(
        {
          name: `İçe aktarılan yasaklar (${PLATFORM_NAMES[this.reader.platform]})`,
          reasonPublic: items[0]!.reason || null,
          notesPrivate: null,
          cannotAccess: false,
          cannotLogin: true,
          cannotRegister: true,
          cannotPost: true,
          expiresAt: items[0]!.expiresAt,
          triggers,
        },
        this.actorId,
      );
      this.d.stat(this.state, 'bans');
    }
    this.info(`${this.state.stats.bans ?? 0} yasak aktarıldı.`);
  }

  private async recount(): Promise<void> {
    this.d.phase(this.state, 'recount', 4);
    const visible = sql`p.deleted_at IS NULL AND p.is_approved = 1`;
    if (this.firstTopicId) {
      await sql`UPDATE topics SET
          first_post_id = (SELECT MIN(p.id) FROM posts p WHERE p.topic_id = topics.id),
          last_post_id = (SELECT MAX(p.id) FROM posts p WHERE p.topic_id = topics.id AND ${visible}),
          reply_count = (SELECT CASE WHEN COUNT(*) > 0 THEN COUNT(*) - 1 ELSE 0 END FROM posts p WHERE p.topic_id = topics.id AND ${visible})
        WHERE id >= ${this.firstTopicId}`.execute(this.q);
      await sql`UPDATE topics SET
          last_post_at = COALESCE((SELECT p.created_at FROM posts p WHERE p.id = topics.last_post_id), topics.created_at),
          last_poster_id = COALESCE((SELECT p.user_id FROM posts p WHERE p.id = topics.last_post_id), topics.user_id),
          last_poster_name = COALESCE((SELECT p.author_name FROM posts p WHERE p.id = topics.last_post_id), topics.author_name)
        WHERE id >= ${this.firstTopicId}`.execute(this.q);
      await sql`DELETE FROM topics WHERE id >= ${this.firstTopicId} AND first_post_id IS NULL AND NOT EXISTS (SELECT 1 FROM polls WHERE polls.topic_id = topics.id)`.execute(this.q);
    }
    this.d.tick(this.state);
    for (const board of new Set([...this.boardMap.values(), ...(this.fallbackBoard ? [this.fallbackBoard] : [])])) await this.d.counters.recountBoard(board);
    this.d.tick(this.state);
    const countSql = sql`(SELECT COUNT(*) FROM posts p JOIN topics t ON t.id = p.topic_id JOIN boards b ON b.id = p.board_id
        WHERE p.user_id = users.id AND ${visible} AND t.deleted_at IS NULL AND b.count_posts = 1)`;
    if (this.firstUserId) await sql`UPDATE users SET post_count = ${countSql} WHERE id >= ${this.firstUserId}`.execute(this.q);
    for (const id of this.mergedUsers) await this.d.counters.recountUserPosts(id);
    this.d.tick(this.state);
    await this.d.groupCache.invalidate();
    await this.d.groups.recalcAllPostGroups();
    await this.d.groups.recountMembers();
    this.d.tick(this.state);
    this.info('Sayaçlar ve rütbeler yeniden hesaplandı.');
  }

  private async downloadAvatars(): Promise<void> {
    this.d.phase(this.state, 'avatars', this.avatars.length);
    const size = this.d.settings.get('avatars.size');
    const queue = [...this.avatars];
    const worker = async () => {
      for (;;) {
        const item = queue.shift();
        if (!item) return;
        if (this.state.cancel) throw new Cancelled('İşlem durduruldu.');
        this.d.tick(this.state);
        const buf = await this.download(item.url, 2 * 1024 * 1024);
        if (!buf) continue;
        try {
          const saved = await this.d.storage.saveImage(buf, { purpose: 'avatar', ownerUserId: item.userId, maxBytes: 2 * 1024 * 1024, maxDimension: 2048, resizeTo: size, allowGif: true });
          await this.q.updateTable('users').set({ avatar_file_id: saved.id }).where('id', '=', item.userId).execute();
          this.d.stat(this.state, 'avatars');
        } catch {
          this.downloadFailures++;
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    this.info(`${this.state.stats.avatars ?? 0} avatar indirildi.`);
  }
}
