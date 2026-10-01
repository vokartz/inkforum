import { Injectable } from '@nestjs/common';
import type { Shout, ShoutboxSettings } from '@forum/shared';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { can, type RequestViewer } from '../common/request-context.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { AuditService } from '../audit/audit.service.js';

const FLOOD_MS = 3000;
/** Üye kendi mesajını bu süre içinde silebilir */
const OWN_DELETE_MS = 10 * 60_000;

/** Sohbet kutusu eklentisi: kısa, anlık mesajlar (yeni mesajlar bağlı tüm üyelere anında iletilir). */
@Injectable()
export class ShoutboxService {
  private readonly lastAt = new Map<number, number>();

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  config(): ShoutboxSettings {
    return this.settings.get('shoutbox.config') as ShoutboxSettings;
  }

  canModerate(viewer: RequestViewer): boolean {
    return viewer.isAdmin || can(viewer, 'mod.warnings.issue');
  }

  private canDelete(viewer: RequestViewer, row: { user_id: number; created_at: number }): boolean {
    if (!viewer.user) return false;
    return (
      this.canModerate(viewer) ||
      (row.user_id === viewer.user.id && this.clock.now() - row.created_at < OWN_DELETE_MS)
    );
  }

  async list(
    viewer: RequestViewer,
  ): Promise<{ items: Shout[]; canPost: boolean; canModerate: boolean; maxLength: number }> {
    const cfg = this.config();
    if (!viewer.user && !cfg.guests) throw Errors.unauthenticated();
    const rows = await this.db.q
      .selectFrom('shouts')
      .select(['id', 'user_id', 'body', 'created_at'])
      .where('deleted_at', 'is', null)
      .orderBy('id', 'desc')
      .limit(cfg.history)
      .execute();
    const people = await this.users.summaries(rows.map((r) => r.user_id));
    const items = rows
      .reverse()
      .filter((r) => people.has(r.user_id))
      .map((r) => ({
        id: r.id,
        user: people.get(r.user_id)!,
        body: r.body,
        createdAt: r.created_at,
        canDelete: this.canDelete(viewer, r),
      }));
    return {
      items,
      canPost: !!viewer.user && viewer.user.status === 'active',
      canModerate: this.canModerate(viewer),
      maxLength: cfg.maxLength,
    };
  }

  async post(viewer: RequestViewer, body: string): Promise<Shout> {
    const user = viewer.user;
    if (!user) throw Errors.unauthenticated();
    if (user.status !== 'active') throw Errors.forbidden('Hesabınız sohbet kutusuna yazamaz.');
    const text = body.replace(/\s+/g, ' ').trim();
    const cfg = this.config();
    if (!text) throw Errors.field('body', 'Mesaj boş olamaz.');
    if (text.length > cfg.maxLength)
      throw Errors.field('body', `Mesaj en fazla ${cfg.maxLength} karakter olabilir.`);
    const now = this.clock.now();
    const last = this.lastAt.get(user.id) ?? 0;
    if (!this.canModerate(viewer) && now - last < FLOOD_MS)
      throw Errors.badRequest('Çok hızlı yazıyorsunuz; birkaç saniye bekleyin.');
    this.lastAt.set(user.id, now);
    const row = await this.db.q
      .insertInto('shouts')
      .values({ user_id: user.id, body: text, created_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    const summary = (await this.users.summaries([user.id])).get(user.id)!;
    const shout = { id: row.id, user: summary, body: text, createdAt: now };
    this.realtime.broadcast({ type: 'shout', shout });
    return { ...shout, canDelete: true };
  }

  async delete(viewer: RequestViewer, id: number): Promise<void> {
    const row = await this.db.q
      .selectFrom('shouts')
      .select(['id', 'user_id', 'body', 'created_at'])
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!row) throw Errors.notFound('Mesaj bulunamadı.');
    if (!this.canDelete(viewer, row)) throw Errors.forbidden('Bu mesajı silemezsiniz.');
    await this.db.q
      .updateTable('shouts')
      .set({ deleted_at: this.clock.now(), deleted_by: viewer.user!.id })
      .where('id', '=', id)
      .execute();
    if (row.user_id !== viewer.user!.id) {
      await this.audit.log({
        type: 'moderation',
        action: 'shout.delete',
        actorId: viewer.user!.id,
        ip: viewer.ip,
        data: { id, userId: row.user_id, body: row.body.slice(0, 200) },
      });
    }
    this.realtime.broadcast({ type: 'shoutDeleted', id });
  }

  /** Tüm mesajları temizler (yönetim) */
  async clear(viewer: RequestViewer): Promise<number> {
    const r = await this.db.q
      .updateTable('shouts')
      .set({ deleted_at: this.clock.now(), deleted_by: viewer.user!.id })
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    await this.audit.log({ type: 'admin', action: 'shout.clear', actorId: viewer.user!.id, ip: viewer.ip });
    return Number(r.numUpdatedRows ?? 0);
  }

  async stats(): Promise<{ total: number; today: number }> {
    const count = async (since?: number) => {
      let q = this.db.q
        .selectFrom('shouts')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('deleted_at', 'is', null);
      if (since) q = q.where('created_at', '>=', since);
      return Number((await q.executeTakeFirst())?.n ?? 0);
    };
    return { total: await count(), today: await count(this.clock.now() - 86_400_000) };
  }
}
