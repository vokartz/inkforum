import { Injectable } from '@nestjs/common';
import type { AdminReaction, PostReactionCount, ReactionDef, ReactionUserItem, ReactionsAdminInput } from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { CacheService } from '../cache/cache.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { RequestViewer } from '../common/request-context.js';
import { PostsService } from './posts.service.js';

const NS = 'reactions';

/** Kurulumda gelen tepki seti. */
const DEFAULTS: Array<{ key: string; label: string; emoji: string; points: number }> = [
  { key: 'like', label: 'Beğen', emoji: '👍', points: 1 },
  { key: 'love', label: 'Bayıldım', emoji: '❤️', points: 1 },
  { key: 'haha', label: 'Komik', emoji: '😂', points: 1 },
  { key: 'wow', label: 'Şaşırtıcı', emoji: '😮', points: 1 },
  { key: 'fire', label: 'Efsane', emoji: '🔥', points: 1 },
  { key: 'sad', label: 'Üzücü', emoji: '😢', points: 0 },
  { key: 'angry', label: 'Kızgın', emoji: '😡', points: 0 },
];

@Injectable()
export class ReactionsService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly posts: PostsService,
  ) {}

  private all(): Promise<Row<'reactions'>[]> {
    return this.cache.wrap(NS, 'all', () => this.db.q.selectFrom('reactions').selectAll().orderBy('sort_order').orderBy('id').execute());
  }

  async seedDefaults(): Promise<void> {
    const any = await this.db.q.selectFrom('reactions').select('id').executeTakeFirst();
    if (any) return;
    const now = this.clock.now();
    for (const [i, r] of DEFAULTS.entries()) {
      await this.db.q.insertInto('reactions').values({ ...r, sort_order: i, created_at: now }).execute();
    }
    await this.cache.invalidate(NS);
  }

  /** Etkin tepki seti (konu sayfasına gönderilir). */
  async enabled(): Promise<ReactionDef[]> {
    return (await this.all()).filter((r) => r.is_enabled === 1).map((r) => ({ id: r.id, key: r.key, label: r.label, emoji: r.emoji, points: r.points }));
  }

  /** Mesajların tepki özetleri ve görüntüleyenin kendi tepkileri. */
  async forPosts(viewer: RequestViewer, postIds: number[]): Promise<{ counts: Map<number, PostReactionCount[]>; mine: Map<number, number> }> {
    const counts = new Map<number, PostReactionCount[]>();
    const mine = new Map<number, number>();
    if (!postIds.length) return { counts, mine };
    const [rows, own] = await Promise.all([
      this.db.q
        .selectFrom('post_reactions')
        .select(['post_id', 'reaction_id', (eb) => eb.fn.countAll<number>().as('n')])
        .where('post_id', 'in', postIds)
        .groupBy(['post_id', 'reaction_id'])
        .execute(),
      viewer.user
        ? this.db.q.selectFrom('post_reactions').select(['post_id', 'reaction_id']).where('post_id', 'in', postIds).where('user_id', '=', viewer.user.id).execute()
        : Promise.resolve([]),
    ]);
    for (const r of rows) {
      const list = counts.get(r.post_id) ?? [];
      list.push({ reactionId: r.reaction_id, count: Number(r.n) });
      counts.set(r.post_id, list);
    }
    for (const list of counts.values()) list.sort((a, b) => b.count - a.count);
    for (const r of own) mine.set(r.post_id, r.reaction_id);
    return { counts, mine };
  }

  /**
   * Tepki ver / değiştir / geri al. Aynı tepki tekrar gönderilirse kaldırılır.
   * Mesaj sahibinin itibarı tepkinin puanı kadar değişir.
   */
  async react(viewer: RequestViewer, postId: number, reactionId: number | null): Promise<{ reactions: PostReactionCount[]; myReaction: number | null }> {
    const user = viewer.user;
    if (!user) throw Errors.unauthenticated();
    const { post, topic } = await this.posts.loadVisiblePost(viewer, postId);
    if (post.deleted_at) throw Errors.notFound('Mesaj bulunamadı.');
    if (post.user_id === user.id) throw Errors.badRequest('Kendi mesajınıza tepki veremezsiniz.');

    const defs = await this.all();
    const next = reactionId ? defs.find((d) => d.id === reactionId && d.is_enabled === 1) : null;
    if (reactionId && !next) throw Errors.badRequest('Bu tepki kullanılamıyor.');

    let notify = false;
    await this.db.tx(async () => {
      const prev = await this.db.q.selectFrom('post_reactions').select('reaction_id').where('post_id', '=', postId).where('user_id', '=', user.id).executeTakeFirst();
      const prevDef = prev ? defs.find((d) => d.id === prev.reaction_id) : undefined;
      const removing = !next || prev?.reaction_id === next.id;
      if (prev) await this.db.q.deleteFrom('post_reactions').where('post_id', '=', postId).where('user_id', '=', user.id).execute();
      if (!removing) {
        await this.db.q
          .insertInto('post_reactions')
          .values({ post_id: postId, user_id: user.id, reaction_id: next!.id, post_author_id: post.user_id, created_at: this.clock.now() })
          .execute();
        notify = !prev;
      }
      const delta = (removing ? 0 : next!.points) - (prevDef?.points ?? 0);
      if (delta && post.user_id) {
        await this.db.q
          .updateTable('users')
          .set((eb) => ({ reputation: eb('reputation', '+', delta) }))
          .where('id', '=', post.user_id)
          .execute();
      }
    });

    if (notify && next && post.user_id) {
      this.db.afterCommit(() =>
        this.notifications.notify(
          post.user_id!,
          'forum.reaction',
          { postId, topicId: topic.id, topicTitle: topic.title, actorName: user.display_name, emoji: next.emoji, reaction: next.label },
          user.id,
        ),
      );
    }
    const { counts, mine } = await this.forPosts(viewer, [postId]);
    return { reactions: counts.get(postId) ?? [], myReaction: mine.get(postId) ?? null };
  }

  /** Mesaja kimlerin hangi tepkiyi verdiği. */
  async who(viewer: RequestViewer, postId: number): Promise<ReactionUserItem[]> {
    await this.posts.loadVisiblePost(viewer, postId);
    const rows = await this.db.q
      .selectFrom('post_reactions')
      .select(['user_id', 'reaction_id', 'created_at'])
      .where('post_id', '=', postId)
      .orderBy('created_at', 'desc')
      .limit(200)
      .execute();
    const people = await this.users.summaries(rows.map((r) => r.user_id));
    return rows.filter((r) => people.has(r.user_id)).map((r) => ({ user: people.get(r.user_id)!, reactionId: r.reaction_id, at: r.created_at }));
  }

  // ---------- Yönetim ----------

  async adminList(): Promise<AdminReaction[]> {
    const uses = await this.db.q.selectFrom('post_reactions').select(['reaction_id', (eb) => eb.fn.countAll<number>().as('n')]).groupBy('reaction_id').execute();
    const n = new Map(uses.map((u) => [u.reaction_id, Number(u.n)]));
    return (await this.all()).map((r) => ({ id: r.id, key: r.key, label: r.label, emoji: r.emoji, points: r.points, isEnabled: r.is_enabled === 1, uses: n.get(r.id) ?? 0 }));
  }

  /**
   * Tepki setini kaydeder. Listeden çıkarılan tepkiler, kullanılmışsa silinmez (geçmiş korunur) ama kapatılır.
   * Puan değişikliği geçmiş tepkilerin itibarını yeniden hesaplamaz.
   */
  async save(viewer: RequestViewer, input: ReactionsAdminInput): Promise<void> {
    const keys = new Set<string>();
    input.items.forEach((it, i) => {
      if (keys.has(it.key)) throw Errors.field(`items.${i}.key`, 'Anahtarlar benzersiz olmalı.');
      keys.add(it.key);
    });
    const existing = await this.db.q.selectFrom('reactions').selectAll().execute();
    const now = this.clock.now();
    await this.db.tx(async () => {
      const kept = new Set<number>();
      for (const [order, it] of input.items.entries()) {
        const prev = it.id ? existing.find((e) => e.id === it.id) : existing.find((e) => e.key === it.key);
        const values = { key: it.key, label: it.label, emoji: it.emoji, points: it.points, is_enabled: it.isEnabled ? 1 : 0, sort_order: order };
        if (prev) {
          kept.add(prev.id);
          await this.db.q.updateTable('reactions').set(values).where('id', '=', prev.id).execute();
        } else {
          await this.db.q.insertInto('reactions').values({ ...values, created_at: now }).execute();
        }
      }
      for (const e of existing) {
        if (kept.has(e.id)) continue;
        const used = await this.db.q.selectFrom('post_reactions').select('post_id').where('reaction_id', '=', e.id).executeTakeFirst();
        if (used) await this.db.q.updateTable('reactions').set({ is_enabled: 0, sort_order: 999 }).where('id', '=', e.id).execute();
        else await this.db.q.deleteFrom('reactions').where('id', '=', e.id).execute();
      }
    });
    await this.cache.invalidate(NS);
    await this.audit.log({ type: 'admin', action: 'reactions.update', actorId: viewer.user!.id, ip: viewer.ip });
  }
}
