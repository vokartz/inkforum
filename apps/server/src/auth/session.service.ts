import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { SessionInfo } from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock, DAY, HOUR, MINUTE } from '../common/clock.js';
import { CryptoService } from '../security/crypto.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { CONFIG, type AppConfig } from '../config/config.js';
import { bool } from '../database/json.js';
import { deviceLabel } from '../common/http.js';

const TOUCH_INTERVAL_MS = MINUTE;
const NON_PERSISTENT_ABSOLUTE_MS = 7 * DAY;
const PERSISTENT_ABSOLUTE_MS = 365 * DAY;

export interface ResolvedSession {
  session: Row<'sessions'>;
  user: Row<'users'>;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly crypto: CryptoService,
    private readonly settings: SettingsService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private ttl(persistent: boolean): number {
    return persistent
      ? this.settings.get('security.rememberDays') * DAY
      : this.settings.get('security.sessionIdleHours') * HOUR;
  }

  async create(userId: number, persistent: boolean, ip: string | null, userAgent: string | null) {
    const token = this.crypto.token(32);
    const now = this.clock.now();
    const session = await this.db.q
      .insertInto('sessions')
      .values({
        token_hash: this.crypto.sha256(token),
        user_id: userId,
        is_persistent: persistent,
        created_at: now,
        last_seen_at: now,
        expires_at: now + this.ttl(persistent),
        absolute_expires_at: now + (persistent ? PERSISTENT_ABSOLUTE_MS : NON_PERSISTENT_ABSOLUTE_MS),
        ip,
        user_agent: userAgent,
        device_label: deviceLabel(userAgent),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { token, session };
  }

  async resolve(token: string | undefined, ip: string | null): Promise<ResolvedSession | null> {
    if (!token || token.length < 20 || token.length > 100) return null;
    const now = this.clock.now();
    const session = await this.db.q
      .selectFrom('sessions')
      .selectAll()
      .where('token_hash', '=', this.crypto.sha256(token))
      .executeTakeFirst();
    if (!session || session.expires_at <= now || session.absolute_expires_at <= now) return null;
    const user = await this.db.q
      .selectFrom('users')
      .selectAll()
      .where('id', '=', session.user_id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!user || user.status !== 'active') return null;

    if (now - session.last_seen_at > TOUCH_INTERVAL_MS) {
      const expires = Math.min(session.absolute_expires_at, now + this.ttl(bool(session.is_persistent)));
      await this.db.q
        .updateTable('sessions')
        .set({ last_seen_at: now, expires_at: expires, ip })
        .where('id', '=', session.id)
        .execute();
      session.last_seen_at = now;
      session.expires_at = expires;
    }
    return { session, user };
  }

  async revoke(sessionId: number): Promise<void> {
    await this.db.q.deleteFrom('sessions').where('id', '=', sessionId).execute();
  }

  async revokeForUser(userId: number, sessionId: number): Promise<boolean> {
    const r = await this.db.q
      .deleteFrom('sessions')
      .where('id', '=', sessionId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return Number(r.numDeletedRows) > 0;
  }

  async revokeAll(userId: number, exceptSessionId?: number): Promise<number> {
    let q = this.db.q.deleteFrom('sessions').where('user_id', '=', userId);
    if (exceptSessionId) q = q.where('id', '!=', exceptSessionId);
    const r = await q.executeTakeFirst();
    return Number(r.numDeletedRows);
  }

  async list(userId: number, currentSessionId: number | null): Promise<SessionInfo[]> {
    const now = this.clock.now();
    const rows = await this.db.q
      .selectFrom('sessions')
      .selectAll()
      .where('user_id', '=', userId)
      .where('expires_at', '>', now)
      .orderBy('last_seen_at', 'desc')
      .execute();
    return rows.map((s) => ({
      id: s.id,
      current: s.id === currentSessionId,
      persistent: bool(s.is_persistent),
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at,
      expiresAt: s.expires_at,
      ip: s.ip,
      userAgent: s.user_agent,
      deviceLabel: s.device_label,
    }));
  }

  async elevate(sessionId: number): Promise<number> {
    const until = this.clock.now() + this.settings.get('security.adminElevationMinutes') * MINUTE;
    await this.db.q.updateTable('sessions').set({ elevated_until: until }).where('id', '=', sessionId).execute();
    return until;
  }

  async cleanupExpired(): Promise<void> {
    const now = this.clock.now();
    await this.db.q.deleteFrom('sessions').where('expires_at', '<', now).execute();
    await this.db.q.deleteFrom('login_challenges').where('expires_at', '<', now).execute();
  }

  setCookie(res: Response, token: string, persistent: boolean): void {
    res.cookie(this.config.sessionCookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.secureCookies,
      path: '/',
      ...(persistent ? { maxAge: this.ttl(true) } : {}),
    });
  }

  clearCookie(res: Response): void {
    res.clearCookie(this.config.sessionCookieName, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.secureCookies,
      path: '/',
    });
  }
}
