import { Injectable, Logger } from '@nestjs/common';
import { slugify } from '@forum/shared';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { DEFAULT_FORUM, WELCOME_TOPIC } from '../bootstrap/defaults.js';
import { ForumCacheService } from './forum-cache.service.js';
import { PostRenderService } from './post-render.service.js';
import { PostsService } from './posts.service.js';

/** İlk kurulumda örnek kategori/bölüm yapısını ve hoş geldin konusunu oluşturur. */
@Injectable()
export class ForumSeedService {
  private readonly logger = new Logger('ForumSeed');

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly groups: GroupCacheService,
    private readonly permissions: PermissionsService,
    private readonly forum: ForumCacheService,
    private readonly render: PostRenderService,
    private readonly posts: PostsService,
  ) {}

  /** `tr`: örnek içeriği kurulum dilinde oluşturmak için çeviri işlevi */
  async seed(tr: (text: string) => string = (x) => x): Promise<void> {
    const existing = await this.db.q.selectFrom('forum_categories').select('id').executeTakeFirst();
    if (existing) return;
    const profiles = await this.permissions.profiles();
    const profileId = (key: string | undefined) => (key ? (profiles.find((p) => p.key === key)?.id ?? null) : null);
    const now = this.clock.now();
    let announcementsId: number | null = null;

    await this.db.tx(async () => {
      for (const [ci, cat] of DEFAULT_FORUM.entries()) {
        const c = await this.db.q
          .insertInto('forum_categories')
          .values({ name: tr(cat.name), description: tr(cat.description), sort_order: ci, created_at: now, updated_at: now })
          .returning('id')
          .executeTakeFirstOrThrow();
        for (const [bi, b] of cat.boards.entries()) {
          const row = await this.db.q
            .insertInto('boards')
            .values({
              category_id: c.id,
              type: b.redirectUrl ? 'redirect' : 'forum',
              name: tr(b.name),
              slug: slugify(tr(b.name)) || slugify(b.name) || `board-${ci}-${bi}`,
              description: tr(b.description),
              icon_kind: 'icon',
              icon_name: b.icon,
              icon_color: b.color,
              redirect_url: b.redirectUrl ?? null,
              permission_profile_id: profileId(b.profile),
              sort_order: bi,
              created_at: now,
              updated_at: now,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          if (b.profile === 'read_only' && announcementsId === null) announcementsId = row.id;
        }
      }
    });
    await this.forum.invalidate();

    const adminGroup = await this.groups.bySystemKey('admin');
    const admin = await this.db.q
      .selectFrom('users')
      .select(['id', 'display_name'])
      .where('primary_group_id', '=', adminGroup.id)
      .where('deleted_at', 'is', null)
      .orderBy('id')
      .limit(1)
      .executeTakeFirst();
    const board = announcementsId ? await this.forum.board(announcementsId) : undefined;
    if (admin && board) {
      await this.posts.insertTopic({
        board,
        userId: admin.id,
        authorName: admin.display_name,
        title: tr(WELCOME_TOPIC.title),
        body: tr(WELCOME_TOPIC.body),
        html: this.render.post(tr(WELCOME_TOPIC.body)).html,
        prefixId: null,
        ip: null,
        approved: true,
        pinned: true,
      });
    }
    this.logger.log('Örnek forum yapısı oluşturuldu.');
  }
}
