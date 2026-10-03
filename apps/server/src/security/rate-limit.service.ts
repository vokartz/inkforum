import { Injectable } from '@nestjs/common';
import type { AuthAttemptKind } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock, MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  hit(key: string, limit: number, windowMs: number): void {
    const now = this.clock.now();
    this.sweep(now);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    bucket.count++;
    if (bucket.count > limit) throw Errors.rateLimited(Math.ceil((bucket.resetAt - now) / 1000));
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < MINUTE) return;
    this.lastSweep = now;
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
    if (this.buckets.size > 50_000) this.buckets.clear();
  }

  async record(kind: AuthAttemptKind, identifier: string, ip: string | null, success: boolean): Promise<void> {
    await this.db.q
      .insertInto('auth_attempts')
      .values({ kind, identifier, ip, success, created_at: this.clock.now() })
      .execute();
  }

  async failures(kind: AuthAttemptKind, by: { identifier?: string; ip?: string | null }, windowMs: number): Promise<number> {
    const since = this.clock.now() - windowMs;
    let q = this.db.q
      .selectFrom('auth_attempts')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('kind', '=', kind)
      .where('success', '=', 0)
      .where('created_at', '>=', since);
    if (by.identifier !== undefined) q = q.where('identifier', '=', by.identifier);
    if (by.ip !== undefined) q = q.where('ip', by.ip === null ? 'is' : '=', by.ip);
    const row = await q.executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  async failuresSinceSuccess(kind: AuthAttemptKind, identifier: string, windowMs: number): Promise<number> {
    const since = this.clock.now() - windowMs;
    const lastSuccess = await this.db.q
      .selectFrom('auth_attempts')
      .select('created_at')
      .where('kind', '=', kind)
      .where('identifier', '=', identifier)
      .where('success', '=', 1)
      .where('created_at', '>=', since)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    const row = await this.db.q
      .selectFrom('auth_attempts')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('kind', '=', kind)
      .where('identifier', '=', identifier)
      .where('success', '=', 0)
      .where('created_at', '>', lastSuccess?.created_at ?? since)
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }

  async cleanup(olderThanMs: number): Promise<void> {
    await this.db.q.deleteFrom('auth_attempts').where('created_at', '<', this.clock.now() - olderThanMs).execute();
  }
}
