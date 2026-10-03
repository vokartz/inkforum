import { Inject, Injectable } from '@nestjs/common';
import { plainExcerpt, searchQuerySchema, topicListQuery, type UserSummary } from '@forum/shared';
import { Db } from '../database/db.service.js';
import { CONFIG, type AppConfig } from '../config/config.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import { ForumService } from '../forum/forum.service.js';
import { ForumAccessService } from '../forum/forum-access.service.js';
import { PostsService } from '../forum/posts.service.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { GroupsService } from '../groups/groups.service.js';
import type { RequestViewer } from '../common/request-context.js';
import type { Bridge } from './sandbox.js';

const MAX_CALLS = 40;
const clamp = (v: unknown, min: number, max: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : d;
};
const arg = (v: unknown): Record<string, unknown> => {
  if (typeof v !== 'string' || !v) return {};
  try {
    const o = JSON.parse(v) as unknown;
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

export interface PageUser {
  id: number;
  username: string;
  name: string;
  displayName: string;
  url: string;
  avatarUrl: string | null;
  color: string | null;
  title: string | null;
  group: { id: number; name: string; color: string | null } | null;
}

@Injectable()
export class PageForumApi {
  constructor(
    private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly forum: ForumService,
    private readonly access: ForumAccessService,
    private readonly posts: PostsService,
    private readonly profiles: ProfilesService,
    private readonly groups: GroupsService,
  ) {}

  private origin(): string {
    return this.config.appOrigin ?? '';
  }

  pageUser(u: UserSummary | null | undefined): PageUser | null {
    if (!u) return null;
    return {
      id: u.id,
      username: u.username,
      name: u.displayName,
      displayName: u.displayName,
      url: `/u/${u.id}/${u.slug}`,
      avatarUrl: u.avatarUrl,
      color: u.color,
      title: u.customTitle,
      group: u.primaryGroup ? { id: u.primaryGroup.id, name: u.primaryGroup.name, color: u.primaryGroup.color ?? null } : null,
    };
  }

  site() {
    return {
      name: String(this.settings.get('general.forumName') ?? ''),
      description: String(this.settings.get('general.forumDescription') ?? ''),
      url: this.origin(),
      locale: String(this.settings.get('i18n.defaultLocale') ?? 'tr'),
      version: this.config.version,
      registrationOpen: this.settings.get('registration.mode') !== 'closed',
      now: Date.now(),
    };
  }

  async viewerInfo(viewer: RequestViewer) {
    const u = viewer.user;
    if (!u) return null;
    const summary = (await this.users.summaries([u.id])).get(u.id);
    const groups = await this.groups.listVisible(viewer).catch(() => []);
    const mine = new Set(viewer.groupIds);
    return {
      ...this.pageUser(summary),
      id: u.id,
      username: u.username,
      name: u.display_name,
      email: u.email,
      emailVerified: u.email_verified_at != null,
      groups: [...viewer.groupIds],
      groupList: groups.filter((g) => mine.has(g.id)).map((g) => ({ id: g.id, name: g.name, color: g.color ?? null })),
      primaryGroup: u.primary_group_id,
      isAdmin: viewer.isAdmin,
      isStaff: viewer.isAdmin || [...viewer.permissions].some((p) => p.startsWith('mod.') || p.startsWith('admin.')),
      permissions: [...viewer.permissions],
      postCount: u.post_count,
      reputation: (u as { reputation?: number }).reputation ?? 0,
      achievementPoints: u.achievement_points,
      warningPoints: u.warning_points,
      registeredAt: u.registered_at,
      lastActiveAt: u.last_active_at,
      locale: viewer.locale,
    };
  }

  bridges(viewer: RequestViewer): Record<string, Bridge> {
    let calls = 0;
    const wrap =
      (name: string, fn: (...a: unknown[]) => Promise<unknown>): Bridge =>
      async (...a: unknown[]) => {
        if (++calls > MAX_CALLS) throw new Error(`Bir istekte forum verisine en fazla ${MAX_CALLS} çağrı yapılabilir.`);
        try {
          return JSON.stringify((await fn(...a)) ?? null);
        } catch (err) {
          const status = (err as { getStatus?: () => number }).getStatus?.() ?? (err as { status?: number }).status;
          if (status && status >= 400 && status < 500) return 'null';
          throw new Error(`forum.${name}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
        }
      };

    return {
      fStats: wrap('stats', async () => {
        const idx = await this.forum.index(viewer);
        return {
          members: idx.stats.members,
          topics: idx.stats.topics,
          posts: idx.stats.posts,
          newestMember: this.pageUser(idx.stats.newestMember),
          online: idx.online ? { members: idx.online.total, guests: idx.online.guests, total: idx.online.total + idx.online.guests } : null,
        };
      }),
      fOnline: wrap('online', async () => {
        const o = await this.profiles.online(viewer);
        return { members: o.total, guests: o.guests, total: o.total + o.guests, users: o.users.filter((u) => !u.hidden).map((u) => this.pageUser(u)) };
      }),
      fUser: wrap('user', async (idOrName: unknown) => {
        const id = await this.resolveUser(idOrName);
        if (!id) return null;
        const p = await this.profiles.publicProfile(viewer, id);
        return {
          ...this.pageUser(p.user),
          isOnline: p.isOnline,
          registeredAt: p.registeredAt,
          lastActiveAt: p.lastActiveAt,
          postCount: p.postCount,
          achievementPoints: p.achievementPoints,
          location: p.location || null,
          website: p.websiteUrl || null,
          age: p.age,
          groups: p.groups.map((g: { id: number; name: string; color?: string | null }) => ({ id: g.id, name: g.name, color: g.color ?? null })),
          fields: p.customFields,
          warningPoints: p.warnings?.points ?? null,
          achievements: p.achievements.recent.map((a: { name: string; icon?: unknown; points?: number }) => ({ name: a.name, points: a.points ?? 0 })),
        };
      }),
      fMembers: wrap('members', async (opts: unknown) => {
        const o = arg(opts);
        const sort = ['registered', 'name', 'posts', 'active', 'achievements'].includes(String(o.sort)) ? (o.sort as 'registered') : 'registered';
        const res = (await this.profiles.memberList(viewer, {
          q: String(o.search ?? o.q ?? '').slice(0, 50),
          group: o.group ? clamp(o.group, 1, 1e9, 0) || undefined : undefined,
          sort,
          dir: o.dir === 'asc' ? 'asc' : 'desc',
          page: clamp(o.page, 1, 1000, 1),
          perPage: clamp(o.limit, 1, 100, 20),
        })) as { items: Array<{ user: UserSummary; postCount?: number; registeredAt?: number }>; total: number };
        return { total: res.total, items: res.items.map((i) => ({ ...this.pageUser(i.user), postCount: i.postCount ?? null, registeredAt: i.registeredAt ?? null })) };
      }),
      fGroups: wrap('groups', async () => {
        const list = await this.groups.listVisible(viewer);
        return list.map((g) => ({ id: g.id, name: g.name, description: g.description ?? '', color: g.color ?? null, memberCount: g.memberCount, isMember: g.isMember }));
      }),
      fGroupMembers: wrap('groupMembers', async (groupId: unknown, limit: unknown) => {
        const id = clamp(groupId, 1, 1e9, 0);
        if (!id) return null;
        await this.groups.getVisible(viewer, id);
        const res = (await this.groups.members(id, 1, clamp(limit, 1, 100, 30))) as { items: Array<{ user: UserSummary }>; total: number };
        return { total: res.total, items: res.items.map((i) => this.pageUser(i.user)) };
      }),
      fBoards: wrap('boards', async () => {
        const idx = await this.forum.index(viewer);
        return idx.categories.map((c) => ({
          id: c.id,
          name: c.name,
          boards: c.boards.map((b) => ({
            id: b.id,
            name: b.name,
            description: b.description,
            url: b.type === 'redirect' && b.redirectUrl ? b.redirectUrl : `/f/${b.id}/${b.slug}`,
            topicCount: b.topicCount,
            postCount: b.postCount,
            lastPostAt: b.lastPost?.at ?? null,
            children: b.children.map((ch) => ({ id: ch.id, name: ch.name, url: `/f/${ch.id}/${ch.slug}` })),
          })),
        }));
      }),
      fTopics: wrap('topics', async (opts: unknown) => {
        const o = arg(opts);
        const limit = clamp(o.limit, 1, 50, 10);
        const board = clamp(o.board, 0, 1e9, 0);
        if (board) {
          const sorts: Record<string, string> = { latest: 'last_post', newest: 'created', replies: 'replies', views: 'views', title: 'title' };
          const page = await this.forum.boardPage(viewer, board, topicListQuery.parse({ page: 1, sort: sorts[String(o.sort)] ?? 'last_post', dir: o.sort === 'title' ? 'asc' : 'desc' }));
          return page.topics.items.slice(0, limit).map((tp) => ({
            id: tp.id,
            title: tp.title,
            url: `/t/${tp.id}/${tp.slug}`,
            author: this.pageUser(tp.author) ?? { name: tp.authorName },
            replies: tp.replyCount,
            views: tp.viewCount,
            pinned: tp.isPinned,
            locked: tp.isLocked,
            tags: tp.tags.map((t) => t.name),
            createdAt: tp.createdAt,
            lastPostAt: tp.lastPost.at,
          }));
        }
        const recent = await this.forum.recent(viewer, limit);
        return recent.map((r) => ({
          id: r.topicId,
          title: r.title,
          url: `/t/${r.topicId}/${r.slug}`,
          board: { id: r.board.id, name: r.board.name, url: `/f/${r.board.id}/${r.board.slug}` },
          author: this.pageUser(r.author) ?? { name: r.authorName },
          replies: r.replyCount,
          lastPostAt: r.at,
          excerpt: r.excerpt,
        }));
      }),
      fTopic: wrap('topic', async (topicId: unknown) => {
        const id = clamp(topicId, 1, 1e12, 0);
        if (!id) return null;
        const topic = await this.db.q.selectFrom('topics').selectAll().where('id', '=', id).where('deleted_at', 'is', null).executeTakeFirst();
        if (!topic) return null;
        const acc = await this.access.require(viewer, topic.board_id);
        await this.posts.assertTopicVisible(viewer, acc, topic);
        const first = topic.first_post_id ? await this.db.q.selectFrom('posts').select(['body_html', 'created_at']).where('id', '=', topic.first_post_id).executeTakeFirst() : undefined;
        const author = topic.user_id ? (await this.users.summaries([topic.user_id])).get(topic.user_id) : null;
        const board = await this.db.q.selectFrom('boards').select(['id', 'name', 'slug']).where('id', '=', topic.board_id).executeTakeFirst();
        return {
          id: topic.id,
          title: topic.title,
          url: `/t/${topic.id}/${topic.slug}`,
          board: board ? { id: board.id, name: board.name, url: `/f/${board.id}/${board.slug}` } : null,
          author: this.pageUser(author) ?? { name: topic.author_name },
          replies: topic.reply_count,
          views: topic.view_count,
          pinned: topic.is_pinned === 1,
          locked: topic.is_locked === 1,
          createdAt: topic.created_at,
          lastPostAt: topic.last_post_at,
          html: first?.body_html ?? '',
          text: plainExcerpt(first?.body_html ?? '', 2000),
        };
      }),
      fUserTopics: wrap('userTopics', async (userId: unknown, limit: unknown) => {
        const id = await this.resolveUser(userId);
        if (!id) return null;
        const res = await this.forum.userTopics(viewer, id, 1);
        return res.items.slice(0, clamp(limit, 1, 50, 10)).map((tp) => {
          const item = tp as unknown as { id?: number; topicId?: number; title: string; slug: string; replyCount?: number; lastPostAt?: number; at?: number };
          const tid = item.id ?? item.topicId;
          return { id: tid, title: item.title, url: `/t/${tid}/${item.slug}`, replies: item.replyCount ?? null, lastPostAt: item.lastPostAt ?? item.at ?? null };
        });
      }),
      fSearch: wrap('search', async (query: unknown, opts: unknown) => {
        const o = arg(opts);
        const q = String(query ?? '').trim().slice(0, 100);
        if (q.length < 2) return [];
        const res = await this.forum.search(viewer, searchQuerySchema.parse({ q, type: 'topics', titleOnly: o.titleOnly === true, board: o.board ? clamp(o.board, 1, 1e9, 1) : undefined }));
        return res.topics.slice(0, clamp(o.limit, 1, 30, 10)).map((tp) => ({
          id: tp.id,
          title: tp.title,
          url: `/t/${tp.id}/${tp.slug}`,
          board: { id: tp.board.id, name: tp.board.name },
          author: this.pageUser(tp.author),
          replies: tp.replyCount,
          views: tp.viewCount,
          lastPostAt: tp.lastPostAt,
        }));
      }),
    };
  }

  private async resolveUser(v: unknown): Promise<number | null> {
    if (typeof v === 'number' || /^\d+$/.test(String(v))) {
      const n = Number(v);
      return Number.isInteger(n) && n > 0 ? n : null;
    }
    const name = String(v ?? '').trim().toLowerCase();
    if (!name || name.length > 60) return null;
    const row = await this.db.q
      .selectFrom('users')
      .select('id')
      .where('deleted_at', 'is', null)
      .where((eb) => eb.or([eb('username_canonical', '=', name), eb('display_name_canonical', '=', name)]))
      .executeTakeFirst();
    return row?.id ?? null;
  }
}
