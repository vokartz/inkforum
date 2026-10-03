import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Row, WarningActionType } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock, DAY, HOUR } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BansService } from '../bans/bans.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { EventsService } from '../events/events.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import type { RequestViewer } from '../common/request-context.js';
import { bool } from '../database/json.js';
import type { IssueWarningInput, WarningActionInput, WarningTemplateInput } from './warnings.schemas.js';

export const WHILE_ABOVE_UNTIL = 253_402_300_799_000;

export const ACTION_LABELS: Record<WarningActionType, string> = {
  watch: 'İzlemeye al',
  moderate: 'Mesajları onaya tabi tut',
  mute: 'Susturma (mesaj yazamaz)',
  temp_ban: 'Geçici yasak',
};

@Injectable()
export class WarningsService implements OnModuleInit {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly bans: BansService,
    private readonly permissions: PermissionsService,
    private readonly events: EventsService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    this.jobs.schedule('warnings.expire', HOUR, () => this.expireWarnings().then(() => undefined));
  }

  async templates(activeOnly = false) {
    let q = this.db.q.selectFrom('warning_templates').selectAll().orderBy('sort_order').orderBy('id');
    if (activeOnly) q = q.where('is_active', '=', 1);
    return (await q.execute()).map((t) => ({
      id: t.id,
      title: t.title,
      reasonTemplate: t.reason_template,
      points: t.points,
      expiryDays: t.expiry_days,
      isActive: bool(t.is_active),
      sortOrder: t.sort_order,
    }));
  }

  async saveTemplate(id: number | null, input: WarningTemplateInput): Promise<number> {
    const now = this.clock.now();
    const values = {
      title: input.title,
      reason_template: input.reasonTemplate,
      points: input.points,
      expiry_days: input.expiryDays,
      is_active: input.isActive,
      sort_order: input.sortOrder,
      updated_at: now,
    };
    if (id) {
      const r = await this.db.q.updateTable('warning_templates').set(values).where('id', '=', id).executeTakeFirst();
      if (!Number(r.numUpdatedRows)) throw Errors.notFound('Şablon bulunamadı.');
      return id;
    }
    const row = await this.db.q
      .insertInto('warning_templates')
      .values({ ...values, created_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async deleteTemplate(id: number): Promise<void> {
    await this.db.q.deleteFrom('warning_templates').where('id', '=', id).execute();
  }

  async actions(activeOnly = false) {
    let q = this.db.q.selectFrom('warning_actions').selectAll().orderBy('threshold_points').orderBy('sort_order');
    if (activeOnly) q = q.where('is_active', '=', 1);
    return (await q.execute()).map((a) => ({
      id: a.id,
      thresholdPoints: a.threshold_points,
      action: a.action,
      actionLabel: ACTION_LABELS[a.action],
      mode: a.mode,
      durationDays: a.duration_ms ? Math.round(a.duration_ms / DAY) : null,
      isActive: bool(a.is_active),
      sortOrder: a.sort_order,
    }));
  }

  async saveAction(id: number | null, input: WarningActionInput): Promise<number> {
    const now = this.clock.now();
    const values = {
      threshold_points: input.thresholdPoints,
      action: input.action,
      mode: input.mode,
      duration_ms: input.durationDays ? input.durationDays * DAY : null,
      is_active: input.isActive,
      sort_order: input.sortOrder,
      updated_at: now,
    };
    if (id) {
      const r = await this.db.q.updateTable('warning_actions').set(values).where('id', '=', id).executeTakeFirst();
      if (!Number(r.numUpdatedRows)) throw Errors.notFound('Eylem bulunamadı.');
      return id;
    }
    const row = await this.db.q.insertInto('warning_actions').values({ ...values, created_at: now }).returning('id').executeTakeFirstOrThrow();
    return row.id;
  }

  async deleteAction(id: number): Promise<void> {
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('warning_action_applications').where('action_id', '=', id).execute();
      await this.db.q.deleteFrom('warning_actions').where('id', '=', id).execute();
    });
  }

  async issue(actor: RequestViewer, userId: number, input: IssueWarningInput): Promise<number> {
    if (!this.settings.get('warnings.enabled')) throw Errors.badRequest('Uyarı sistemi kapalı.');
    if (actor.user?.id === userId) throw Errors.badRequest('Kendinize uyarı veremezsiniz.');
    const target = await this.users.findById(userId);
    if (!target) throw Errors.notFound('Üye bulunamadı.');
    const targetPerms = await this.permissions.forUser(target);
    if (targetPerms.isAdmin) throw Errors.forbidden('Yöneticilere uyarı verilemez.');
    const max = this.settings.get('warnings.maxPoints');
    if (input.points > max) throw Errors.field('points', `Tek uyarıda en fazla ${max} puan verilebilir.`);

    let expiryDays = input.expiryDays;
    if (input.templateId) {
      const t = await this.db.q.selectFrom('warning_templates').selectAll().where('id', '=', input.templateId).executeTakeFirst();
      if (!t) throw Errors.field('templateId', 'Şablon bulunamadı.');
      if (expiryDays === null) expiryDays = t.expiry_days;
    }
    const now = this.clock.now();
    return this.db.tx(async () => {
      const w = await this.db.q
        .insertInto('user_warnings')
        .values({
          user_id: userId,
          issued_by: actor.user!.id,
          template_id: input.templateId,
          points: input.points,
          reason: input.reason,
          message_to_user: input.messageToUser,
          notes: input.notes,
          expires_at: expiryDays ? now + expiryDays * DAY : null,
          created_at: now,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await this.recompute(userId, w.id);
      await this.notifications.notify(userId, 'warning.issued', { warningId: w.id, points: input.points, reason: input.reason }, actor.user!.id);
      await this.audit.log({
        type: 'moderation',
        action: 'warning.issue',
        actorId: actor.user!.id,
        targetType: 'user',
        targetId: userId,
        ip: actor.ip,
        data: { warningId: w.id, points: input.points, reason: input.reason },
      });
      return w.id;
    });
  }

  async revoke(actor: RequestViewer, warningId: number, reason: string | null): Promise<void> {
    const w = await this.db.q.selectFrom('user_warnings').selectAll().where('id', '=', warningId).executeTakeFirst();
    if (!w || w.revoked_at) throw Errors.notFound('Aktif uyarı bulunamadı.');
    await this.db.tx(async () => {
      await this.db.q
        .updateTable('user_warnings')
        .set({ revoked_at: this.clock.now(), revoked_by: actor.user!.id, revoke_reason: reason })
        .where('id', '=', warningId)
        .execute();
      await this.recompute(w.user_id, null);
      await this.notifications.notify(w.user_id, 'warning.revoked', { warningId, points: w.points }, actor.user!.id);
      await this.audit.log({
        type: 'moderation',
        action: 'warning.revoke',
        actorId: actor.user!.id,
        targetType: 'user',
        targetId: w.user_id,
        ip: actor.ip,
        data: { warningId, reason },
      });
    });
  }

  async recompute(userId: number, triggeringWarningId: number | null): Promise<number> {
    const now = this.clock.now();
    const user = await this.db.q.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirstOrThrow();
    const r = await this.db.q
      .selectFrom('user_warnings')
      .select((eb) => eb.fn.sum<number>('points').as('total'))
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .where('expired_at', 'is', null)
      .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]))
      .executeTakeFirst();
    const points = Number(r?.total ?? 0);
    const prev = user.warning_points;
    if (points !== prev) {
      await this.db.q.updateTable('users').set({ warning_points: points }).where('id', '=', userId).execute();
      this.events.emit('user.warningPointsChanged', { userId });
    }
    await this.applyActions(user, prev, points, triggeringWarningId);
    return points;
  }

  private async applyActions(user: Row<'users'>, prev: number, next: number, warningId: number | null): Promise<void> {
    const now = this.clock.now();
    const actions = await this.db.q.selectFrom('warning_actions').selectAll().where('is_active', '=', 1).orderBy('threshold_points').execute();
    const patch: { is_watched?: number; moderated_until?: number | null; muted_until?: number | null } = {};
    let moderated = user.moderated_until;
    let muted = user.muted_until;

    for (const a of actions) {
      const t = a.threshold_points;
      const crossedUp = prev < t && next >= t;
      const crossedDown = prev >= t && next < t;

      if (a.mode === 'while_above') {
        if (next >= t) {
          if (a.action === 'watch') patch.is_watched = 1;
          if (a.action === 'moderate' && (moderated ?? 0) < WHILE_ABOVE_UNTIL) moderated = patch.moderated_until = WHILE_ABOVE_UNTIL;
          if (a.action === 'mute' && (muted ?? 0) < WHILE_ABOVE_UNTIL) muted = patch.muted_until = WHILE_ABOVE_UNTIL;
        } else if (crossedDown) {
          if (a.action === 'watch') patch.is_watched = 0;
          if (a.action === 'moderate' && moderated === WHILE_ABOVE_UNTIL) moderated = patch.moderated_until = null;
          if (a.action === 'mute' && muted === WHILE_ABOVE_UNTIL) muted = patch.muted_until = null;
        }
        continue;
      }

      if (!crossedUp) continue;
      const until = a.duration_ms ? now + a.duration_ms : null;
      switch (a.action) {
        case 'watch':
          patch.is_watched = 1;
          break;
        case 'moderate':
          if (until && moderated !== WHILE_ABOVE_UNTIL) moderated = patch.moderated_until = Math.max(moderated ?? 0, until);
          break;
        case 'mute':
          if (until && muted !== WHILE_ABOVE_UNTIL) muted = patch.muted_until = Math.max(muted ?? 0, until);
          break;
        case 'temp_ban':
          await this.bans.create(
            {
              name: `Uyarı puanı eşiği (${t}) — ${user.username}`,
              reasonPublic: 'Uyarı puanınız izin verilen sınırı aştı.',
              notesPrivate: warningId ? `Uyarı #${warningId} ile otomatik oluşturuldu.` : null,
              cannotAccess: false,
              cannotLogin: true,
              cannotRegister: false,
              cannotPost: true,
              expiresAt: until,
              triggers: [{ type: 'user', value: String(user.id) }],
            },
            null,
            'warning',
            warningId,
          );
          break;
      }
      await this.db.q
        .insertInto('warning_action_applications')
        .values({ user_id: user.id, action_id: a.id, warning_id: warningId, applied_at: now, expires_at: until })
        .execute();
    }
    if (Object.keys(patch).length) await this.db.q.updateTable('users').set(patch).where('id', '=', user.id).execute();
  }

  async expireWarnings(): Promise<number> {
    const now = this.clock.now();
    const rows = await this.db.q
      .selectFrom('user_warnings')
      .select(['id', 'user_id'])
      .where('expires_at', '<=', now)
      .where('expired_at', 'is', null)
      .where('revoked_at', 'is', null)
      .execute();
    if (!rows.length) return 0;
    await this.db.tx(async () => {
      await this.db.q.updateTable('user_warnings').set({ expired_at: now }).where('id', 'in', rows.map((r) => r.id)).execute();
      for (const userId of new Set(rows.map((r) => r.user_id))) await this.recompute(userId, null);
    });
    return rows.length;
  }

  async forUser(userId: number, includeStaffFields: boolean) {
    const now = this.clock.now();
    const rows = await this.db.q.selectFrom('user_warnings').selectAll().where('user_id', '=', userId).orderBy('created_at', 'desc').execute();
    const issuers = await this.users.summaries(rows.map((r) => r.issued_by ?? 0));
    return rows.map((w) => ({
      id: w.id,
      points: w.points,
      reason: w.reason,
      messageToUser: w.message_to_user,
      createdAt: w.created_at,
      expiresAt: w.expires_at,
      isActive: !w.revoked_at && !w.expired_at && (!w.expires_at || w.expires_at > now),
      revokedAt: w.revoked_at,
      issuedBy: w.issued_by ? (issuers.get(w.issued_by) ?? null) : null,
      ...(includeStaffFields ? { notes: w.notes, revokeReason: w.revoke_reason, templateId: w.template_id } : {}),
    }));
  }

  async status(userId: number) {
    const user = await this.users.findById(userId);
    if (!user) throw Errors.notFound('Üye bulunamadı.');
    const now = this.clock.now();
    return {
      points: user.warning_points,
      maxPoints: this.settings.get('warnings.maxPoints'),
      watched: bool(user.is_watched),
      moderatedUntil: user.moderated_until && user.moderated_until > now ? user.moderated_until : null,
      mutedUntil: user.muted_until && user.muted_until > now ? user.muted_until : null,
      whileAboveUntil: WHILE_ABOVE_UNTIL,
    };
  }

  async recent(page: number, perPage: number) {
    const rows = await this.db.q
      .selectFrom('user_warnings')
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(perPage)
      .offset((page - 1) * perPage)
      .execute();
    const total = await this.db.q.selectFrom('user_warnings').select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst();
    const people = await this.users.summaries(rows.flatMap((r) => [r.user_id, r.issued_by ?? 0]));
    return {
      items: rows.map((w) => ({
        id: w.id,
        user: people.get(w.user_id) ?? null,
        issuedBy: w.issued_by ? (people.get(w.issued_by) ?? null) : null,
        points: w.points,
        reason: w.reason,
        createdAt: w.created_at,
        expiresAt: w.expires_at,
        revokedAt: w.revoked_at,
        expiredAt: w.expired_at,
      })),
      total: Number(total?.n ?? 0),
      page,
      perPage,
    };
  }
}
