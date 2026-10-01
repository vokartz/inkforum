import { Injectable } from '@nestjs/common';
import { sql, type ExpressionBuilder } from 'kysely';
import {
  bbcodeExcerpt,
  parseTopicTemplate,
  bbcodeToText,
  canonicalName,
  type SearchQuery,
  likePattern,
  type SearchResults,
  type BoardDetail,
  type BoardPage,
  type BoardSummary,
  type BoardModerators,
  type Breadcrumb,
  type ForumCategory,
  type ForumIndex,
  type ForumLimits,
  type GroupBadge,
  type LastPostInfo,
  type NewTopicContext,
  type Paginated,
  type PostAuthor,
  type PostItem,
  type PostLocation,
  type RecentTopicItem,
  type TopicListItem,
  type TopicPage,
  type TopicSort,
  type TagPage,
  type TopicViewerItem,
  type TopicRelated,
  type UnreadTopicItem,
  type UserSummary,
  type topicListQuery,
} from '@forum/shared';
import type { z } from 'zod';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock, DAY } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { ReactionsService } from './reactions.service.js';
import { ProfilesService, ONLINE_WINDOW_MS } from '../profiles/profiles.service.js';
import { privacySchema, DEFAULT_PRIVACY } from '../profiles/profiles.schemas.js';
import { can, type RequestViewer } from '../common/request-context.js';
import { fromJsonSchema } from '../database/json.js';
import { ForumAccessService, type BoardAccess } from './forum-access.service.js';
import { ForumCacheService, type CachedBoard } from './forum-cache.service.js';
import { PostRenderService } from './post-render.service.js';
import { PostsService } from './posts.service.js';
import { TopicViewsService } from './topic-views.service.js';
import { TopicExtrasService } from './topic-extras.service.js';

/** Bu süreden eski içerik okunmuş sayılır (okunmamış hesaplaması sınırlı kalsın). */
const UNREAD_HORIZON_MS = 90 * DAY;
const MAX_REDIRECT_HOPS = 5;

type TopicRow = Row<'topics'>;

@Injectable()
export class ForumService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly groups: GroupCacheService,
    private readonly profiles: ProfilesService,
    private readonly access: ForumAccessService,
    private readonly forum: ForumCacheService,
    private readonly render: PostRenderService,
    private readonly posts: PostsService,
    private readonly views: TopicViewsService,
    private readonly reactions: ReactionsService,
    private readonly extras: TopicExtrasService,
  ) {}

  limits(): ForumLimits {
    return {
      titleMaxLength: this.settings.get('forum.titleMaxLength'),
      postMaxLength: this.settings.get('forum.postMaxLength'),
      imageMaxKb: this.settings.get('forum.imageMaxKb'),
    };
  }

  // ---------- Okunmamış hesaplama ----------

  private readFloor(user: Row<'users'>): number {
    return Math.max(user.mark_read_at ?? user.registered_at, this.clock.now() - UNREAD_HORIZON_MS);
  }

  /** Konu başına okunmamış bilgisi. */
  private async readState(viewer: RequestViewer, topics: Array<Pick<TopicRow, 'id' | 'board_id' | 'last_post_at'>>) {
    const out = new Map<number, { unread: boolean; lastReadPostId: number | null }>();
    const user = viewer.user;
    if (!user || !topics.length) return out;
    const floor = this.readFloor(user);
    const [topicReads, boardReads] = await Promise.all([
      this.db.q
        .selectFrom('topic_reads')
        .select(['topic_id', 'last_read_post_id', 'read_at'])
        .where('user_id', '=', user.id)
        .where('topic_id', 'in', topics.map((t) => t.id))
        .execute(),
      this.db.q
        .selectFrom('board_reads')
        .select(['board_id', 'read_at'])
        .where('user_id', '=', user.id)
        .where('board_id', 'in', [...new Set(topics.map((t) => t.board_id))])
        .execute(),
    ]);
    const tr = new Map(topicReads.map((r) => [r.topic_id, r]));
    const br = new Map(boardReads.map((r) => [r.board_id, r.read_at]));
    for (const t of topics) {
      const r = tr.get(t.id);
      const threshold = Math.max(floor, br.get(t.board_id) ?? 0, r?.read_at ?? 0);
      out.set(t.id, { unread: t.last_post_at > threshold, lastReadPostId: r?.last_read_post_id ?? null });
    }
    return out;
  }

  /** Okunmamış içeriği olan bölümler. */
  private async unreadBoards(viewer: RequestViewer, boardIds: number[]): Promise<Set<number>> {
    const user = viewer.user;
    if (!user || !boardIds.length) return new Set();
    const floor = this.readFloor(user);
    const rows = await this.db.q
      .selectFrom('topics as t')
      .leftJoin('topic_reads as r', (j) => j.onRef('r.topic_id', '=', 't.id').on('r.user_id', '=', user.id))
      .leftJoin('board_reads as b', (j) => j.onRef('b.board_id', '=', 't.board_id').on('b.user_id', '=', user.id))
      .select('t.board_id')
      .distinct()
      .where('t.board_id', 'in', boardIds)
      .where('t.last_post_at', '>', floor)
      .where('t.deleted_at', 'is', null)
      .where('t.is_approved', '=', 1)
      .where('t.is_hidden', '=', 0)
      .where('t.moved_to_topic_id', 'is', null)
      .where((eb) => eb.or([eb('r.read_at', 'is', null), eb('t.last_post_at', '>', eb.ref('r.read_at'))]))
      .where((eb) => eb.or([eb('b.read_at', 'is', null), eb('t.last_post_at', '>', eb.ref('b.read_at'))]))
      .execute();
    return new Set(rows.map((r) => r.board_id));
  }

  // ---------- Ortak parçalar ----------

  /** Forum dizininin adresi: açılış sayfası seçiliyse /forum */
  forumRoot(): string {
    return this.settings.landing() ? '/forum' : '/';
  }

  private async breadcrumbs(boardId: number): Promise<Breadcrumb[]> {
    const chain = await this.forum.ancestry(boardId);
    const { categories } = await this.forum.structure();
    const cat = categories.find((c) => c.id === chain[0]?.category_id);
    return [
      { label: 'Forum', href: this.forumRoot() },
      ...(cat ? [{ label: cat.name, href: `${this.forumRoot()}#kategori-${cat.id}` }] : []),
      ...chain.map((b) => ({ label: b.name, href: `/f/${b.id}/${b.slug}` })),
    ];
  }

  private async lastPosts(postIds: number[]): Promise<Map<number, LastPostInfo>> {
    const ids = [...new Set(postIds.filter(Boolean))];
    const out = new Map<number, LastPostInfo>();
    if (!ids.length) return out;
    const rows = await this.db.q
      .selectFrom('posts')
      .innerJoin('topics', 'topics.id', 'posts.topic_id')
      .select(['posts.id', 'posts.topic_id', 'posts.user_id', 'posts.author_name', 'posts.created_at', 'topics.title', 'topics.slug'])
      .where('posts.id', 'in', ids)
      .execute();
    const users = await this.users.summaries(rows.map((r) => r.user_id ?? 0));
    for (const r of rows) {
      out.set(r.id, {
        postId: r.id,
        topicId: r.topic_id,
        topicTitle: r.title,
        topicSlug: r.slug,
        at: r.created_at,
        author: r.user_id ? (users.get(r.user_id) ?? null) : null,
        authorName: r.author_name,
      });
    }
    return out;
  }

  /** Bölüm özetleri (sayaçlar, son mesaj, alt bölümler, okunmamış). */
  /** Bölümlerin moderatörleri (üyeler + gruplar), tek sorguda. */
  private async moderatorsOf(boards: CachedBoard[]): Promise<Map<number, BoardModerators>> {
    const [people, groups] = await Promise.all([this.users.summaries([...new Set(boards.flatMap((b) => b.moderatorUserIds))]), this.groups.map()]);
    return new Map(
      boards.map((b) => [
        b.id,
        {
          users: b.moderatorUserIds.map((id) => people.get(id)).filter((u): u is UserSummary => !!u),
          groups: b.moderatorGroupIds
            .map((id) => groups.get(id))
            .filter((g) => !!g)
            .map((g) => this.groups.badge(g!)),
        },
      ]),
    );
  }

  private async boardSummaries(viewer: RequestViewer, visible: Map<number, BoardAccess>, boardIds: number[]): Promise<BoardSummary[]> {
    if (!boardIds.length) return [];
    const all = [...visible.values()].map((a) => a.board);
    const childrenOf = (id: number) => all.filter((b) => b.parent_id === id);
    const descendants = (id: number): CachedBoard[] => childrenOf(id).flatMap((c) => [c, ...descendants(c.id)]);

    const relevant = [...new Set(boardIds.flatMap((id) => [id, ...descendants(id).map((b) => b.id)]))];
    const counters = await this.db.q
      .selectFrom('boards')
      .select(['id', 'topic_count', 'post_count', 'last_post_id', 'last_post_at', 'redirect_clicks'])
      .where('id', 'in', relevant)
      .execute();
    const c = new Map(counters.map((r) => [r.id, r]));
    const unread = await this.unreadBoards(viewer, relevant);

    const lastPostIdFor = (id: number): number | null => {
      let best: { id: number | null; at: number } = { id: c.get(id)?.last_post_id ?? null, at: c.get(id)?.last_post_at ?? 0 };
      for (const d of descendants(id)) {
        const r = c.get(d.id);
        if (r?.last_post_at && r.last_post_at > best.at) best = { id: r.last_post_id, at: r.last_post_at };
      }
      return best.id;
    };
    const lastIds = new Map(boardIds.map((id) => [id, lastPostIdFor(id)]));
    const lp = await this.lastPosts([...lastIds.values()].filter((x): x is number => !!x));
    const mods = await this.moderatorsOf(boardIds.map((id) => visible.get(id)!.board));

    return boardIds.map((id) => {
      const b = visible.get(id)!.board;
      const desc = descendants(id);
      const sum = (k: 'topic_count' | 'post_count') => (c.get(id)?.[k] ?? 0) + desc.reduce((s, d) => s + (c.get(d.id)?.[k] ?? 0), 0);
      const lastId = lastIds.get(id);
      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        description: b.description,
        type: b.type,
        icon: this.forum.icon(b),
        redirectUrl: b.type === 'redirect' ? b.redirect_url : null,
        redirectClicks: c.get(id)?.redirect_clicks ?? 0,
        topicCount: sum('topic_count'),
        postCount: sum('post_count'),
        lastPost: lastId ? (lp.get(lastId) ?? null) : null,
        unread: b.type === 'forum' && (unread.has(id) || desc.some((d) => unread.has(d.id))),
        children: childrenOf(id).map((ch) => ({
          id: ch.id,
          name: ch.name,
          slug: ch.slug,
          type: ch.type,
          unread: ch.type === 'forum' && (unread.has(ch.id) || descendants(ch.id).some((d) => unread.has(d.id))),
        })),
        moderators: mods.get(id) ?? { users: [], groups: [] },
      };
    });
  }

  // ---------- Ana sayfa ----------

  async index(viewer: RequestViewer): Promise<ForumIndex> {
    const { categories } = await this.forum.structure();
    const visible = await this.access.visibleBoards(viewer);
    const topLevel = [...visible.values()].filter((a) => !a.board.parent_id).map((a) => a.board);
    const summaries = await this.boardSummaries(viewer, visible, topLevel.map((b) => b.id));
    const byId = new Map(summaries.map((s) => [s.id, s]));

    const cats: ForumCategory[] = categories
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        isCollapsible: cat.is_collapsible === 1,
        background: cat.bgUrl,
        boards: topLevel.filter((b) => b.category_id === cat.id).map((b) => byId.get(b.id)!),
      }))
      .filter((cat) => cat.boards.length);

    const [totals, members, newest] = await Promise.all([
      this.db.q
        .selectFrom('boards')
        .select((eb) => [eb.fn.sum<number>('topic_count').as('topics'), eb.fn.sum<number>('post_count').as('posts')])
        .executeTakeFirst(),
      this.db.q
        .selectFrom('users')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('status', '=', 'active')
        .where('deleted_at', 'is', null)
        .executeTakeFirst(),
      this.db.q
        .selectFrom('users')
        .select('id')
        .where('status', '=', 'active')
        .where('deleted_at', 'is', null)
        .orderBy('id', 'desc')
        .limit(1)
        .executeTakeFirst(),
    ]);
    const newestSummary = newest ? ((await this.users.summaries([newest.id])).get(newest.id) ?? null) : null;

    return {
      categories: cats,
      stats: {
        topics: Number(totals?.topics ?? 0),
        posts: Number(totals?.posts ?? 0),
        members: Number(members?.n ?? 0),
        newestMember: newestSummary,
      },
      online: can(viewer, 'online.view') ? await this.profiles.online(viewer) : null,
      postableBoards: [...visible.values()]
        .filter((a) => a.board.type === 'forum' && a.can.createTopic)
        .map((a) => ({ id: a.board.id, name: a.board.name, category: categories.find((c) => c.id === a.board.category_id)?.name ?? '' })),
    };
  }

  /** Son mesajlar (ana sayfa widget'ı). */
  async recent(viewer: RequestViewer, limit: number): Promise<RecentTopicItem[]> {
    if (limit <= 0) return [];
    const visible = await this.access.visibleBoards(viewer);
    const ids = [...visible.values()].filter((a) => a.board.type === 'forum').map((a) => a.board.id);
    if (!ids.length) return [];
    const rows = await this.db.q
      .selectFrom('topics')
      .select(['id', 'board_id', 'title', 'slug', 'reply_count', 'last_post_id', 'last_post_at', 'last_poster_id', 'last_poster_name'])
      .where('board_id', 'in', ids)
      .where('deleted_at', 'is', null)
      .where('is_approved', '=', 1)
      .where('is_hidden', '=', 0)
      .where('moved_to_topic_id', 'is', null)
      .orderBy('last_post_at', 'desc')
      .limit(Math.min(limit, 20))
      .execute();
    const posts = await this.db.q
      .selectFrom('posts')
      .select(['id', 'body_bbcode'])
      .where('id', 'in', rows.map((r) => r.last_post_id ?? 0))
      .execute();
    const bodies = new Map(posts.map((p) => [p.id, p.body_bbcode]));
    const users = await this.users.summaries(rows.map((r) => r.last_poster_id ?? 0));
    const read = await this.readState(viewer, rows);
    return rows.map((r) => ({
      topicId: r.id,
      postId: r.last_post_id,
      title: r.title,
      slug: r.slug,
      board: { id: r.board_id, name: visible.get(r.board_id)!.board.name, slug: visible.get(r.board_id)!.board.slug },
      replyCount: r.reply_count,
      at: r.last_post_at,
      author: r.last_poster_id ? (users.get(r.last_poster_id) ?? null) : null,
      authorName: r.last_poster_name ?? '',
      excerpt: bbcodeExcerpt(bodies.get(r.last_post_id ?? 0) ?? '', 140),
      unread: read.get(r.id)?.unread ?? false,
    }));
  }

  // ---------- Bölüm sayfası ----------

  private async boardDetail(access: BoardAccess): Promise<BoardDetail> {
    const b = access.board;
    const counters = await this.db.q.selectFrom('boards').select(['topic_count', 'post_count']).where('id', '=', b.id).executeTakeFirst();
    const mods = await this.moderatorsOf([b]);
    return {
      id: b.id,
      name: b.name,
      slug: b.slug,
      description: b.description,
      type: b.type,
      icon: this.forum.icon(b),
      categoryId: b.category_id,
      parentId: b.parent_id,
      topicCount: counters?.topic_count ?? 0,
      postCount: counters?.post_count ?? 0,
      requireApprovalTopics: b.require_approval_topics === 1,
      requireApprovalPosts: b.require_approval_posts === 1,
      moderators: mods.get(b.id) ?? { users: [], groups: [] },
      cover: b.coverUrl,
      aboutHtml: b.about_html,
    };
  }

  private topicVisibility<QB extends { where: any }>(qb: QB, viewer: RequestViewer, access: BoardAccess): QB {
    let q: any = qb;
    if (!access.can.viewDeleted) q = q.where('topics.deleted_at', 'is', null);
    if (!access.can.approve) {
      const uid = viewer.user?.id ?? 0;
      q = q.where((eb: any) => eb.or([eb('topics.is_approved', '=', 1), eb('topics.user_id', '=', uid)]));
      q = q.where((eb: any) => eb.or([eb('topics.is_hidden', '=', 0), eb('topics.user_id', '=', uid)]));
    }
    return q;
  }

  private async topicItems(viewer: RequestViewer, rows: TopicRow[]): Promise<TopicListItem[]> {
    const perPage = this.settings.get('forum.postsPerPage');
    const hot = this.settings.get('forum.hotTopicReplies');
    const users = await this.users.summaries(rows.flatMap((r) => [r.user_id ?? 0, r.last_poster_id ?? 0]));
    const read = await this.readState(viewer, rows.filter((r) => !r.moved_to_topic_id));
    const ids = rows.map((r) => r.id);
    const [tags, polls] = await Promise.all([this.extras.tagsFor(ids), this.extras.topicsWithPoll(ids)]);
    const items: TopicListItem[] = [];
    for (const r of rows) {
      items.push({
        id: r.id,
        boardId: r.board_id,
        title: r.title,
        slug: r.slug,
        prefix: await this.forum.prefix(r.prefix_id),
        author: r.user_id ? (users.get(r.user_id) ?? null) : null,
        authorName: r.author_name,
        createdAt: r.created_at,
        replyCount: r.reply_count,
        viewCount: r.view_count + this.views.pendingFor(r.id),
        isPinned: r.is_pinned === 1,
        isLocked: r.is_locked === 1,
        isFeatured: r.is_featured === 1,
        isApproved: r.is_approved === 1,
        isHidden: r.is_hidden === 1,
        isDeleted: !!r.deleted_at,
        isMoved: !!r.moved_to_topic_id,
        movedToTopicId: r.moved_to_topic_id,
        lastPost: {
          postId: r.last_post_id,
          at: r.last_post_at,
          author: r.last_poster_id ? (users.get(r.last_poster_id) ?? null) : null,
          authorName: r.last_poster_name ?? r.author_name,
        },
        unread: read.get(r.id)?.unread ?? false,
        pages: Math.max(1, Math.ceil((r.reply_count + 1) / perPage)),
        hot: r.reply_count >= hot,
        tags: tags.get(r.id) ?? [],
        hasPoll: polls.has(r.id),
      });
    }
    return items;
  }

  async boardPage(viewer: RequestViewer, boardId: number, query: z.output<typeof topicListQuery>): Promise<BoardPage> {
    const access = await this.access.require(viewer, boardId);
    const visible = await this.access.visibleBoards(viewer);
    const childIds = [...visible.values()].filter((a) => a.board.parent_id === boardId).map((a) => a.board.id);
    const perPage = this.settings.get('forum.topicsPerPage');

    const base = () => {
      let q = this.db.q.selectFrom('topics').where('topics.board_id', '=', boardId);
      q = this.topicVisibility(q, viewer, access);
      if (query.prefix) q = q.where('topics.prefix_id', '=', query.prefix);
      return q;
    };
    const sortCol: Record<TopicSort, 'topics.last_post_at' | 'topics.id' | 'topics.reply_count' | 'topics.view_count' | 'topics.title'> = {
      last_post: 'topics.last_post_at',
      created: 'topics.id',
      replies: 'topics.reply_count',
      views: 'topics.view_count',
      title: 'topics.title',
    };
    const [pinnedRows, rows, total] = await Promise.all([
      query.page === 1
        ? base().selectAll('topics').where('topics.is_pinned', '=', 1).orderBy('topics.last_post_at', 'desc').limit(50).execute()
        : Promise.resolve([] as TopicRow[]),
      base()
        .selectAll('topics')
        .where('topics.is_pinned', '=', 0)
        .orderBy(sortCol[query.sort], query.dir)
        .orderBy('topics.id', query.dir)
        .limit(perPage)
        .offset((query.page - 1) * perPage)
        .execute(),
      base()
        .where('topics.is_pinned', '=', 0)
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirst(),
    ]);

    return {
      board: await this.boardDetail(access),
      breadcrumbs: await this.breadcrumbs(boardId),
      children: await this.boardSummaries(viewer, visible, childIds),
      pinned: await this.topicItems(viewer, pinnedRows),
      topics: { items: await this.topicItems(viewer, rows), total: Number(total?.n ?? 0), page: query.page, perPage },
      prefixes: await this.forum.prefixesFor(boardId),
      can: access.can,
      sort: query.sort,
      dir: query.dir,
      prefixId: query.prefix ?? null,
    };
  }

  async newTopicContext(viewer: RequestViewer, boardId: number): Promise<NewTopicContext> {
    const access = await this.access.require(viewer, boardId);
    if (access.board.type !== 'forum' || !access.can.createTopic) throw Errors.forbidden('Bu bölümde konu açma yetkiniz yok.');
    const reason = await this.posts.postingBlockReason(viewer);
    if (reason) throw Errors.forbidden(reason);
    return {
      board: await this.boardDetail(access),
      breadcrumbs: await this.breadcrumbs(boardId),
      prefixes: await this.forum.prefixesFor(boardId),
      can: access.can,
      limits: this.limits(),
      tagging: this.extras.tagging(),
      popularTags: this.extras.tagging().enabled ? await this.extras.popularTags() : [],
      pollMaxOptions: this.settings.get('forum.pollMaxOptions'),
      template: parseTopicTemplate(access.board.topic_template_json),
      privateTopics: access.board.private_topics === 1,
    };
  }

  /** Yönlendirme bölümü: tıklamayı sayar ve adresi döner. */
  async follow(viewer: RequestViewer, boardId: number): Promise<{ url: string }> {
    const { board } = await this.access.require(viewer, boardId);
    if (board.type !== 'redirect' || !board.redirect_url) throw Errors.notFound('Bağlantı bulunamadı.');
    await this.db.q
      .updateTable('boards')
      .set((eb) => ({ redirect_clicks: eb('redirect_clicks', '+', 1) }))
      .where('id', '=', boardId)
      .execute();
    return { url: board.redirect_url };
  }

  // ---------- Konu sayfası ----------

  /** Mesaj yazarlarının konu içinde gösterilen bilgileri. */
  async postAuthors(viewer: RequestViewer, userIds: number[]): Promise<Map<number, PostAuthor>> {
    const ids = [...new Set(userIds.filter((id) => id > 0))];
    const out = new Map<number, PostAuthor>();
    if (!ids.length) return out;
    const now = this.clock.now();
    const [summaries, rows, extra, profiles, groupMap] = await Promise.all([
      this.users.summaries(ids),
      this.db.q
        .selectFrom('users')
        .select(['id', 'post_count', 'registered_at', 'achievement_points', 'reputation', 'warning_points', 'last_active_at', 'primary_group_id', 'primary_group_expires_at', 'post_group_id'])
        .where('id', 'in', ids)
        .execute(),
      this.db.q
        .selectFrom('group_members')
        .select(['user_id', 'group_id'])
        .where('user_id', 'in', ids)
        .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]))
        .execute(),
      this.db.q.selectFrom('user_profiles').select(['user_id', 'signature', 'privacy_json']).where('user_id', 'in', ids).execute(),
      this.groups.map(),
    ]);
    const prof = new Map(profiles.map((p) => [p.user_id, p]));
    const showWarnings = can(viewer, 'mod.warnings.view');
    const staff = can(viewer, 'mod.users.watch') || viewer.isAdmin;
    const signaturesOn = this.settings.get('signatures.enabled');
    for (const r of rows) {
      const summary = summaries.get(r.id);
      if (!summary) continue;
      const groupIds = [
        r.primary_group_id && (!r.primary_group_expires_at || r.primary_group_expires_at > now) ? r.primary_group_id : null,
        ...extra.filter((e) => e.user_id === r.id).map((e) => e.group_id),
        r.post_group_id,
      ].filter((x): x is number => !!x);
      const groups: GroupBadge[] = [...new Set(groupIds)]
        .map((id) => groupMap.get(id))
        .filter((g) => !!g && g.kind !== 'system' && g.visibility === 'visible')
        .map((g) => this.groups.badge(g!));
      const p = prof.get(r.id);
      const privacy = fromJsonSchema(privacySchema, p?.privacy_json, DEFAULT_PRIVACY);
      const online = !!r.last_active_at && now - r.last_active_at < ONLINE_WINDOW_MS && (privacy.showOnline || staff);
      out.set(r.id, {
        ...summary,
        postCount: r.post_count,
        registeredAt: r.registered_at,
        achievementPoints: r.achievement_points,
        reputation: r.reputation,
        groups,
        signatureHtml: signaturesOn && p?.signature ? this.render.short(p.signature) : null,
        isOnline: online,
        warningPoints: showWarnings ? r.warning_points : null,
      });
    }
    return out;
  }

  private postVisibility<QB extends { where: any }>(qb: QB, viewer: RequestViewer, access: BoardAccess): QB {
    let q: any = qb;
    if (!access.can.viewDeleted) q = q.where('posts.deleted_at', 'is', null);
    if (!access.can.approve) {
      const uid = viewer.user?.id ?? 0;
      q = q.where((eb: any) => eb.or([eb('posts.is_approved', '=', 1), eb('posts.user_id', '=', uid)]));
    }
    return q;
  }

  private async resolveTopic(topicId: number): Promise<TopicRow> {
    let topic = await this.posts.requireTopic(topicId);
    for (let hop = 0; topic.moved_to_topic_id && hop < MAX_REDIRECT_HOPS; hop++) {
      topic = await this.posts.requireTopic(topic.moved_to_topic_id);
    }
    return topic;
  }

  /** `page`: sayfa numarası ya da "last" / "unread". */
  async topicPage(viewer: RequestViewer, topicId: number, pageInput: number | 'last' | 'unread'): Promise<TopicPage> {
    const topic = await this.resolveTopic(topicId);
    const access = await this.access.require(viewer, topic.board_id);
    this.posts.assertTopicVisible(viewer, access, topic);
    const perPage = this.settings.get('forum.postsPerPage');
    const base = () => this.postVisibility(this.db.q.selectFrom('posts').where('posts.topic_id', '=', topic.id), viewer, access);
    const totalRow = await base().select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst();
    const total = Number(totalRow?.n ?? 0);
    const lastPage = Math.max(1, Math.ceil(total / perPage));

    const readInfo = viewer.user ? (await this.readState(viewer, [topic])).get(topic.id) : undefined;
    let firstUnreadPostId: number | null = null;
    if (viewer.user && readInfo?.unread) {
      const q = base().select('posts.id').orderBy('posts.id').limit(1);
      const row = await (readInfo.lastReadPostId ? q.where('posts.id', '>', readInfo.lastReadPostId) : q).executeTakeFirst();
      firstUnreadPostId = row?.id ?? null;
    }

    let page: number;
    if (pageInput === 'last') page = lastPage;
    else if (pageInput === 'unread') {
      if (firstUnreadPostId) {
        const before = await base().select((eb) => eb.fn.countAll<number>().as('n')).where('posts.id', '<', firstUnreadPostId).executeTakeFirst();
        page = Math.floor(Number(before?.n ?? 0) / perPage) + 1;
      } else page = lastPage;
    } else page = Math.min(Math.max(1, pageInput), lastPage);

    const rows = await base()
      .selectAll('posts')
      .orderBy('posts.id')
      .limit(perPage)
      .offset((page - 1) * perPage)
      .execute();
    const authors = await this.postAuthors(viewer, rows.map((r) => r.user_id ?? 0));
    const editors = await this.users.summaries(rows.map((r) => r.edited_by ?? 0));
    const [reactionDefs, reacted] = await Promise.all([this.reactions.enabled(), this.reactions.forPosts(viewer, rows.map((r) => r.id))]);

    const items: PostItem[] = rows.map((r, i) => ({
      id: r.id,
      number: (page - 1) * perPage + i + 1,
      isFirst: r.id === topic.first_post_id,
      author: r.user_id ? (authors.get(r.user_id) ?? null) : null,
      authorName: r.author_name,
      html: r.body_html,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      editedByName: r.edited_by ? (editors.get(r.edited_by)?.displayName ?? null) : null,
      editReason: r.edit_reason,
      editCount: r.edit_count,
      isApproved: r.is_approved === 1,
      isDeleted: !!r.deleted_at,
      can: this.posts.postPermissions(viewer, access, topic, r),
      reactions: reacted.counts.get(r.id) ?? [],
      myReaction: reacted.mine.get(r.id) ?? null,
    }));

    // Okundu işaretle + görüntülenme say.
    if (viewer.user && rows.length) {
      const last = rows[rows.length - 1]!;
      const readAt = Math.max(...rows.map((r) => r.created_at));
      await this.posts.markTopicRead(viewer.user.id, topic.id, last.id, readAt >= topic.last_post_at ? topic.last_post_at : readAt);
    }
    this.views.add(topic.id, viewer.user?.id ?? null);

    const own = !!viewer.user && topic.user_id === viewer.user.id;
    const blocked = await this.posts.postingBlockReason(viewer);
    let replyBlockedReason: string | null = null;
    if (!viewer.user) replyBlockedReason = 'Yanıt yazmak için giriş yapın.';
    else if (!access.can.reply) replyBlockedReason = 'Bu bölümde yanıt yazma yetkiniz yok.';
    else if (topic.is_locked && !access.can.lock) replyBlockedReason = 'Bu konu kilitli.';
    else if (topic.deleted_at) replyBlockedReason = 'Bu konu silinmiş.';
    else if (blocked) replyBlockedReason = blocked;

    return {
      topic: {
        id: topic.id,
        boardId: topic.board_id,
        title: topic.title,
        slug: topic.slug,
        prefix: await this.forum.prefix(topic.prefix_id),
        author: topic.user_id ? ((await this.users.summaries([topic.user_id])).get(topic.user_id) ?? null) : null,
        authorName: topic.author_name,
        createdAt: topic.created_at,
        replyCount: topic.reply_count,
        viewCount: topic.view_count + this.views.pendingFor(topic.id),
        isPinned: topic.is_pinned === 1,
        isLocked: topic.is_locked === 1,
        isFeatured: topic.is_featured === 1,
        isApproved: topic.is_approved === 1,
        isHidden: topic.is_hidden === 1,
        isDeleted: !!topic.deleted_at,
        firstPostId: topic.first_post_id,
        lastPostId: topic.last_post_id,
      },
      board: { id: access.board.id, name: access.board.name, slug: access.board.slug },
      moderators: (await this.moderatorsOf([access.board])).get(access.board.id) ?? { users: [], groups: [] },
      reactions: reactionDefs,
      breadcrumbs: await this.breadcrumbs(access.board.id),
      posts: { items, total, page, perPage },
      can: {
        ...access.can,
        replyLocked: topic.is_locked === 1 && access.can.lock,
        editOwnTopic: own && access.perms.has('post.edit.own'),
        lockOwn: own && access.perms.has('topic.lock.own'),
      },
      firstUnreadPostId,
      prefixes: await this.forum.prefixesFor(access.board.id),
      replyBlockedReason,
      limits: this.limits(),
      tags: (await this.extras.tagsFor([topic.id])).get(topic.id) ?? [],
      poll: await this.extras.pollView(viewer, access, topic),
      subscribed: await this.extras.isSubscribed(viewer.user?.id, topic.id),
      tagging: this.extras.tagging(),
    };
  }

  /** Mesajın bulunduğu konu ve sayfa. */
  async locate(viewer: RequestViewer, postId: number): Promise<PostLocation> {
    const post = await this.db.q.selectFrom('posts').select(['id', 'topic_id', 'user_id', 'is_approved', 'deleted_at']).where('id', '=', postId).executeTakeFirst();
    if (!post) throw Errors.notFound('Mesaj bulunamadı.');
    const topic = await this.posts.requireTopic(post.topic_id);
    const access = await this.access.require(viewer, topic.board_id);
    this.posts.assertTopicVisible(viewer, access, topic);
    const own = !!viewer.user && post.user_id === viewer.user.id;
    if ((post.deleted_at && !access.can.viewDeleted) || (!post.is_approved && !own && !access.can.approve)) {
      throw Errors.notFound('Mesaj bulunamadı.');
    }
    const before = await this.postVisibility(this.db.q.selectFrom('posts').where('posts.topic_id', '=', topic.id), viewer, access)
      .where('posts.id', '<', postId)
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirst();
    const perPage = this.settings.get('forum.postsPerPage');
    return { topicId: topic.id, topicSlug: topic.slug, page: Math.floor(Number(before?.n ?? 0) / perPage) + 1, postId };
  }

  // ---------- Okunmamış içerik ----------

  async unread(viewer: RequestViewer, page: number): Promise<Paginated<UnreadTopicItem>> {
    const user = viewer.user;
    if (!user) throw Errors.unauthenticated();
    const visible = await this.access.visibleBoards(viewer);
    const boardIds = [...visible.values()].filter((a) => a.board.type === 'forum').map((a) => a.board.id);
    const perPage = this.settings.get('forum.topicsPerPage');
    if (!boardIds.length) return { items: [], total: 0, page, perPage };
    const floor = this.readFloor(user);
    const base = () =>
      this.db.q
        .selectFrom('topics')
        .leftJoin('topic_reads as r', (j) => j.onRef('r.topic_id', '=', 'topics.id').on('r.user_id', '=', user.id))
        .leftJoin('board_reads as b', (j) => j.onRef('b.board_id', '=', 'topics.board_id').on('b.user_id', '=', user.id))
        .where('topics.board_id', 'in', boardIds)
        .where('topics.last_post_at', '>', floor)
        .where('topics.deleted_at', 'is', null)
        .where('topics.is_approved', '=', 1)
        .where('topics.is_hidden', '=', 0)
        .where('topics.moved_to_topic_id', 'is', null)
        .where((eb) => eb.or([eb('r.read_at', 'is', null), eb('topics.last_post_at', '>', eb.ref('r.read_at'))]))
        .where((eb) => eb.or([eb('b.read_at', 'is', null), eb('topics.last_post_at', '>', eb.ref('b.read_at'))]));
    const [rows, total] = await Promise.all([
      base()
        .selectAll('topics')
        .select('r.last_read_post_id as last_read')
        .orderBy('topics.last_post_at', 'desc')
        .limit(perPage)
        .offset((page - 1) * perPage)
        .execute(),
      base()
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirst(),
    ]);
    const items = await this.topicItems(viewer, rows);
    // İlk okunmamış mesaj: son okunandan sonraki ilk mesaj.
    const firsts = new Map<number, number>();
    const withRead = rows.filter((r) => r.last_read);
    if (withRead.length) {
      const next = await this.db.q
        .selectFrom('posts')
        .select(['topic_id', (eb) => eb.fn.min('id').as('id')])
        .where('topic_id', 'in', withRead.map((r) => r.id))
        .where('deleted_at', 'is', null)
        .where('is_approved', '=', 1)
        .where(sql<boolean>`id > (select last_read_post_id from topic_reads where topic_reads.topic_id = posts.topic_id and topic_reads.user_id = ${user.id})`)
        .groupBy('topic_id')
        .execute();
      for (const n of next) firsts.set(n.topic_id, Number(n.id));
    }
    return {
      items: items.map((it, i) => {
        const b = visible.get(it.boardId)!.board;
        return {
          ...it,
          board: { id: b.id, name: b.name, slug: b.slug },
          firstUnreadPostId: firsts.get(it.id) ?? (rows[i]!.last_read ? null : rows[i]!.first_post_id),
        };
      }),
      total: Number(total?.n ?? 0),
      page,
      perPage,
    };
  }

  // ---------- Profil sekmeleri ve arama ----------

  private async visibleForumBoardIds(viewer: RequestViewer): Promise<Map<number, BoardAccess>> {
    const visible = await this.access.visibleBoards(viewer, { includeHidden: true });
    for (const [id, a] of visible) if (a.board.type !== 'forum') visible.delete(id);
    return visible;
  }

  /** Üyenin açtığı konular (görülebilen bölümlerde). */
  async userTopics(viewer: RequestViewer, userId: number, page: number): Promise<Paginated<UnreadTopicItem>> {
    const visible = await this.visibleForumBoardIds(viewer);
    const perPage = this.settings.get('forum.topicsPerPage');
    if (!visible.size) return { items: [], total: 0, page, perPage };
    const base = () =>
      this.db.q
        .selectFrom('topics')
        .where('topics.user_id', '=', userId)
        .where('topics.board_id', 'in', [...visible.keys()])
        .where('topics.deleted_at', 'is', null)
        .where('topics.is_approved', '=', 1)
        .where('topics.is_hidden', '=', 0)
        .where('topics.moved_to_topic_id', 'is', null);
    const [rows, total] = await Promise.all([
      base().selectAll('topics').orderBy('topics.id', 'desc').limit(perPage).offset((page - 1) * perPage).execute(),
      base().select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
    ]);
    const items = await this.topicItems(viewer, rows);
    return {
      items: items.map((it) => {
        const b = visible.get(it.boardId)!.board;
        return { ...it, board: { id: b.id, name: b.name, slug: b.slug }, firstUnreadPostId: null };
      }),
      total: Number(total?.n ?? 0),
      page,
      perPage,
    };
  }

  /** Etiket sayfası: etiketi taşıyan, görülebilen konular (son yanıta göre). */
  async tagPage(viewer: RequestViewer, slug: string, page: number): Promise<TagPage> {
    if (!this.settings.get('forum.tagsEnabled')) throw Errors.notFound('Etiketler kapalı.');
    const tag = await this.extras.bySlug(slug);
    if (!tag) throw Errors.notFound('Etiket bulunamadı.');
    const visible = await this.visibleForumBoardIds(viewer);
    const perPage = this.settings.get('forum.topicsPerPage');
    const summary = { id: tag.id, name: tag.name, slug: tag.slug, color: tag.color, topicCount: tag.topic_count, isOfficial: tag.is_official === 1 };
    if (!visible.size) return { tag: summary, topics: { items: [], total: 0, page, perPage }, related: [] };
    const base = () =>
      this.db.q
        .selectFrom('topics')
        .innerJoin('topic_tags', 'topic_tags.topic_id', 'topics.id')
        .where('topic_tags.tag_id', '=', tag.id)
        .where('topics.board_id', 'in', [...visible.keys()])
        .where('topics.deleted_at', 'is', null)
        .where('topics.is_approved', '=', 1)
        .where('topics.is_hidden', '=', 0)
        .where('topics.moved_to_topic_id', 'is', null);
    const [rows, total] = await Promise.all([
      base().selectAll('topics').orderBy('topics.last_post_at', 'desc').limit(perPage).offset((page - 1) * perPage).execute(),
      base().select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
    ]);
    const items = await this.topicItems(viewer, rows);
    // Aynı konularda sık geçen diğer etiketler
    const related = rows.length
      ? await this.db.q
          .selectFrom('topic_tags as tt')
          .innerJoin('tags as t', 't.id', 'tt.tag_id')
          .select(['t.id', 't.name', 't.slug', 't.color', (eb) => eb.fn.countAll<number>().as('n')])
          .where('tt.topic_id', 'in', rows.map((r) => r.id))
          .where('t.id', '!=', tag.id)
          .groupBy(['t.id', 't.name', 't.slug', 't.color'])
          .orderBy('n', 'desc')
          .limit(10)
          .execute()
      : [];
    return {
      tag: summary,
      topics: {
        items: items.map((it) => {
          const b = visible.get(it.boardId)!.board;
          return { ...it, board: { id: b.id, name: b.name, slug: b.slug }, firstUnreadPostId: null };
        }),
        total: Number(total?.n ?? 0),
        page,
        perPage,
      },
      related: related.map((r) => ({ id: r.id, name: r.name, slug: r.slug, color: r.color })),
    };
  }

  /** Konu sayfasının altı: ortak etiketli benzer konular ve bölümdeki sonraki okunmamış konu. */
  async related(viewer: RequestViewer, topicId: number): Promise<TopicRelated> {
    const topic = await this.posts.requireTopic(topicId);
    const access = await this.access.require(viewer, topic.board_id);
    this.posts.assertTopicVisible(viewer, access, topic);
    const visible = await this.visibleForumBoardIds(viewer);
    const boardIds = [...visible.keys()];
    const live = () =>
      this.db.q
        .selectFrom('topics')
        .where('topics.board_id', 'in', boardIds)
        .where('topics.deleted_at', 'is', null)
        .where('topics.is_approved', '=', 1)
        .where('topics.is_hidden', '=', 0)
        .where('topics.moved_to_topic_id', 'is', null)
        .where('topics.id', '!=', topic.id);

    let similar: TopicRow[] = [];
    const tagIds = (await this.db.q.selectFrom('topic_tags').select('tag_id').where('topic_id', '=', topic.id).execute()).map((r) => r.tag_id);
    if (tagIds.length && boardIds.length) {
      const scored = await live()
        .innerJoin('topic_tags', 'topic_tags.topic_id', 'topics.id')
        .where('topic_tags.tag_id', 'in', tagIds)
        .select(['topics.id', (eb) => eb.fn.countAll<number>().as('shared')])
        .groupBy('topics.id')
        .orderBy('shared', 'desc')
        .limit(5)
        .execute();
      if (scored.length) {
        const rows = await this.db.q.selectFrom('topics').selectAll().where('id', 'in', scored.map((s) => s.id)).execute();
        similar = scored.map((s) => rows.find((r) => r.id === s.id)!).filter(Boolean);
      }
    }
    if (similar.length < 5 && boardIds.length) {
      const more = await live()
        .selectAll('topics')
        .where('topics.board_id', '=', topic.board_id)
        .where('topics.id', 'not in', similar.length ? similar.map((s) => s.id) : [0])
        .orderBy('topics.last_post_at', 'desc')
        .limit(5 - similar.length)
        .execute();
      similar = [...similar, ...more];
    }

    let nextUnread: TopicRelated['nextUnread'] = null;
    if (viewer.user && boardIds.length) {
      const candidates = await live().selectAll('topics').where('topics.board_id', '=', topic.board_id).orderBy('topics.last_post_at', 'desc').limit(40).execute();
      const read = await this.readState(viewer, candidates);
      const next = candidates.find((c) => read.get(c.id)?.unread);
      if (next) nextUnread = { id: next.id, title: next.title, slug: next.slug };
    }
    const items = await this.topicItems(viewer, similar);
    return {
      similar: items.map((it) => {
        const b = visible.get(it.boardId)!.board;
        return { ...it, board: { id: b.id, name: b.name, slug: b.slug }, firstUnreadPostId: null };
      }),
      nextUnread,
      board: { id: access.board.id, name: access.board.name, slug: access.board.slug },
    };
  }

  /** Konuyu görüntüleyen üyeler (moderatörler için görüntülenme kaydı). */
  async topicViewers(viewer: RequestViewer, topicId: number, page: number): Promise<Paginated<TopicViewerItem>> {
    const topic = await this.posts.requireTopic(topicId);
    const access = await this.access.require(viewer, topic.board_id);
    if (!access.can.moderate) throw Errors.forbidden('Görüntülenme kayıtlarını yalnızca moderatörler görebilir.');
    await this.views.flush();
    const perPage = 50;
    const [rows, total] = await Promise.all([
      this.db.q.selectFrom('topic_viewers').selectAll().where('topic_id', '=', topicId).orderBy('last_at', 'desc').limit(perPage).offset((page - 1) * perPage).execute(),
      this.db.q.selectFrom('topic_viewers').select((eb) => eb.fn.countAll<number>().as('n')).where('topic_id', '=', topicId).executeTakeFirst(),
    ]);
    const users = await this.users.summaries(rows.map((r) => r.user_id));
    return {
      items: rows.flatMap((r) => {
        const user = users.get(r.user_id);
        return user ? [{ user, views: r.views, firstAt: r.first_at, lastAt: r.last_at }] : [];
      }),
      total: Number(total?.n ?? 0),
      page,
      perPage,
    };
  }

  /** Üyenin mesajları (görülebilen bölümlerde). */
  async userPosts(viewer: RequestViewer, userId: number, page: number) {
    const visible = await this.visibleForumBoardIds(viewer);
    const perPage = 10;
    if (!visible.size) return { items: [], total: 0, page, perPage };
    const base = () =>
      this.db.q
        .selectFrom('posts')
        .innerJoin('topics', 'topics.id', 'posts.topic_id')
        .where('posts.user_id', '=', userId)
        .where('posts.board_id', 'in', [...visible.keys()])
        .where('posts.deleted_at', 'is', null)
        .where('posts.is_approved', '=', 1)
        .where('topics.deleted_at', 'is', null)
        .where('topics.is_approved', '=', 1)
        .where('topics.is_hidden', '=', 0);
    const [rows, total] = await Promise.all([
      base()
        .select(['posts.id', 'posts.body_html', 'posts.created_at', 'posts.board_id', 'topics.id as topic_id', 'topics.title', 'topics.slug', 'topics.first_post_id'])
        .orderBy('posts.id', 'desc')
        .limit(perPage)
        .offset((page - 1) * perPage)
        .execute(),
      base().select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
    ]);
    return {
      items: rows.map((r) => {
        const b = visible.get(r.board_id)!.board;
        return {
          postId: r.id,
          html: r.body_html,
          createdAt: r.created_at,
          isFirst: r.first_post_id === r.id,
          topic: { id: r.topic_id, title: r.title, slug: r.slug },
          board: { id: b.id, name: b.name, slug: b.slug },
        };
      }),
      total: Number(total?.n ?? 0),
      page,
      perPage,
    };
  }

  /**
   * Gelişmiş arama: konular (başlık ve ilk mesaj) ya da tüm mesajlar; bölüm, etiket, yazar, tarih
   * ve sıralama filtreleri. Yalnızca görüntüleyenin görebildiği bölümler aranır. Türkçe büyük/küçük
   * harf farkı için birkaç yazım varyantıyla eşleştirilir (LIKE yalnızca ASCII'de harf duyarsızdır).
   */
  async search(viewer: RequestViewer, input: SearchQuery): Promise<SearchResults> {
    const query = input.q.replace(/[%_\\]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 100);
    const perPage = 20;
    const page = input.page;
    const empty: SearchResults = { query, type: input.type, topics: [], posts: [], members: [], total: 0, page, perPage };
    const hasFilter = !!(input.board || input.tag || input.author);
    if (query.length < 2 && !hasFilter) return empty;

    const visible = await this.visibleForumBoardIds(viewer);
    let boardIds = [...visible.keys()];
    if (input.board) {
      // Seçilen bölüm ve görülebilen alt bölümleri
      const ids = new Set([input.board]);
      for (let grew = true; grew; ) {
        grew = false;
        for (const a of visible.values()) {
          if (a.board.parent_id && ids.has(a.board.parent_id) && !ids.has(a.board.id)) {
            ids.add(a.board.id);
            grew = true;
          }
        }
      }
      boardIds = boardIds.filter((id) => ids.has(id));
    }
    let userId: number | null = null;
    if (input.author) {
      const u = await this.db.q
        .selectFrom('users')
        .select('id')
        .where((eb) => eb.or([eb('username_canonical', '=', canonicalName(input.author!)), eb('display_name_canonical', '=', canonicalName(input.author!))]))
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!u) return empty;
      userId = u.id;
    }
    let tagId: number | null = null;
    if (input.tag) {
      const t = await this.extras.bySlug(input.tag.toLowerCase());
      if (!t) return empty;
      tagId = t.id;
    }
    const cutoff = input.since ? this.clock.now() - { day: 1, week: 7, month: 30, year: 365 }[input.since] * DAY : null;
    // Türkçe ünsüz yumuşaması: "etkinlik" → "etkinliği", "kitap" → "kitabı" da bulunsun (son ünsüz olmadan ara).
    const stem = query.length >= 5 && /[kpçt]$/i.test(query) && !query.includes(' ') ? query.slice(0, -1) : query;
    const cased = (s: string) => [s, s.toLocaleLowerCase('tr-TR'), s.toLocaleUpperCase('tr-TR'), s.toLocaleLowerCase('tr-TR').replace(/^./, (c) => c.toLocaleUpperCase('tr-TR'))];
    const variants = query ? [...new Set(cased(stem))] : [];
    const patterns = variants.map((v) => `%${v}%`);

    let members: SearchResults['members'] = [];
    if (page === 1 && query.length >= 2 && !hasFilter && can(viewer, 'members.list')) {
      const canonical = likePattern(query);
      const rows = await this.db.q
        .selectFrom('users')
        .select('id')
        .where('status', '=', 'active')
        .where('deleted_at', 'is', null)
        .where((eb) => eb.or([eb('username_canonical', 'like', canonical), eb('display_name_canonical', 'like', canonical)]))
        .orderBy('post_count', 'desc')
        .limit(8)
        .execute();
      const summaries = await this.users.summaries(rows.map((r) => r.id));
      members = rows.map((r) => summaries.get(r.id)!).filter(Boolean);
    }
    if (!boardIds.length) return { ...empty, members };

    const boardOf = (id: number) => {
      const b = visible.get(id)!.board;
      return { id: b.id, name: b.name, slug: b.slug };
    };

    if (input.type === 'posts') {
      const base = () => {
        let q = this.db.q
          .selectFrom('posts as p')
          .innerJoin('topics as t', 't.id', 'p.topic_id')
          .where('p.board_id', 'in', boardIds)
          .where('p.deleted_at', 'is', null)
          .where('p.is_approved', '=', 1)
          .where('t.deleted_at', 'is', null)
          .where('t.is_approved', '=', 1)
          .where('t.is_hidden', '=', 0);
        if (userId) q = q.where('p.user_id', '=', userId);
        if (cutoff) q = q.where('p.created_at', '>=', cutoff);
        if (tagId) q = q.where((eb) => eb.exists(eb.selectFrom('topic_tags').select('topic_tags.topic_id').whereRef('topic_tags.topic_id', '=', 't.id').where('topic_tags.tag_id', '=', tagId)));
        if (patterns.length) q = q.where((eb) => eb.or(patterns.map((p) => eb('p.body_bbcode', 'like', p))));
        return q;
      };
      const [rows, count] = await Promise.all([
        base()
          .select(['p.id', 'p.topic_id', 'p.board_id', 'p.user_id', 'p.author_name', 'p.created_at', 'p.body_bbcode', 't.title', 't.slug', 't.first_post_id'])
          .orderBy('p.id', input.sort === 'oldest' ? 'asc' : 'desc')
          .limit(perPage)
          .offset((page - 1) * perPage)
          .execute(),
        base().select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
      ]);
      const users = await this.users.summaries(rows.map((r) => r.user_id ?? 0));
      return {
        ...empty,
        members,
        total: Number(count?.n ?? 0),
        posts: rows.map((r) => ({
          postId: r.id,
          topicId: r.topic_id,
          topicTitle: r.title,
          topicSlug: r.slug,
          board: boardOf(r.board_id),
          author: r.user_id ? (users.get(r.user_id) ?? null) : null,
          authorName: r.author_name,
          createdAt: r.created_at,
          excerpt: excerptAround(bbcodeToText(r.body_bbcode), stem),
          isFirst: r.id === r.first_post_id,
        })),
      };
    }

    const titleMatch = (eb: ExpressionBuilder<any, any>) => eb.or(patterns.map((p) => eb('t.title', 'like', p)));
    const base = () => {
      let q = this.db.q
        .selectFrom('topics as t')
        .leftJoin('posts as fp', 'fp.id', 't.first_post_id')
        .where('t.board_id', 'in', boardIds)
        .where('t.deleted_at', 'is', null)
        .where('t.is_approved', '=', 1)
        .where('t.is_hidden', '=', 0)
        .where('t.moved_to_topic_id', 'is', null);
      if (userId) q = q.where('t.user_id', '=', userId);
      if (cutoff) q = q.where('t.created_at', '>=', cutoff);
      if (tagId) q = q.where((eb) => eb.exists(eb.selectFrom('topic_tags').select('topic_tags.topic_id').whereRef('topic_tags.topic_id', '=', 't.id').where('topic_tags.tag_id', '=', tagId)));
      if (patterns.length) {
        q = input.titleOnly ? q.where((eb) => titleMatch(eb)) : q.where((eb) => eb.or([titleMatch(eb), ...patterns.map((p) => eb('fp.body_bbcode', 'like', p))]));
      }
      return q;
    };
    let listQ = base().selectAll('t').select('fp.body_bbcode as first_body');
    switch (input.sort) {
      case 'newest':
        listQ = listQ.orderBy('t.created_at', 'desc');
        break;
      case 'oldest':
        listQ = listQ.orderBy('t.created_at', 'asc');
        break;
      case 'replies':
        listQ = listQ.orderBy('t.reply_count', 'desc');
        break;
      case 'views':
        listQ = listQ.orderBy('t.view_count', 'desc');
        break;
      default:
        // Alaka: başlıkta geçenler önce, sonra son etkinlik
        if (patterns.length) listQ = listQ.orderBy((eb) => eb.case().when(titleMatch(eb)).then(0).else(1).end());
        listQ = listQ.orderBy('t.last_post_at', 'desc');
    }
    const [rows, count] = await Promise.all([
      listQ.orderBy('t.id', 'desc').limit(perPage).offset((page - 1) * perPage).execute(),
      base().select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
    ]);
    const ids = rows.map((r) => r.id);
    const [users, tags, polls] = await Promise.all([this.users.summaries(rows.map((r) => r.user_id ?? 0)), this.extras.tagsFor(ids), this.extras.topicsWithPoll(ids)]);
    const topics: SearchResults['topics'] = [];
    for (const r of rows) {
      topics.push({
        id: r.id,
        title: r.title,
        slug: r.slug,
        board: boardOf(r.board_id),
        replyCount: r.reply_count,
        viewCount: r.view_count + this.views.pendingFor(r.id),
        lastPostAt: r.last_post_at,
        createdAt: r.created_at,
        author: r.user_id ? (users.get(r.user_id) ?? null) : null,
        authorName: r.author_name,
        prefix: await this.forum.prefix(r.prefix_id),
        tags: tags.get(r.id) ?? [],
        excerpt: r.first_body ? excerptAround(bbcodeToText(r.first_body), stem) : '',
        hasPoll: polls.has(r.id),
      });
    }
    return { ...empty, members, topics, total: Number(count?.n ?? 0) };
  }

  async markRead(viewer: RequestViewer, boardId: number | null): Promise<void> {
    const user = viewer.user;
    if (!user) throw Errors.unauthenticated();
    const now = this.clock.now();
    if (boardId === null) {
      await this.db.tx(async () => {
        await this.db.q.updateTable('users').set({ mark_read_at: now }).where('id', '=', user.id).execute();
        await this.db.q.deleteFrom('topic_reads').where('user_id', '=', user.id).where('read_at', '<=', now).execute();
        await this.db.q.deleteFrom('board_reads').where('user_id', '=', user.id).execute();
      });
      return;
    }
    await this.access.require(viewer, boardId);
    const { boards } = await this.forum.structure();
    const ids = [boardId];
    for (let k = 0; k < ids.length; k++) ids.push(...boards.filter((b) => b.parent_id === ids[k]).map((b) => b.id));
    await this.db.tx(async () => {
      for (const id of ids) {
        await this.db.q
          .insertInto('board_reads')
          .values({ user_id: user.id, board_id: id, read_at: now })
          .onConflict((oc) => oc.columns(['user_id', 'board_id']).doUpdateSet({ read_at: now }))
          .execute();
      }
    });
  }
}

/** Aranan kelimenin geçtiği yerin çevresinden kısa özet. */
function excerptAround(text: string, needle: string, len = 220): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const i = needle ? t.toLocaleLowerCase('tr-TR').indexOf(needle.toLocaleLowerCase('tr-TR')) : -1;
  const start = i > 60 ? i - 60 : 0;
  const out = t.slice(start, start + len);
  return `${start > 0 ? '…' : ''}${out}${start + len < t.length ? '…' : ''}`;
}
