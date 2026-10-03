import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Db } from '../database/db.service.js';
import { Clock, DAY } from '../common/clock.js';
import { fromJson, toJson } from '../database/json.js';
import { JobsService } from '../jobs/jobs.service.js';
import { MailService } from '../mail/mail.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { EMAIL_NOTIFICATION_DEFAULTS, type MailTemplateKey } from '@forum/shared';
import { RealtimeService } from '../realtime/realtime.service.js';

export type NotificationType =
  | 'warning.issued'
  | 'warning.revoked'
  | 'achievement.awarded'
  | 'group.added'
  | 'group.removed'
  | 'group.request.new'
  | 'group.request.approved'
  | 'group.request.rejected'
  | 'account.approved'
  | 'system.message'
  | 'forum.quote'
  | 'forum.mention'
  | 'forum.postApproved'
  | 'forum.topicAccess'
  | 'forum.reaction'
  | 'forum.reply'
  | 'application.new'
  | 'application.decided'
  | 'application.note'
  | 'ticket.new'
  | 'ticket.reply'
  | 'ticket.status'
  | 'system.update'
  | 'system.updated';

const EMAIL_TEMPLATES: Record<string, MailTemplateKey | undefined> = {
  'forum.quote': 'notifyQuote',
  'forum.mention': 'notifyMention',
  'forum.reply': 'notifyReply',
  'message.new': 'notifyMessage',
};

export const NOTIFICATION_TYPES: Array<{ type: NotificationType; label: string }> = [
  { type: 'warning.issued', label: 'Bana uyarı verildiğinde' },
  { type: 'warning.revoked', label: 'Bir uyarım geri alındığında' },
  { type: 'achievement.awarded', label: 'Yeni bir başarı kazandığımda' },
  { type: 'group.added', label: 'Bir gruba eklendiğimde' },
  { type: 'group.removed', label: 'Bir gruptan çıkarıldığımda' },
  { type: 'group.request.new', label: 'Yönettiğim gruba katılım isteği geldiğinde' },
  { type: 'group.request.approved', label: 'Grup katılım isteğim onaylandığında' },
  { type: 'group.request.rejected', label: 'Grup katılım isteğim reddedildiğinde' },
  { type: 'forum.quote', label: 'Mesajım alıntılandığında' },
  { type: 'forum.mention', label: 'Bir mesajda benden bahsedildiğinde' },
  { type: 'forum.postApproved', label: 'Onay bekleyen mesajım onaylandığında' },
  { type: 'forum.topicAccess', label: 'Gizli bir konuya eklendiğimde' },
  { type: 'forum.reaction', label: 'Mesajıma tepki verildiğinde' },
  { type: 'forum.reply', label: 'Takip ettiğim konuya yanıt yazıldığında' },
  { type: 'application.decided', label: 'Başvurum sonuçlandığında' },
  { type: 'application.note', label: 'Başvuruma yanıt yazıldığında' },
  { type: 'application.new', label: 'İnceleyebildiğim bir forma yeni başvuru geldiğinde' },
  { type: 'ticket.reply', label: 'Destek talebime yanıt yazıldığında' },
  { type: 'ticket.status', label: 'Destek talebimin durumu değiştiğinde' },
  { type: 'ticket.new', label: 'Sorumlu olduğum kategoride yeni destek talebi açıldığında' },
];

export interface NotificationDto {
  id: number;
  type: string;
  actorId: number | null;
  data: Record<string, unknown>;
  readAt: number | null;
  createdAt: number;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly jobs: JobsService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit(): void {
    this.jobs.schedule('notifications.prune', DAY, () => this.prune());
  }

  async notify(userId: number, type: NotificationType, data: Record<string, unknown>, actorId: number | null = null): Promise<void> {
    const pref = await this.db.q
      .selectFrom('notification_preferences')
      .select('enabled')
      .where('user_id', '=', userId)
      .where('type', '=', type)
      .where('channel', '=', 'web')
      .executeTakeFirst();
    if (pref && pref.enabled === 0) return;
    await this.db.q
      .insertInto('notifications')
      .values({ user_id: userId, type, actor_id: actorId, data_json: toJson(data), created_at: this.clock.now() })
      .execute();
    await this.db.q
      .updateTable('users')
      .set((eb) => ({ unread_notifications: eb('unread_notifications', '+', 1) }))
      .where('id', '=', userId)
      .execute();
    this.db.afterCommit(() => this.realtime.publish(userId, { type: 'notification', notificationType: type }));
    if (EMAIL_TEMPLATES[type]) {
      try {
        await this.email(userId, type, data);
      } catch {
      }
    }
  }

  async emailOnly(userId: number, type: 'message.new', data: Record<string, unknown>): Promise<void> {
    try {
      await this.email(userId, type, data);
    } catch {
    }
  }

  private async emailEnabled(userId: number, type: string): Promise<boolean> {
    if (!this.settings.get('email.notifications')) return false;
    const pref = await this.db.q
      .selectFrom('notification_preferences')
      .select('enabled')
      .where('user_id', '=', userId)
      .where('type', '=', type)
      .where('channel', '=', 'email')
      .executeTakeFirst();
    return pref ? pref.enabled === 1 : (EMAIL_NOTIFICATION_DEFAULTS[type] ?? false);
  }

  private async email(userId: number, type: string, data: Record<string, unknown>): Promise<void> {
    const template = EMAIL_TEMPLATES[type];
    if (!template || !(await this.emailEnabled(userId, type))) return;
    const user = await this.db.q
      .selectFrom('users')
      .select(['email', 'display_name', 'status', 'email_verified_at', 'locale'])
      .where('id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!user || user.status !== 'active' || !user.email_verified_at) return;
    if (type === 'forum.reply') {
      const unread = await this.db.q
        .selectFrom('notifications')
        .select('data_json')
        .where('user_id', '=', userId)
        .where('type', '=', 'forum.reply')
        .where('read_at', 'is', null)
        .orderBy('id', 'desc')
        .limit(50)
        .execute();
      const same = unread.filter((n) => fromJson<{ topicId?: number }>(n.data_json, {}).topicId === data.topicId);
      if (same.length > 1) return;
    }
    const url = data.postId ? this.mail.url(`/p/${String(data.postId)}`) : data.conversationId ? this.mail.url(`/messages/${String(data.conversationId)}`) : this.mail.url('/');
    const content = await this.mail.compose(template, {
      name: user.display_name,
      actorName: String(data.actorName ?? ''),
      topicTitle: String(data.topicTitle ?? ''),
      title: String(data.title ?? ''),
      url,
      settingsUrl: this.mail.url('/settings/notifications'),
    }, user.locale);
    await this.mail.send(user.email, content);
  }

  async list(userId: number, page: number, perPage: number, unreadOnly = false) {
    let q = this.db.q.selectFrom('notifications').where('user_id', '=', userId);
    if (unreadOnly) q = q.where('read_at', 'is', null);
    const [rows, total] = await Promise.all([
      q.selectAll().orderBy('id', 'desc').limit(perPage).offset((page - 1) * perPage).execute(),
      q.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
    ]);
    const items: NotificationDto[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      actorId: r.actor_id,
      data: fromJson<Record<string, unknown>>(r.data_json, {}),
      readAt: r.read_at,
      createdAt: r.created_at,
    }));
    return { items, total: Number(total?.n ?? 0), page, perPage };
  }

  async markRead(userId: number, ids: number[] | 'all'): Promise<void> {
    await this.db.tx(async () => {
      let q = this.db.q
        .updateTable('notifications')
        .set({ read_at: this.clock.now() })
        .where('user_id', '=', userId)
        .where('read_at', 'is', null);
      if (ids !== 'all') {
        if (!ids.length) return;
        q = q.where('id', 'in', ids);
      }
      await q.execute();
      await this.recount(userId);
    });
    this.realtime.publish(userId, { type: 'counters' });
  }

  async delete(userId: number, id: number): Promise<void> {
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('notifications').where('user_id', '=', userId).where('id', '=', id).execute();
      await this.recount(userId);
    });
  }

  async recount(userId: number): Promise<number> {
    const r = await this.db.q
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .executeTakeFirst();
    const n = Number(r?.n ?? 0);
    await this.db.q.updateTable('users').set({ unread_notifications: n }).where('id', '=', userId).execute();
    return n;
  }

  async preferences(userId: number): Promise<Array<{ type: string; label: string; enabled: boolean | null; email: boolean | null }>> {
    const rows = await this.db.q.selectFrom('notification_preferences').select(['type', 'channel', 'enabled']).where('user_id', '=', userId).execute();
    const web = new Map(rows.filter((r) => r.channel === 'web').map((r) => [r.type, r.enabled === 1]));
    const mail = new Map(rows.filter((r) => r.channel === 'email').map((r) => [r.type, r.enabled === 1]));
    const emailFor = (type: string) => (EMAIL_TEMPLATES[type] ? (mail.get(type) ?? EMAIL_NOTIFICATION_DEFAULTS[type] ?? false) : null);
    return [
      ...NOTIFICATION_TYPES.map((t) => ({ type: t.type, label: t.label, enabled: web.get(t.type) ?? true, email: emailFor(t.type) })),
      { type: 'message.new', label: 'Yeni özel mesaj aldığımda', enabled: null, email: emailFor('message.new') },
    ];
  }

  async setPreferences(userId: number, prefs: Record<string, boolean>): Promise<void> {
    const valid = new Set<string>(NOTIFICATION_TYPES.map((t) => t.type));
    await this.db.tx(async () => {
      for (const [key, enabled] of Object.entries(prefs)) {
        const email = key.startsWith('email:');
        const type = email ? key.slice(6) : key;
        if (email ? !EMAIL_TEMPLATES[type] : !valid.has(type)) continue;
        const channel = email ? 'email' : 'web';
        await this.db.q
          .insertInto('notification_preferences')
          .values({ user_id: userId, type, channel, enabled })
          .onConflict((oc) => oc.columns(['user_id', 'type', 'channel']).doUpdateSet({ enabled }))
          .execute();
      }
    });
  }

  private async prune(): Promise<void> {
    await this.db.q
      .deleteFrom('notifications')
      .where('read_at', 'is not', null)
      .where('created_at', '<', this.clock.now() - 90 * DAY)
      .execute();
  }
}
