import { Injectable, Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';

const VERSION_PREFIX = 'cache_version:';
const SYNC_INTERVAL_MS = 2000;

/**
 * Bellek içi önbellek. Birden fazla process (ör. Passenger) arasında tutarlılık için
 * her ad alanının bir versiyon sayacı `system_state` tablosunda tutulur; geçersizleme sayacı artırır,
 * diğer process'ler en geç 2 sn içinde fark eder.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger('Cache');
  private readonly lru = new LRUCache<string, { v: unknown }>({ max: 5000, ttl: 10 * 60_000 });
  private readonly versions = new Map<string, number>();
  private readonly listeners = new Map<string, Array<() => void | Promise<void>>>();
  private lastSync = 0;
  private syncing: Promise<void> | null = null;

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  private k(ns: string, key: string): string {
    return `${ns}@${this.versions.get(ns) ?? 0}:${key}`;
  }

  get<T>(ns: string, key: string): T | undefined {
    return this.lru.get(this.k(ns, key))?.v as T | undefined;
  }

  set<T>(ns: string, key: string, value: T, ttlMs?: number): void {
    this.lru.set(this.k(ns, key), { v: value }, ttlMs ? { ttl: ttlMs } : undefined);
  }

  delete(ns: string, key: string): void {
    this.lru.delete(this.k(ns, key));
  }

  async wrap<T>(ns: string, key: string, fn: () => Promise<T>, ttlMs?: number): Promise<T> {
    const hit = this.lru.get(this.k(ns, key));
    if (hit) return hit.v as T;
    const value = await fn();
    this.set(ns, key, value, ttlMs);
    return value;
  }

  /** Ad alanındaki tüm kayıtları (tüm process'lerde) geçersiz kılar. */
  async invalidate(ns: string): Promise<void> {
    const key = VERSION_PREFIX + ns;
    const now = this.clock.now();
    const row = await this.db.q.selectFrom('system_state').select('value').where('key', '=', key).executeTakeFirst();
    const next = Math.max(Number(row?.value ?? 0), this.versions.get(ns) ?? 0) + 1;
    await this.db.q
      .insertInto('system_state')
      .values({ key, value: String(next), updated_at: now })
      .onConflict((oc) => oc.column('key').doUpdateSet({ value: String(next), updated_at: now }))
      .execute();
    this.versions.set(ns, next);
    await this.notify(ns);
  }

  onInvalidate(ns: string, fn: () => void | Promise<void>): void {
    const list = this.listeners.get(ns) ?? [];
    list.push(fn);
    this.listeners.set(ns, list);
  }

  private async notify(ns: string): Promise<void> {
    for (const fn of this.listeners.get(ns) ?? []) {
      try {
        await fn();
      } catch (err) {
        this.logger.error(`Önbellek dinleyici hatası (${ns}): ${String(err)}`);
      }
    }
  }

  /** Diğer process'lerin yaptığı geçersizlemeleri algılar (istek başında çağrılır, 2 sn'de bir sorgular). */
  async sync(force = false): Promise<void> {
    const now = this.clock.now();
    if (!force && now - this.lastSync < SYNC_INTERVAL_MS) return;
    if (this.syncing) return this.syncing;
    this.lastSync = now;
    this.syncing = (async () => {
      try {
        const rows = await this.db.q
          .selectFrom('system_state')
          .select(['key', 'value'])
          .where('key', 'like', `${VERSION_PREFIX}%`)
          .execute();
        for (const row of rows) {
          const ns = row.key.slice(VERSION_PREFIX.length);
          const v = Number(row.value);
          if ((this.versions.get(ns) ?? 0) !== v) {
            const known = this.versions.has(ns);
            this.versions.set(ns, v);
            if (known) await this.notify(ns);
          }
        }
      } finally {
        this.syncing = null;
      }
    })();
    return this.syncing;
  }

  clearAll(): void {
    this.lru.clear();
  }
}
