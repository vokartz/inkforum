import { Injectable } from '@nestjs/common';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';

/**
 * Konu ve bölüm sayaçlarını gerçek verilerden yeniden hesaplar. Yeni mesajda sayaçlar artımlı güncellenir;
 * silme, taşıma, birleştirme ve onay gibi seyrek işlemlerde bu tam hesaplama kullanılır.
 */
@Injectable()
export class ForumCountersService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async recountTopic(topicId: number): Promise<void> {
    const q = this.db.q;
    const visible = q
      .selectFrom('posts')
      .where('topic_id', '=', topicId)
      .where('deleted_at', 'is', null)
      .where('is_approved', '=', 1);
    const [count, first, last] = await Promise.all([
      visible.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
      q.selectFrom('posts').select('id').where('topic_id', '=', topicId).orderBy('id').limit(1).executeTakeFirst(),
      visible.select(['id', 'created_at', 'user_id', 'author_name']).orderBy('id', 'desc').limit(1).executeTakeFirst(),
    ]);
    const n = Number(count?.n ?? 0);
    const topic = await q.selectFrom('topics').select(['created_at', 'user_id', 'author_name']).where('id', '=', topicId).executeTakeFirst();
    if (!topic) return;
    await q
      .updateTable('topics')
      .set({
        reply_count: Math.max(0, n - 1),
        first_post_id: first?.id ?? null,
        last_post_id: last?.id ?? first?.id ?? null,
        last_post_at: last?.created_at ?? topic.created_at,
        last_poster_id: last ? last.user_id : topic.user_id,
        last_poster_name: last ? last.author_name : topic.author_name,
        updated_at: this.clock.now(),
      })
      .where('id', '=', topicId)
      .execute();
  }

  async recountBoard(boardId: number): Promise<void> {
    const q = this.db.q;
    const [topics, posts, last] = await Promise.all([
      q
        .selectFrom('topics')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('board_id', '=', boardId)
        .where('deleted_at', 'is', null)
        .where('is_approved', '=', 1)
        .where('moved_to_topic_id', 'is', null)
        .executeTakeFirst(),
      q
        .selectFrom('posts')
        .innerJoin('topics', 'topics.id', 'posts.topic_id')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('posts.board_id', '=', boardId)
        .where('posts.deleted_at', 'is', null)
        .where('posts.is_approved', '=', 1)
        .where('topics.deleted_at', 'is', null)
        .where('topics.is_approved', '=', 1)
        .executeTakeFirst(),
      q
        .selectFrom('topics')
        .select(['last_post_id', 'last_post_at'])
        .where('board_id', '=', boardId)
        .where('deleted_at', 'is', null)
        .where('is_approved', '=', 1)
        // Gizli konular bölümün "son mesaj" bilgisinde görünmez
        .where('is_hidden', '=', 0)
        .where('moved_to_topic_id', 'is', null)
        .orderBy('last_post_at', 'desc')
        .limit(1)
        .executeTakeFirst(),
    ]);
    await q
      .updateTable('boards')
      .set({
        topic_count: Number(topics?.n ?? 0),
        post_count: Number(posts?.n ?? 0),
        last_post_id: last?.last_post_id ?? null,
        last_post_at: last?.last_post_at ?? null,
      })
      .where('id', '=', boardId)
      .execute();
  }

  /** Kullanıcının mesaj sayısını (sayılan bölümlerdeki onaylı, silinmemiş mesajlar) yeniden hesaplar. */
  async recountUserPosts(userId: number): Promise<number> {
    const row = await this.db.q
      .selectFrom('posts')
      .innerJoin('boards', 'boards.id', 'posts.board_id')
      .innerJoin('topics', 'topics.id', 'posts.topic_id')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('posts.user_id', '=', userId)
      .where('posts.deleted_at', 'is', null)
      .where('posts.is_approved', '=', 1)
      .where('topics.deleted_at', 'is', null)
      .where('boards.count_posts', '=', 1)
      .executeTakeFirst();
    const n = Number(row?.n ?? 0);
    await this.db.q.updateTable('users').set({ post_count: n }).where('id', '=', userId).execute();
    return n;
  }
}
