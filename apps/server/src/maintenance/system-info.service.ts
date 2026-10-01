import { existsSync, readdirSync, statSync, statfsSync } from 'node:fs';
import { cpus, freemem, loadavg, totalmem, type as osType, release as osRelease, hostname } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { pendingMigrations } from '@forum/db';
import { CONFIG, type AppConfig } from '../config/config.js';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { MailService } from '../mail/mail.service.js';
import { StorageService } from '../storage/storage.service.js';
import { storageWarning } from '../storage/persistence.js';
import { JobsService } from '../jobs/jobs.service.js';
import { WafService } from '../security/waf.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { I18nService } from '../i18n/i18n.service.js';
import type { Locale } from '@forum/shared';

export interface SystemCheck {
  key: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

const COUNT_TABLES = ['users', 'topics', 'posts', 'conversation_messages', 'member_groups', 'sessions', 'notifications', 'audit_log', 'files', 'jobs'] as const;

/** Yönetim → Sistem bilgisi: sürüm, çalışma ortamı, veritabanı, depolama ve sağlık denetimleri. */
@Injectable()
export class SystemInfoService {
  private dirCache: { at: number; bytes: number; files: number } | null = null;

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly waf: WafService,
    private readonly settings: SettingsService,
    private readonly i18n: I18nService,
  ) {}

  /** Pano kartı için hafif özet */
  brief() {
    const mem = process.memoryUsage();
    return {
      version: this.config.version,
      deploy: this.config.deploy,
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      db: this.config.db.driver,
      mailDriver: this.mail.driver(),
      imageDriver: this.config.imageDriver,
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapMb: Math.round(mem.heapUsed / 1024 / 1024),
      uptimeSec: Math.round(process.uptime()),
      appUrl: this.config.appUrl,
      env: this.config.env,
      storage: storageWarning(this.config),
    };
  }

  /** Yüklenen dosyaların toplam boyutu (en fazla 5 dakikada bir, en çok 200 bin dosya taranır) */
  private uploads(): { bytes: number; files: number } {
    if (this.dirCache && this.clock.now() - this.dirCache.at < 5 * 60_000) return this.dirCache;
    let bytes = 0;
    let files = 0;
    const walk = (dir: string, depth: number) => {
      if (depth > 6 || files > 200_000 || !existsSync(dir)) return;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, depth + 1);
        else if (e.isFile()) {
          files++;
          try {
            bytes += statSync(p).size;
          } catch {
            /* silinmiş */
          }
        }
      }
    };
    walk(this.config.uploadsDir, 0);
    this.dirCache = { at: this.clock.now(), bytes, files };
    return this.dirCache;
  }

  async full(locale: Locale = 'tr') {
    const mem = process.memoryUsage();
    let dbSize: number | null = null;
    let dbVersion: string;
    if (this.config.db.driver === 'sqlite') {
      const r = await sql<{ size: number }>`select page_count * page_size as size from pragma_page_count(), pragma_page_size()`.execute(this.db.q);
      dbSize = Number(r.rows[0]?.size ?? 0);
      const v = await sql<{ v: string }>`select sqlite_version() as v`.execute(this.db.q);
      dbVersion = `SQLite ${v.rows[0]?.v ?? ''}`;
    } else {
      try {
        const r = await sql<{ size: string }>`select pg_database_size(current_database()) as size`.execute(this.db.q);
        dbSize = Number(r.rows[0]?.size ?? 0);
        const v = await sql<{ v: string }>`show server_version`.execute(this.db.q);
        dbVersion = `PostgreSQL ${Object.values(v.rows[0] ?? {})[0] ?? ''}`;
      } catch {
        dbVersion = 'PostgreSQL';
      }
    }
    const counts: Record<string, number> = {};
    for (const t of COUNT_TABLES) {
      try {
        const r = await this.db.q.selectFrom(t).select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst();
        counts[t] = Number(r?.n ?? 0);
      } catch {
        counts[t] = 0;
      }
    }
    const pending = await pendingMigrations(this.db.q);
    const applied = await sql<{ n: number }>`select count(*) as n from kysely_migration`.execute(this.db.q).then((r) => Number(r.rows[0]?.n ?? 0)).catch(() => 0);

    const disk = ((): { free: number; total: number } | null => {
      try {
        const s = statfsSync(this.config.storageDir);
        return { free: Number(s.bavail) * Number(s.bsize), total: Number(s.blocks) * Number(s.bsize) };
      } catch {
        return null;
      }
    })();
    const uploads = this.uploads();
    const jobStats = await this.jobs.stats();
    const sharp = await this.storage.loadSharp();

    const checks: SystemCheck[] = [];
    const url = new URL(this.config.appUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    checks.push({ key: 'https', label: 'HTTPS', status: url.protocol === 'https:' || local ? 'ok' : 'warn', detail: url.protocol === 'https:' ? 'Site HTTPS ile sunuluyor.' : local ? 'Yerel adres.' : 'Canlı sitede HTTPS kullanın (APP_URL).' });
    checks.push({ key: 'migrations', label: 'Veritabanı şeması', status: pending.length ? 'fail' : 'ok', detail: pending.length ? `${pending.length} bekleyen güncelleme: ${pending.slice(0, 3).join(', ')}` : `${applied} güncelleme uygulanmış, güncel.` });
    checks.push({ key: 'mail', label: 'E-posta', status: this.mail.driver() === 'log' ? 'warn' : 'ok', detail: this.mail.driver() === 'log' ? 'E-postalar gönderilmiyor, storage/mail klasörüne yazılıyor.' : `Sürücü: ${this.mail.driver()}` });
    checks.push({ key: 'images', label: 'Görsel işleme', status: sharp ? 'ok' : 'warn', detail: sharp ? 'sharp etkin (küçültme + WebP).' : 'sharp yok: görseller olduğu gibi saklanıyor.' });
    checks.push({ key: 'jobs', label: 'Arka plan işleri', status: !this.config.workerEnabled ? 'warn' : (jobStats.counts.failed ?? 0) > 0 ? 'warn' : 'ok', detail: !this.config.workerEnabled ? 'İş çalıştırıcı kapalı (WORKER_ENABLED=false).' : `${jobStats.counts.pending ?? 0} bekleyen, ${jobStats.counts.failed ?? 0} başarısız iş.` });
    const ephemeral = storageWarning(this.config);
    if (ephemeral) {
      checks.push({
        key: 'persistence',
        label: 'Kalıcı depolama',
        status: 'fail',
        detail: ephemeral.coolify
          ? 'Depolama klasörüne kalıcı disk bağlı değil: Coolify her yeniden dağıtımda veriler silinmiş gibi sıfırdan başlar. Coolify → Persistent Storage bölümünden /app/storage için bir birim ekleyin.'
          : 'Depolama klasörüne kalıcı disk bağlı değil: kapsayıcı yeniden oluşturulursa veriler kaybolur. /app/storage için adlandırılmış bir birim (volume) bağlayın.',
      });
    }
    if (disk) checks.push({ key: 'disk', label: 'Disk alanı', status: disk.free < 1024 ** 3 ? (disk.free < 200 * 1024 ** 2 ? 'fail' : 'warn') : 'ok', detail: `${(disk.free / 1024 ** 3).toFixed(1)} GB boş` });
    checks.push({ key: 'maintenance', label: 'Bakım modu', status: this.settings.get('general.maintenanceMode') ? 'warn' : 'ok', detail: this.settings.get('general.maintenanceMode') ? 'Site ziyaretçilere kapalı.' : 'Site açık.' });
    checks.push({ key: 'waf', label: 'Güvenlik duvarı', status: 'ok', detail: this.waf.active() ? 'Etkin.' : 'Kapalı (Yönetim → Güvenlik duvarı).' });

    return {
      app: {
        product: 'InkForum',
        version: this.config.version,
        build: this.config.build,
        deploy: this.config.deploy,
        env: this.config.env,
        appUrl: this.config.appUrl,
        startedAt: this.clock.now() - Math.round(process.uptime() * 1000),
        uptimeSec: Math.round(process.uptime()),
        pid: process.pid,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        trustProxy: String(this.config.trustProxy),
        secureCookies: this.config.secureCookies,
      },
      runtime: {
        node: process.version,
        platform: `${process.platform} ${process.arch}`,
        os: `${osType()} ${osRelease()}`,
        host: hostname(),
        cpus: cpus().length,
        cpuModel: cpus()[0]?.model?.trim() ?? '',
        load: loadavg().map((n) => Math.round(n * 100) / 100),
        memTotal: totalmem(),
        memFree: freemem(),
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
      },
      database: {
        driver: this.config.db.driver,
        version: dbVersion,
        sizeBytes: dbSize,
        path: this.config.db.driver === 'sqlite' ? this.config.db.sqlitePath : null,
        journal: this.config.db.driver === 'sqlite' ? this.config.db.sqliteJournal : null,
        migrations: { applied, pending: pending.length },
        counts,
      },
      storage: { dir: this.config.storageDir, uploadsBytes: uploads.bytes, uploadsFiles: uploads.files, disk },
      services: { mail: this.mail.driver(), images: sharp ? 'sharp' : 'passthrough', worker: this.config.workerEnabled, jobs: jobStats.counts },
      checks: checks.map((c) => ({ ...c, label: this.i18n.message(locale, c.label), detail: this.i18n.message(locale, c.detail) })),
    };
  }
}
