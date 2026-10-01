import { Injectable } from '@nestjs/common';
import type { Row } from '@forum/db';
import type { TopicMember } from '@forum/shared';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestViewer } from '../common/request-context.js';
import { ForumAccessService, type BoardAccess } from './forum-access.service.js';
import { ForumCountersService } from './forum-counters.service.js';
import { PostsService, topicSlug } from './posts.service.js';
import { TopicExtrasService } from './topic-extras.service.js';
import { UsersService } from '../users/users.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export type TopicFlag = 'pin' | 'unpin' | 'lock' | 'unlock' | 'feature' | 'unfeature' | 'hide' | 'unhide';

/** Konu moderasyonu: sabitleme, kilitleme, öne çıkarma, taşıma, birleştirme, silme, onay. */
@Injectable()
export class ModerationService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly access: ForumAccessService,
    private readonly counters: ForumCountersService,
    private readonly posts: PostsService,
    private readonly extras: TopicExtrasService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  private async load(viewer: RequestViewer, topicId: number): Promise<{ topic: Row<'topics'>; access: BoardAccess }> {
    const topic = await this.posts.requireTopic(topicId);
    const access = await this.access.require(viewer, topic.board_id);
    await this.posts.assertTopicVisible(viewer, access, topic);
    return { topic, access };
  }

  private log(viewer: RequestViewer, action: string, topicId: number, data?: Record<string, unknown>) {
    return this.audit.log({ type: 'moderation', action, actorId: viewer.user!.id, targetType: 'topic', targetId: topicId, ip: viewer.ip, data });
  }

  async setFlag(viewer: RequestViewer, topicId: number, flag: TopicFlag): Promise<void> {
    const { topic, access } = await this.load(viewer, topicId);
    const own = !!viewer.user && topic.user_id === viewer.user.id;
    const allowed =
      flag === 'hide' || flag === 'unhide'
        ? access.can.approve
        : flag === 'pin' || flag === 'unpin' || flag === 'feature' || flag === 'unfeature'
          ? access.can.pin
          : access.can.lock || (own && access.perms.has('topic.lock.own'));
    if (!allowed) throw Errors.forbidden();
    const patch =
      flag === 'hide' || flag === 'unhide'
        ? { is_hidden: flag === 'hide' ? 1 : 0 }
        : flag === 'pin' || flag === 'unpin'
          ? { is_pinned: flag === 'pin' ? 1 : 0 }
          : flag === 'lock' || flag === 'unlock'
            ? { is_locked: flag === 'lock' ? 1 : 0 }
            : { is_featured: flag === 'feature' ? 1 : 0 };
    await this.db.q.updateTable('topics').set(patch).where('id', '=', topicId).execute();
    // Gizlilik değişince bölümün "son mesaj" bilgisi yeniden hesaplanır
    if (flag === 'hide' || flag === 'unhide') await this.counters.recountBoard(topic.board_id);
    await this.log(viewer, `topic.${flag}`, topicId);
  }

  async edit(viewer: RequestViewer, topicId: number, input: { title?: string; prefixId?: number | null }): Promise<void> {
    const { topic, access } = await this.load(viewer, topicId);
    if (!access.can.editTopic) throw Errors.forbidden();
    const patch: { title?: string; slug?: string; prefix_id?: number | null; updated_at: number } = { updated_at: this.clock.now() };
    if (input.title !== undefined) {
      patch.title = input.title;
      patch.slug = topicSlug(input.title);
    }
    // Önek bölüme ve grup kısıtına göre doğrulanır
    if (input.prefixId !== undefined) patch.prefix_id = await this.posts.checkPrefix(topic.board_id, input.prefixId);
    await this.db.q.updateTable('topics').set(patch).where('id', '=', topicId).execute();
    await this.log(viewer, 'topic.edit', topicId, { from: topic.title, to: input.title ?? topic.title });
  }

  async move(viewer: RequestViewer, topicId: number, targetBoardId: number, leaveRedirect: boolean): Promise<void> {
    const { topic, access } = await this.load(viewer, topicId);
    if (!access.can.move) throw Errors.forbidden();
    if (topic.moved_to_topic_id) throw Errors.badRequest('Taşıma bağlantısı taşınamaz.');
    if (targetBoardId === topic.board_id) throw Errors.field('boardId', 'Konu zaten bu bölümde.');
    const target = await this.access.access(viewer, targetBoardId);
    if (!target || target.board.type !== 'forum') throw Errors.field('boardId', 'Hedef bölüm bulunamadı.');
    // Hedef bölümde konu açma ya da taşıma (moderasyon) yetkisi olmalı: duyuru bölümlerine izinsiz konu itilemez
    if (!target.can.createTopic && !target.can.move) throw Errors.forbidden('Hedef bölüme konu taşıma yetkiniz yok.');
    const now = this.clock.now();
    await this.db.tx(async () => {
      // Mesaj sayısı politikası farklı bölümler arasında yazar sayaçlarını düzelt.
      if (topic.is_approved && !topic.deleted_at && access.board.count_posts !== target.board.count_posts) {
        await this.posts.adjustTopicAuthors(topic.id, access.board, -1);
        await this.posts.adjustTopicAuthors(topic.id, target.board, 1);
      }
      await this.db.q.updateTable('topics').set({ board_id: targetBoardId, updated_at: now }).where('id', '=', topicId).execute();
      await this.db.q.updateTable('posts').set({ board_id: targetBoardId }).where('topic_id', '=', topicId).execute();
      if (leaveRedirect) {
        await this.db.q
          .insertInto('topics')
          .values({
            board_id: topic.board_id,
            title: topic.title,
            slug: topic.slug,
            prefix_id: topic.prefix_id,
            user_id: topic.user_id,
            author_name: topic.author_name,
            last_post_at: topic.last_post_at,
            last_poster_id: topic.last_poster_id,
            last_poster_name: topic.last_poster_name,
            is_locked: 1,
            moved_to_topic_id: topicId,
            created_at: topic.created_at,
            updated_at: now,
          })
          .execute();
      }
      await this.counters.recountBoard(topic.board_id);
      await this.counters.recountBoard(targetBoardId);
    });
    await this.log(viewer, 'topic.move', topicId, { from: topic.board_id, to: targetBoardId });
  }

  /** Bu konunun mesajlarını hedef konuya taşır; bu konu hedefe yönlendiren bir bağlantıya dönüşür. */
  async merge(viewer: RequestViewer, topicId: number, targetTopicId: number): Promise<void> {
    if (topicId === targetTopicId) throw Errors.field('targetTopicId', 'Bir konu kendisiyle birleştirilemez.');
    const { topic, access } = await this.load(viewer, topicId);
    if (!access.can.merge) throw Errors.forbidden();
    const target = await this.load(viewer, targetTopicId).catch(() => null);
    if (!target || target.topic.moved_to_topic_id) throw Errors.field('targetTopicId', 'Hedef konu bulunamadı.');
    if (!target.access.can.merge) throw Errors.field('targetTopicId', 'Hedef konunun bölümünde birleştirme yetkiniz yok.');
    const now = this.clock.now();
    await this.db.tx(async () => {
      if (topic.is_approved && !topic.deleted_at && access.board.count_posts !== target.access.board.count_posts) {
        await this.posts.adjustTopicAuthors(topic.id, access.board, -1);
        await this.posts.adjustTopicAuthors(topic.id, target.access.board, 1);
      }
      await this.db.q
        .updateTable('posts')
        .set({ topic_id: targetTopicId, board_id: target.topic.board_id })
        .where('topic_id', '=', topicId)
        .execute();
      await this.db.q.deleteFrom('topic_reads').where('topic_id', '=', topicId).execute();
      await this.db.q
        .updateTable('topics')
        .set({ moved_to_topic_id: targetTopicId, is_locked: 1, first_post_id: null, last_post_id: null, reply_count: 0, updated_at: now })
        .where('id', '=', topicId)
        .execute();
      await this.counters.recountTopic(targetTopicId);
      await this.counters.recountBoard(topic.board_id);
      if (target.topic.board_id !== topic.board_id) await this.counters.recountBoard(target.topic.board_id);
    });
    await this.log(viewer, 'topic.merge', topicId, { into: targetTopicId });
  }

  async delete(viewer: RequestViewer, topicId: number): Promise<void> {
    const { topic, access } = await this.load(viewer, topicId);
    if (!access.can.deleteTopic) throw Errors.forbidden();
    if (topic.deleted_at) return;
    await this.posts.deleteTopicInternal(topic, viewer.user!.id);
    await this.log(viewer, 'topic.delete', topicId, { title: topic.title });
  }

  async restore(viewer: RequestViewer, topicId: number): Promise<void> {
    const { topic, access } = await this.load(viewer, topicId);
    if (!access.can.deleteTopic || !access.can.viewDeleted) throw Errors.forbidden();
    if (!topic.deleted_at) return;
    await this.posts.restoreTopicInternal(topic);
    await this.log(viewer, 'topic.restore', topicId);
  }

  async approve(viewer: RequestViewer, topicId: number): Promise<void> {
    const { topic, access } = await this.load(viewer, topicId);
    if (!access.can.approve) throw Errors.forbidden();
    if (topic.is_approved || !topic.first_post_id) return;
    await this.posts.approve(viewer, topic.first_post_id);
  }

  // ---------- Gizli konu üyeleri ----------

  /** Yetkililerin gizli konuya eklediği üyeler */
  async members(viewer: RequestViewer, topicId: number): Promise<TopicMember[]> {
    const { access } = await this.load(viewer, topicId);
    if (!access.can.approve) throw Errors.forbidden();
    const rows = await this.db.q.selectFrom('topic_members').selectAll().where('topic_id', '=', topicId).orderBy('created_at').execute();
    const users = await this.users.summaries(rows.flatMap((r) => [r.user_id, r.added_by ?? 0]));
    return rows
      .filter((r) => users.has(r.user_id))
      .map((r) => ({ user: users.get(r.user_id)!, addedBy: r.added_by ? (users.get(r.added_by) ?? null) : null, addedAt: r.created_at }));
  }

  /** Üyeyi gizli konuya ekler: konuyu görür, takibe alınır ve bildirim alır. */
  async addMember(viewer: RequestViewer, topicId: number, userId: number): Promise<void> {
    const { topic, access } = await this.load(viewer, topicId);
    if (!access.can.approve) throw Errors.forbidden();
    const user = await this.db.q.selectFrom('users').select(['id', 'status']).where('id', '=', userId).where('deleted_at', 'is', null).executeTakeFirst();
    if (!user || user.status !== 'active') throw Errors.field('userId', 'Üye bulunamadı.');
    if (topic.user_id === userId) throw Errors.field('userId', 'Konunun yazarı zaten görebilir.');
    const exists = await this.posts.isTopicMember(topicId, userId);
    if (exists) return;
    await this.db.q.insertInto('topic_members').values({ topic_id: topicId, user_id: userId, added_by: viewer.user!.id, created_at: this.clock.now() }).execute();
    if (!(await this.posts.userCanSeeTopic(userId, access.board, topicId))) {
      // Bölümü göremeyen üye eklenemez (bölüm yetkisi gizli konudan önce gelir)
      await this.db.q.deleteFrom('topic_members').where('topic_id', '=', topicId).where('user_id', '=', userId).execute();
      throw Errors.field('userId', 'Bu üye konunun bulunduğu bölümü göremiyor.');
    }
    await this.extras.setSubscribed(userId, topicId, true);
    await this.notifications.notify(userId, 'forum.topicAccess', { topicId, topicTitle: topic.title, actorName: viewer.user!.display_name }, viewer.user!.id);
    await this.log(viewer, 'topic.member.add', topicId, { userId });
  }

  async removeMember(viewer: RequestViewer, topicId: number, userId: number): Promise<void> {
    const { access } = await this.load(viewer, topicId);
    if (!access.can.approve) throw Errors.forbidden();
    await this.db.q.deleteFrom('topic_members').where('topic_id', '=', topicId).where('user_id', '=', userId).execute();
    await this.extras.setSubscribed(userId, topicId, false);
    await this.log(viewer, 'topic.member.remove', topicId, { userId });
  }
}
