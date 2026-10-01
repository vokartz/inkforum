import { Injectable } from '@nestjs/common';
import {
  bbcodeExcerpt,
  type ConversationDetail,
  type ConversationListItem,
  type ConversationMessage,
  type NewConversationInput,
  type Paginated,
} from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock, HOUR } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import { PostRenderService } from '../forum/post-render.service.js';
import { PostsService } from '../forum/posts.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { privacySchema, DEFAULT_PRIVACY } from '../profiles/profiles.schemas.js';
import { fromJsonSchema } from '../database/json.js';
import { unreadConversationCount } from './unread.js';
import { can, type RequestViewer } from '../common/request-context.js';

const LIST_PER_PAGE = 20;
const MESSAGES_PER_PAGE = 25;

@Injectable()
export class MessagesService {
  /** Üye başına son mesaj zamanı (sel koruması; bellekte). */
  private readonly lastSentAt = new Map<number, number>();

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly render: PostRenderService,
    private readonly posts: PostsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Yönetim ve moderatörler sınırlara ve "mesaj kabul etmiyorum" ayarına takılmaz. */
  private isStaff(viewer: RequestViewer): boolean {
    return viewer.isAdmin || can(viewer, 'mod.warnings.issue');
  }

  /** Yazma engeli (kapalı sistem, yetki, susturma, yasak). */
  async blockReason(viewer: RequestViewer): Promise<string | null> {
    if (!viewer.user) return 'Özel mesaj için giriş yapmalısınız.';
    if (!this.settings.get('messages.enabled') && !this.isStaff(viewer)) return 'Özel mesajlar şu anda kapalı.';
    if (!can(viewer, 'messages.send')) return 'Özel mesaj gönderme yetkiniz yok.';
    return this.posts.postingBlockReason(viewer);
  }

  private async assertCanWrite(viewer: RequestViewer, body: string): Promise<Row<'users'>> {
    const reason = await this.blockReason(viewer);
    if (reason) throw viewer.user ? Errors.forbidden(reason) : Errors.unauthenticated(reason);
    const max = this.settings.get('messages.maxLength');
    if (body.length > max) throw Errors.field('body', `Mesaj en fazla ${max.toLocaleString('tr-TR')} karakter olabilir.`);
    const flood = this.settings.get('messages.floodSeconds');
    if (flood > 0 && !this.isStaff(viewer)) {
      const last = this.lastSentAt.get(viewer.user!.id);
      const wait = last ? Math.ceil((last + flood * 1000 - this.clock.now()) / 1000) : 0;
      if (wait > 0) throw Errors.badRequest(`Çok hızlı mesaj gönderiyorsunuz. ${wait} saniye sonra tekrar deneyin.`);
    }
    return viewer.user!;
  }

  /** Alıcıların mesaj kabul edip etmediğini denetler; kabul etmeyenlerin adlarını döner. */
  private async checkRecipients(viewer: RequestViewer, ids: number[]): Promise<void> {
    const rows = await this.db.q
      .selectFrom('users')
      .leftJoin('user_profiles', 'user_profiles.user_id', 'users.id')
      .select(['users.id', 'users.display_name', 'users.status', 'users.deleted_at', 'user_profiles.privacy_json'])
      .where('users.id', 'in', ids)
      .execute();
    if (rows.length !== ids.length) throw Errors.field('recipientIds', 'Alıcılardan biri bulunamadı.');
    const staff = this.isStaff(viewer);
    for (const r of rows) {
      if (r.deleted_at || r.status !== 'active') throw Errors.field('recipientIds', `${r.display_name} mesaj alamıyor.`);
      const privacy = fromJsonSchema(privacySchema, r.privacy_json, DEFAULT_PRIVACY);
      if (privacy.allowMessages === 'nobody' && !staff) throw Errors.field('recipientIds', `${r.display_name} özel mesaj kabul etmiyor.`);
    }
  }

  private async addMessage(conversationId: number, user: Row<'users'>, body: string): Promise<number> {
    const now = this.clock.now();
    const html = this.render.post(body).html;
    const msg = await this.db.q
      .insertInto('conversation_messages')
      .values({ conversation_id: conversationId, user_id: user.id, author_name: user.display_name, body_bbcode: body, body_html: html, created_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.db.q
      .updateTable('conversations')
      .set((eb) => ({ last_message_id: msg.id, last_message_at: now, last_message_user_id: user.id, message_count: eb('message_count', '+', 1) }))
      .where('id', '=', conversationId)
      .execute();
    await this.db.q
      .updateTable('conversation_participants')
      .set({ last_read_message_id: msg.id })
      .where('conversation_id', '=', conversationId)
      .where('user_id', '=', user.id)
      .execute();
    this.lastSentAt.set(user.id, now);
    return msg.id;
  }

  /** Yeni konuşma başlatır. */
  async create(viewer: RequestViewer, input: NewConversationInput): Promise<{ id: number }> {
    const user = await this.assertCanWrite(viewer, input.body);
    const recipients = [...new Set(input.recipientIds)].filter((id) => id !== user.id);
    if (!recipients.length) throw Errors.field('recipientIds', 'Kendinize mesaj gönderemezsiniz; en az bir alıcı seçin.');
    const max = this.settings.get('messages.maxRecipients');
    if (recipients.length > max && !this.isStaff(viewer)) throw Errors.field('recipientIds', `En fazla ${max} alıcı seçebilirsiniz.`);
    if (!this.isStaff(viewer)) {
      const since = this.clock.now() - HOUR;
      const recent = await this.db.q
        .selectFrom('conversations')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('created_by', '=', user.id)
        .where('created_at', '>=', since)
        .executeTakeFirst();
      if (Number(recent?.n ?? 0) >= this.settings.get('messages.newPerHour')) throw Errors.badRequest('Bir saat içinde çok fazla yeni konuşma başlattınız. Biraz sonra tekrar deneyin.');
    }
    await this.checkRecipients(viewer, recipients);

    const now = this.clock.now();
    let id = 0;
    await this.db.tx(async () => {
      const conv = await this.db.q
        .insertInto('conversations')
        .values({ title: input.title || null, created_by: user.id, last_message_at: now, created_at: now })
        .returning('id')
        .executeTakeFirstOrThrow();
      id = conv.id;
      for (const uid of [user.id, ...recipients]) {
        await this.db.q.insertInto('conversation_participants').values({ conversation_id: id, user_id: uid, joined_at: now }).execute();
      }
      await this.addMessage(id, user, input.body);
    });
    this.db.afterCommit(() => this.emailRecipients(recipients, user.display_name, input.title || null, id));
    return { id };
  }

  /** Özel mesaj e-postası (üye tercihine bağlı). */
  private async emailRecipients(userIds: number[], actorName: string, title: string | null, conversationId: number): Promise<void> {
    for (const uid of userIds) {
      await this.notifications.emailOnly(uid, 'message.new', { actorName, title: title ?? 'Yeni konuşma', conversationId });
    }
  }

  private async participant(viewer: RequestViewer, id: number): Promise<{ conv: Row<'conversations'>; me: Row<'conversation_participants'> }> {
    if (!viewer.user) throw Errors.unauthenticated();
    const [conv, me] = await Promise.all([
      this.db.q.selectFrom('conversations').selectAll().where('id', '=', id).executeTakeFirst(),
      this.db.q.selectFrom('conversation_participants').selectAll().where('conversation_id', '=', id).where('user_id', '=', viewer.user.id).executeTakeFirst(),
    ]);
    if (!conv || !me || me.left_at) throw Errors.notFound('Konuşma bulunamadı.');
    return { conv, me };
  }

  async reply(viewer: RequestViewer, id: number, body: string): Promise<{ messageId: number }> {
    const { conv } = await this.participant(viewer, id);
    const user = await this.assertCanWrite(viewer, body);
    const others = await this.db.q
      .selectFrom('conversation_participants')
      .select('user_id')
      .where('conversation_id', '=', conv.id)
      .where('left_at', 'is', null)
      .where('user_id', '!=', user.id)
      .execute();
    if (!others.length) throw Errors.badRequest('Konuşmada sizden başka katılımcı kalmadı.');
    // Konuşmayı okumuş (güncel) katılımcılara e-posta; okunmamış mesajı olanlara tekrar gönderilmez.
    const caughtUp = await this.db.q
      .selectFrom('conversation_participants')
      .select('user_id')
      .where('conversation_id', '=', conv.id)
      .where('left_at', 'is', null)
      .where('user_id', '!=', user.id)
      .where('last_read_message_id', '>=', conv.last_message_id ?? 0)
      .execute();
    let messageId = 0;
    await this.db.tx(async () => {
      messageId = await this.addMessage(conv.id, user, body);
    });
    if (caughtUp.length) this.db.afterCommit(() => this.emailRecipients(caughtUp.map((r) => r.user_id), user.display_name, conv.title, conv.id));
    return { messageId };
  }

  /** Gelen kutusu: son mesaja göre. */
  async list(viewer: RequestViewer, page: number): Promise<Paginated<ConversationListItem>> {
    if (!viewer.user) throw Errors.unauthenticated();
    const uid = viewer.user.id;
    const base = this.db.q
      .selectFrom('conversation_participants as p')
      .innerJoin('conversations as c', 'c.id', 'p.conversation_id')
      .where('p.user_id', '=', uid)
      .where('p.left_at', 'is', null);
    const [rows, total] = await Promise.all([
      base
        .select(['c.id', 'c.title', 'c.last_message_id', 'c.last_message_at', 'c.last_message_user_id', 'c.message_count', 'p.last_read_message_id'])
        .orderBy('c.last_message_at', 'desc')
        .limit(LIST_PER_PAGE)
        .offset((page - 1) * LIST_PER_PAGE)
        .execute(),
      base.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
    ]);
    const ids = rows.map((r) => r.id);
    const [parts, lasts] = await Promise.all([
      ids.length
        ? this.db.q.selectFrom('conversation_participants').select(['conversation_id', 'user_id']).where('conversation_id', 'in', ids).where('left_at', 'is', null).execute()
        : Promise.resolve([]),
      ids.length
        ? this.db.q.selectFrom('conversation_messages').select(['id', 'user_id', 'author_name', 'body_bbcode']).where('id', 'in', rows.map((r) => r.last_message_id ?? 0)).execute()
        : Promise.resolve([]),
    ]);
    const people = await this.users.summaries([...parts.map((p) => p.user_id), ...lasts.map((l) => l.user_id ?? 0)]);
    const lastById = new Map(lasts.map((l) => [l.id, l]));
    return {
      items: rows.map((r) => {
        const others = parts.filter((p) => p.conversation_id === r.id && p.user_id !== uid);
        const last = r.last_message_id ? lastById.get(r.last_message_id) : undefined;
        return {
          id: r.id,
          title: r.title,
          participants: others.slice(0, 5).map((p) => people.get(p.user_id)).filter((u) => !!u) as ConversationListItem['participants'],
          participantCount: others.length + 1,
          lastMessage: last
            ? { author: last.user_id ? (people.get(last.user_id) ?? null) : null, authorName: last.author_name, excerpt: bbcodeExcerpt(last.body_bbcode, 120), at: r.last_message_at }
            : null,
          unread: !!r.last_message_id && r.last_message_id > r.last_read_message_id && r.last_message_user_id !== uid,
          messageCount: r.message_count,
        };
      }),
      total: Number(total?.n ?? 0),
      page,
      perPage: LIST_PER_PAGE,
    };
  }

  /** Konuşma ayrıntısı; varsayılan olarak son sayfa. Görüntülenince okundu sayılır. */
  async detail(viewer: RequestViewer, id: number, pageInput: number | 'last'): Promise<ConversationDetail> {
    const { conv } = await this.participant(viewer, id);
    const uid = viewer.user!.id;
    const total = conv.message_count;
    const lastPage = Math.max(1, Math.ceil(total / MESSAGES_PER_PAGE));
    const page = pageInput === 'last' ? lastPage : Math.min(Math.max(1, pageInput), lastPage);
    const [rows, parts] = await Promise.all([
      this.db.q
        .selectFrom('conversation_messages')
        .selectAll()
        .where('conversation_id', '=', id)
        .where('deleted_at', 'is', null)
        .orderBy('id')
        .limit(MESSAGES_PER_PAGE)
        .offset((page - 1) * MESSAGES_PER_PAGE)
        .execute(),
      this.db.q.selectFrom('conversation_participants').selectAll().where('conversation_id', '=', id).orderBy('joined_at').execute(),
    ]);
    const people = await this.users.summaries([...parts.map((p) => p.user_id), ...rows.map((r) => r.user_id ?? 0)]);

    if (conv.last_message_id) {
      await this.db.q
        .updateTable('conversation_participants')
        .set({ last_read_message_id: conv.last_message_id })
        .where('conversation_id', '=', id)
        .where('user_id', '=', uid)
        .execute();
    }
    const blocked = await this.blockReason(viewer);
    const active = parts.filter((p) => !p.left_at);
    const replyBlockedReason = blocked ?? (active.length < 2 ? 'Konuşmada sizden başka katılımcı kalmadı.' : null);
    const messages: ConversationMessage[] = rows.map((r) => ({
      id: r.id,
      author: r.user_id ? (people.get(r.user_id) ?? null) : null,
      authorName: r.author_name,
      html: r.body_html,
      createdAt: r.created_at,
      isMine: r.user_id === uid,
    }));
    return {
      id: conv.id,
      title: conv.title,
      participants: parts
        .filter((p) => people.has(p.user_id))
        .map((p) => ({ user: people.get(p.user_id)!, isCreator: p.user_id === conv.created_by, leftAt: p.left_at, lastReadMessageId: p.last_read_message_id })),
      messages: { items: messages, total, page, perPage: MESSAGES_PER_PAGE },
      can: { reply: !replyBlockedReason, invite: conv.created_by === uid && !blocked },
      replyBlockedReason,
      limits: { maxLength: this.settings.get('messages.maxLength'), maxRecipients: this.settings.get('messages.maxRecipients') },
    };
  }

  /** Konuşmaya üye ekler (yalnız başlatan). Ayrılmış üye yeniden eklenebilir. */
  async invite(viewer: RequestViewer, id: number, userIds: number[]): Promise<void> {
    const { conv } = await this.participant(viewer, id);
    if (conv.created_by !== viewer.user!.id) throw Errors.forbidden('Yalnızca konuşmayı başlatan üye katılımcı ekleyebilir.');
    const reason = await this.blockReason(viewer);
    if (reason) throw Errors.forbidden(reason);
    const parts = await this.db.q.selectFrom('conversation_participants').selectAll().where('conversation_id', '=', id).execute();
    const active = new Set(parts.filter((p) => !p.left_at).map((p) => p.user_id));
    const adding = [...new Set(userIds)].filter((u) => !active.has(u));
    if (!adding.length) return;
    if (active.size - 1 + adding.length > this.settings.get('messages.maxRecipients') && !this.isStaff(viewer)) {
      throw Errors.field('userIds', `Bir konuşmada en fazla ${this.settings.get('messages.maxRecipients')} alıcı olabilir.`);
    }
    await this.checkRecipients(viewer, adding);
    const now = this.clock.now();
    await this.db.tx(async () => {
      for (const u of adding) {
        if (parts.some((p) => p.user_id === u)) {
          await this.db.q.updateTable('conversation_participants').set({ left_at: null, joined_at: now }).where('conversation_id', '=', id).where('user_id', '=', u).execute();
        } else {
          await this.db.q.insertInto('conversation_participants').values({ conversation_id: id, user_id: u, joined_at: now }).execute();
        }
      }
    });
  }

  /** Konuşmadan ayrıl; herkes ayrıldıysa konuşma silinir. */
  async leave(viewer: RequestViewer, id: number): Promise<void> {
    await this.participant(viewer, id);
    await this.db.tx(async () => {
      await this.db.q
        .updateTable('conversation_participants')
        .set({ left_at: this.clock.now() })
        .where('conversation_id', '=', id)
        .where('user_id', '=', viewer.user!.id)
        .execute();
      const remaining = await this.db.q
        .selectFrom('conversation_participants')
        .select('user_id')
        .where('conversation_id', '=', id)
        .where('left_at', 'is', null)
        .executeTakeFirst();
      if (!remaining) {
        await this.db.q.deleteFrom('conversation_messages').where('conversation_id', '=', id).execute();
        await this.db.q.deleteFrom('conversation_participants').where('conversation_id', '=', id).execute();
        await this.db.q.deleteFrom('conversations').where('id', '=', id).execute();
      }
    });
  }

  /** Okunmamış konuşma sayısı. */
  unreadCount(userId: number): Promise<number> {
    return unreadConversationCount(this.db, userId);
  }
}
