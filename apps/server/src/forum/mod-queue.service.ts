import { Injectable } from '@nestjs/common';
import { bbcodeExcerpt, type ModQueuePage } from '@forum/shared';
import { Db } from '../database/db.service.js';
import type { RequestViewer } from '../common/request-context.js';
import { UsersService } from '../users/users.service.js';
import { ForumAccessService } from './forum-access.service.js';

const PER_PAGE = 20;

@Injectable()
export class ModQueueService {
  constructor(
    private readonly db: Db,
    private readonly access: ForumAccessService,
    private readonly users: UsersService,
  ) {}

  private async approvableBoards(viewer: RequestViewer): Promise<Map<number, { name: string; slug: string }>> {
    const out = new Map<number, { name: string; slug: string }>();
    if (!viewer.user) return out;
    for (const [id, a] of await this.access.visibleBoards(viewer, { includeHidden: true })) {
      if (a.can.approve) out.set(id, { name: a.board.name, slug: a.board.slug });
    }
    return out;
  }

  private base(ids: number[]) {
    return this.db.q
      .selectFrom('posts')
      .innerJoin('topics', 'topics.id', 'posts.topic_id')
      .where('posts.board_id', 'in', ids)
      .where('posts.is_approved', '=', 0)
      .where('posts.deleted_at', 'is', null)
      .where('topics.deleted_at', 'is', null);
  }

  async count(viewer: RequestViewer): Promise<number> {
    const boards = await this.approvableBoards(viewer);
    if (!boards.size) return 0;
    const r = await this.base([...boards.keys()]).select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst();
    return Number(r?.n ?? 0);
  }

  async list(viewer: RequestViewer, page: number): Promise<ModQueuePage> {
    const boards = await this.approvableBoards(viewer);
    if (!boards.size) return { items: [], total: 0, page: 1, perPage: PER_PAGE };
    const ids = [...boards.keys()];
    const [rows, total] = await Promise.all([
      this.base(ids)
        .select([
          'posts.id as post_id',
          'posts.topic_id',
          'posts.board_id',
          'posts.user_id',
          'posts.author_name',
          'posts.body_bbcode',
          'posts.created_at',
          'topics.title',
          'topics.slug',
          'topics.first_post_id',
          'topics.is_hidden',
        ])
        .orderBy('posts.created_at', 'asc')
        .limit(PER_PAGE)
        .offset((page - 1) * PER_PAGE)
        .execute(),
      this.base(ids).select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
    ]);
    const users = await this.users.summaries(rows.map((r) => r.user_id ?? 0));
    return {
      items: rows.map((r) => ({
        postId: r.post_id,
        topicId: r.topic_id,
        topicTitle: r.title,
        topicSlug: r.slug,
        isTopic: r.first_post_id === r.post_id,
        isHidden: r.is_hidden === 1,
        board: { id: r.board_id, ...boards.get(r.board_id)! },
        author: r.user_id ? (users.get(r.user_id) ?? null) : null,
        authorName: r.author_name,
        excerpt: bbcodeExcerpt(r.body_bbcode, 400),
        createdAt: r.created_at,
      })),
      total: Number(total?.n ?? 0),
      page,
      perPage: PER_PAGE,
    };
  }
}
