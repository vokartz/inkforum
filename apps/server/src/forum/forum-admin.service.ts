import { Injectable } from '@nestjs/common';
import {
  BOARD_PERMISSIONS,
  PERMISSION_CATEGORIES,
  parseTopicTemplate,
  slugify,
  type AdminBoard,
  type AdminCategory,
  type PermissionProfileSummary,
  type boardInputSchema,
  type categoryInputSchema,
  type prefixInputSchema,
  type reorderSchema,
} from '@forum/shared';
import type { z } from 'zod';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { StorageService } from '../storage/storage.service.js';
import { UsersService } from '../users/users.service.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { toJson } from '../database/json.js';
import { iconExists } from '../common/icons.js';
import type { RequestViewer } from '../common/request-context.js';
import type { UploadedImage } from '../common/upload.js';
import { ForumCacheService, type CachedBoard } from './forum-cache.service.js';
import { ForumCountersService } from './forum-counters.service.js';
import { PostRenderService } from './post-render.service.js';

type BoardInput = z.output<typeof boardInputSchema>;

function boardSlug(name: string): string {
  const s = slugify(name).slice(0, 60).replace(/-+$/, '');
  return s && s !== 'uye' ? s : 'bolum';
}

@Injectable()
export class ForumAdminService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly users: UsersService,
    private readonly groups: GroupCacheService,
    private readonly permissions: PermissionsService,
    private readonly forum: ForumCacheService,
    private readonly counters: ForumCountersService,
    private readonly render: PostRenderService,
  ) {}

  private log(viewer: RequestViewer, action: string, targetType: string, targetId: number | null, data?: Record<string, unknown>) {
    return this.audit.log({ type: 'admin', action, actorId: viewer.user!.id, targetType, targetId, ip: viewer.ip, data });
  }

  // ---------- Ağaç ----------

  async tree(): Promise<AdminCategory[]> {
    const { categories, boards } = await this.forum.structure();
    const counters = await this.db.q.selectFrom('boards').select(['id', 'topic_count', 'post_count', 'redirect_clicks']).execute();
    const c = new Map(counters.map((r) => [r.id, r]));
    const users = await this.users.summaries(boards.flatMap((b) => b.moderatorUserIds));
    const groupMap = await this.groups.map();
    const mods = await this.db.q.selectFrom('board_moderators').selectAll().orderBy('id').execute();
    const toAdmin = (b: CachedBoard): AdminBoard => ({
      id: b.id,
      categoryId: b.category_id,
      parentId: b.parent_id,
      type: b.type,
      name: b.name,
      slug: b.slug,
      description: b.description,
      icon: this.forum.icon(b),
      redirectUrl: b.redirect_url,
      redirectClicks: c.get(b.id)?.redirect_clicks ?? 0,
      permissionProfileId: b.permission_profile_id,
      countPosts: b.count_posts === 1,
      requireApprovalTopics: b.require_approval_topics === 1,
      requireApprovalPosts: b.require_approval_posts === 1,
      privateTopics: b.private_topics === 1,
      topicTemplate: parseTopicTemplate(b.topic_template_json),
      isHidden: b.is_hidden === 1,
      sortOrder: b.sort_order,
      topicCount: c.get(b.id)?.topic_count ?? 0,
      postCount: c.get(b.id)?.post_count ?? 0,
      cover: b.coverUrl,
      about: b.about,
      moderators: mods
        .filter((m) => m.board_id === b.id)
        .map((m) => ({
          id: m.id,
          kind: m.user_id ? ('user' as const) : ('group' as const),
          user: m.user_id ? (users.get(m.user_id) ?? null) : null,
          group: m.group_id && groupMap.get(m.group_id) ? this.groups.badge(groupMap.get(m.group_id)!) : null,
        })),
    });
    return categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      isCollapsible: cat.is_collapsible === 1,
      background: cat.bgUrl,
      sortOrder: cat.sort_order,
      boards: boards.filter((b) => b.category_id === cat.id).map(toAdmin),
    }));
  }

  // ---------- Kategoriler ----------

  async createCategory(viewer: RequestViewer, input: z.output<typeof categoryInputSchema>): Promise<number> {
    const now = this.clock.now();
    const max = await this.db.q.selectFrom('forum_categories').select((eb) => eb.fn.max('sort_order').as('m')).executeTakeFirst();
    const row = await this.db.q
      .insertInto('forum_categories')
      .values({
        name: input.name,
        description: input.description,
        is_collapsible: input.isCollapsible,
        sort_order: Number(max?.m ?? 0) + 1,
        created_at: now,
        updated_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.forum.invalidate();
    await this.log(viewer, 'forum.category.create', 'category', row.id, { name: input.name });
    return row.id;
  }

  async updateCategory(viewer: RequestViewer, id: number, input: z.output<typeof categoryInputSchema>): Promise<void> {
    const res = await this.db.q
      .updateTable('forum_categories')
      .set({ name: input.name, description: input.description, is_collapsible: input.isCollapsible, updated_at: this.clock.now() })
      .where('id', '=', id)
      .executeTakeFirst();
    if (!Number(res.numUpdatedRows)) throw Errors.notFound('Kategori bulunamadı.');
    await this.forum.invalidate();
    await this.log(viewer, 'forum.category.update', 'category', id, { name: input.name });
  }

  /** Kategori başlığının arka plan görseli (null = kaldır). */
  async setCategoryBackground(viewer: RequestViewer, id: number, file: UploadedImage | null): Promise<{ url: string | null }> {
    const cat = await this.db.q.selectFrom('forum_categories').select(['id', 'bg_file_id']).where('id', '=', id).executeTakeFirst();
    if (!cat) throw Errors.notFound('Kategori bulunamadı.');
    const saved = file
      ? await this.storage.saveImage(file.buffer, { purpose: 'category_bg', ownerUserId: viewer.user!.id, maxBytes: 4 * 1024 * 1024, maxDimension: 4000 })
      : null;
    await this.db.q.updateTable('forum_categories').set({ bg_file_id: saved?.id ?? null, updated_at: this.clock.now() }).where('id', '=', id).execute();
    if (cat.bg_file_id) await this.storage.delete(cat.bg_file_id);
    await this.forum.invalidate();
    await this.log(viewer, file ? 'forum.category.background' : 'forum.category.background.remove', 'category', id);
    return { url: saved ? this.storage.publicUrl(saved) : null };
  }

  async deleteCategory(viewer: RequestViewer, id: number): Promise<void> {
    const board = await this.db.q.selectFrom('boards').select('id').where('category_id', '=', id).executeTakeFirst();
    if (board) throw Errors.badRequest('Kategoride bölüm var. Önce bölümleri başka kategoriye taşıyın veya silin.');
    const cat = await this.db.q.selectFrom('forum_categories').select('bg_file_id').where('id', '=', id).executeTakeFirst();
    await this.db.q.deleteFrom('forum_categories').where('id', '=', id).execute();
    if (cat?.bg_file_id) await this.storage.delete(cat.bg_file_id);
    await this.forum.invalidate();
    await this.log(viewer, 'forum.category.delete', 'category', id);
  }

  // ---------- Bölümler ----------

  private async validateBoard(input: BoardInput, id: number | null): Promise<void> {
    const cat = await this.db.q.selectFrom('forum_categories').select('id').where('id', '=', input.categoryId).executeTakeFirst();
    if (!cat) throw Errors.field('categoryId', 'Kategori bulunamadı.');
    if (input.icon.kind === 'icon' && !iconExists(input.icon.name)) throw Errors.field('icon', 'Seçilen ikon bulunamadı.');
    if (input.parentId) {
      const { byId } = await this.forum.structure();
      const parent = byId.get(input.parentId);
      if (!parent) throw Errors.field('parentId', 'Üst bölüm bulunamadı.');
      if (parent.category_id !== input.categoryId) throw Errors.field('parentId', 'Üst bölüm aynı kategoride olmalı.');
      if (parent.type !== 'forum') throw Errors.field('parentId', 'Bağlantı bölümünün alt bölümü olamaz.');
      if (id !== null) {
        let cur: CachedBoard | undefined = parent;
        for (let d = 0; cur && d < 20; d++) {
          if (cur.id === id) throw Errors.field('parentId', 'Bir bölüm kendi alt bölümünün altına taşınamaz.');
          cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
        }
      }
    }
    if (input.permissionProfileId) {
      const exists = (await this.permissions.profiles()).some((p) => p.id === input.permissionProfileId);
      if (!exists) throw Errors.field('permissionProfileId', 'Yetki profili bulunamadı.');
    }
  }

  private boardValues(input: BoardInput) {
    return {
      category_id: input.categoryId,
      parent_id: input.parentId,
      type: input.type,
      name: input.name,
      slug: boardSlug(input.name),
      description: input.description,
      icon_kind: input.icon.kind,
      icon_name: input.icon.name,
      icon_color: input.icon.color,
      redirect_url: input.type === 'redirect' ? input.redirectUrl : null,
      permission_profile_id: input.permissionProfileId,
      count_posts: input.countPosts,
      require_approval_topics: input.requireApprovalTopics,
      require_approval_posts: input.requireApprovalPosts,
      private_topics: input.privateTopics,
      topic_template_json: input.topicTemplate.enabled || input.topicTemplate.fields.length ? JSON.stringify(input.topicTemplate) : '',
      is_hidden: input.isHidden,
      about: input.about,
      about_html: input.about.trim() ? this.render.post(input.about).html : '',
    };
  }

  async createBoard(viewer: RequestViewer, input: BoardInput): Promise<number> {
    await this.validateBoard(input, null);
    const now = this.clock.now();
    const max = await this.db.q
      .selectFrom('boards')
      .select((eb) => eb.fn.max('sort_order').as('m'))
      .where('category_id', '=', input.categoryId)
      .executeTakeFirst();
    const row = await this.db.q
      .insertInto('boards')
      .values({ ...this.boardValues(input), sort_order: Number(max?.m ?? 0) + 1, created_at: now, updated_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.forum.invalidate();
    await this.log(viewer, 'forum.board.create', 'board', row.id, { name: input.name });
    return row.id;
  }

  async updateBoard(viewer: RequestViewer, id: number, input: BoardInput): Promise<void> {
    const board = await this.forum.board(id);
    if (!board) throw Errors.notFound('Bölüm bulunamadı.');
    await this.validateBoard(input, id);
    if (input.type === 'redirect' && board.type === 'forum') {
      const topic = await this.db.q.selectFrom('topics').select('id').where('board_id', '=', id).executeTakeFirst();
      if (topic) throw Errors.field('type', 'Konusu olan bölüm bağlantıya dönüştürülemez.');
    }
    const values = this.boardValues(input);
    // Görsel ikon seçiliyken dosya korunur; başka türe geçilince dosya silinir.
    await this.db.tx(async () => {
      await this.db.q
        .updateTable('boards')
        .set({ ...values, icon_file_id: input.icon.kind === 'image' ? board.icon_file_id : null, updated_at: this.clock.now() })
        .where('id', '=', id)
        .execute();
      if (input.icon.kind !== 'image' && board.icon_file_id) await this.storage.delete(board.icon_file_id);
      // Kategori değişince alt bölümler de taşınır.
      if (input.categoryId !== board.category_id) {
        const { boards } = await this.forum.structure();
        const ids: number[] = [id];
        for (let k = 0; k < ids.length; k++) ids.push(...boards.filter((b) => b.parent_id === ids[k]).map((b) => b.id));
        await this.db.q.updateTable('boards').set({ category_id: input.categoryId }).where('id', 'in', ids).execute();
      }
    });
    if (board.count_posts !== (input.countPosts ? 1 : 0)) {
      // Mesaj sayma politikası değişti: etkilenen üyelerin sayaçlarını yeniden hesapla.
      const authors = await this.db.q.selectFrom('posts').select('user_id').distinct().where('board_id', '=', id).where('user_id', 'is not', null).execute();
      for (const a of authors) {
        await this.counters.recountUserPosts(a.user_id!);
        await this.users.recalcPostGroup(a.user_id!);
      }
    }
    await this.forum.invalidate();
    await this.log(viewer, 'forum.board.update', 'board', id, { name: input.name });
  }

  /** Bölüm sayfasının kapak fotoğrafı (geniş görsel; null = kaldır). */
  async setBoardCover(viewer: RequestViewer, id: number, file: UploadedImage | null): Promise<{ url: string | null }> {
    const board = await this.forum.board(id);
    if (!board) throw Errors.notFound('Bölüm bulunamadı.');
    const saved = file
      ? await this.storage.saveImage(file.buffer, { purpose: 'board_cover', ownerUserId: viewer.user!.id, maxBytes: 6 * 1024 * 1024, maxDimension: 5000 })
      : null;
    await this.db.q.updateTable('boards').set({ cover_file_id: saved?.id ?? null, updated_at: this.clock.now() }).where('id', '=', id).execute();
    if (board.cover_file_id) await this.storage.delete(board.cover_file_id);
    await this.forum.invalidate();
    await this.log(viewer, file ? 'forum.board.cover' : 'forum.board.cover.remove', 'board', id);
    return { url: saved ? this.storage.publicUrl(saved) : null };
  }

  async uploadIcon(viewer: RequestViewer, id: number, file: UploadedImage): Promise<{ url: string | null }> {
    const board = await this.forum.board(id);
    if (!board) throw Errors.notFound('Bölüm bulunamadı.');
    if (!file) throw Errors.field('file', 'Dosya seçilmedi.');
    const saved = await this.storage.saveImage(file.buffer, { purpose: 'board_icon', ownerUserId: viewer.user!.id, maxBytes: 512 * 1024, resizeTo: 128 });
    await this.db.tx(async () => {
      await this.db.q.updateTable('boards').set({ icon_kind: 'image', icon_file_id: saved.id, updated_at: this.clock.now() }).where('id', '=', id).execute();
      if (board.icon_file_id) await this.storage.delete(board.icon_file_id);
    });
    await this.forum.invalidate();
    await this.log(viewer, 'forum.board.icon', 'board', id);
    return { url: this.storage.publicUrl(saved) };
  }

  /** Bölümü siler. Konular varsa önce hedef bölüme taşınır; alt bölümler varsa silinmez. */
  async deleteBoard(viewer: RequestViewer, id: number, moveTopicsTo: number | null): Promise<void> {
    const board = await this.forum.board(id);
    if (!board) throw Errors.notFound('Bölüm bulunamadı.');
    const { boards } = await this.forum.structure();
    if (boards.some((b) => b.parent_id === id)) throw Errors.badRequest('Bu bölümün alt bölümleri var. Önce onları taşıyın veya silin.');
    const hasTopics = await this.db.q.selectFrom('topics').select('id').where('board_id', '=', id).executeTakeFirst();
    if (hasTopics) {
      if (!moveTopicsTo) throw Errors.field('moveTopicsTo', 'Bölümde konular var. Konuların taşınacağı bölümü seçin.');
      const target = boards.find((b) => b.id === moveTopicsTo);
      if (!target || target.id === id || target.type !== 'forum') throw Errors.field('moveTopicsTo', 'Hedef bölüm geçersiz.');
    }
    await this.db.tx(async () => {
      if (hasTopics && moveTopicsTo) {
        await this.db.q.updateTable('topics').set({ board_id: moveTopicsTo }).where('board_id', '=', id).execute();
        await this.db.q.updateTable('posts').set({ board_id: moveTopicsTo }).where('board_id', '=', id).execute();
        await this.counters.recountBoard(moveTopicsTo);
      }
      await this.db.q.deleteFrom('board_reads').where('board_id', '=', id).execute();
      await this.db.q.deleteFrom('board_moderators').where('board_id', '=', id).execute();
      await this.db.q.deleteFrom('boards').where('id', '=', id).execute();
      if (board.icon_file_id) await this.storage.delete(board.icon_file_id);
    });
    await this.forum.invalidate();
    await this.log(viewer, 'forum.board.delete', 'board', id, { name: board.name, movedTo: moveTopicsTo });
  }

  async reorder(viewer: RequestViewer, input: z.output<typeof reorderSchema>): Promise<void> {
    const { byId } = await this.forum.structure();
    const seen = new Set<number>();
    for (const cat of input.categories) {
      for (const b of cat.boards) {
        if (!byId.has(b.id) || seen.has(b.id)) throw Errors.badRequest('Geçersiz sıralama.');
        seen.add(b.id);
        if (b.parentId) {
          const parentInCat = cat.boards.some((x) => x.id === b.parentId);
          if (!parentInCat || b.parentId === b.id) throw Errors.badRequest('Alt bölüm, üst bölümüyle aynı kategoride olmalı.');
        }
      }
    }
    await this.db.tx(async () => {
      for (const [ci, cat] of input.categories.entries()) {
        await this.db.q.updateTable('forum_categories').set({ sort_order: ci }).where('id', '=', cat.id).execute();
        for (const [bi, b] of cat.boards.entries()) {
          await this.db.q
            .updateTable('boards')
            .set({ category_id: cat.id, parent_id: b.parentId, sort_order: bi })
            .where('id', '=', b.id)
            .execute();
        }
      }
    });
    await this.forum.invalidate();
    await this.log(viewer, 'forum.reorder', 'forum', null);
  }

  async setModerators(viewer: RequestViewer, boardId: number, userIds: number[], groupIds: number[]): Promise<void> {
    const board = await this.forum.board(boardId);
    if (!board) throw Errors.notFound('Bölüm bulunamadı.');
    const users = await this.db.q.selectFrom('users').select('id').where('id', 'in', userIds.length ? userIds : [0]).where('deleted_at', 'is', null).execute();
    const groupMap = await this.groups.map();
    const validGroups = groupIds.filter((g) => groupMap.get(g) && groupMap.get(g)!.kind !== 'system');
    const now = this.clock.now();
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('board_moderators').where('board_id', '=', boardId).execute();
      const rows = [
        ...users.map((u) => ({ board_id: boardId, user_id: u.id, group_id: null, created_at: now })),
        ...validGroups.map((g) => ({ board_id: boardId, user_id: null, group_id: g, created_at: now })),
      ];
      if (rows.length) await this.db.q.insertInto('board_moderators').values(rows).execute();
    });
    await this.forum.invalidate();
    await this.permissions.invalidate();
    await this.log(viewer, 'forum.board.moderators', 'board', boardId, { userIds: users.map((u) => u.id), groupIds: validGroups });
  }

  // ---------- Önekler ----------

  async prefixes() {
    const { prefixes } = await this.forum.structure();
    return prefixes;
  }

  async createPrefix(viewer: RequestViewer, input: z.output<typeof prefixInputSchema>): Promise<number> {
    const max = await this.db.q.selectFrom('topic_prefixes').select((eb) => eb.fn.max('sort_order').as('m')).executeTakeFirst();
    const row = await this.db.q
      .insertInto('topic_prefixes')
      .values({
        name: input.name,
        color: input.color,
        board_ids_json: input.boardIds?.length ? toJson(input.boardIds) : null,
        sort_order: Number(max?.m ?? 0) + 1,
        created_at: this.clock.now(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.forum.invalidate();
    await this.log(viewer, 'forum.prefix.create', 'prefix', row.id, { name: input.name });
    return row.id;
  }

  async updatePrefix(viewer: RequestViewer, id: number, input: z.output<typeof prefixInputSchema>): Promise<void> {
    const res = await this.db.q
      .updateTable('topic_prefixes')
      .set({ name: input.name, color: input.color, board_ids_json: input.boardIds?.length ? toJson(input.boardIds) : null })
      .where('id', '=', id)
      .executeTakeFirst();
    if (!Number(res.numUpdatedRows)) throw Errors.notFound('Önek bulunamadı.');
    await this.forum.invalidate();
    await this.log(viewer, 'forum.prefix.update', 'prefix', id, { name: input.name });
  }

  async deletePrefix(viewer: RequestViewer, id: number): Promise<void> {
    await this.db.tx(async () => {
      await this.db.q.updateTable('topics').set({ prefix_id: null }).where('prefix_id', '=', id).execute();
      await this.db.q.deleteFrom('topic_prefixes').where('id', '=', id).execute();
    });
    await this.forum.invalidate();
    await this.log(viewer, 'forum.prefix.delete', 'prefix', id);
  }

  // ---------- Yetki profilleri ----------

  async profileList(): Promise<PermissionProfileSummary[]> {
    const profiles = await this.permissions.profiles();
    const counts = await this.db.q
      .selectFrom('boards')
      .select(['permission_profile_id', (eb) => eb.fn.countAll<number>().as('n')])
      .groupBy('permission_profile_id')
      .execute();
    const defaultId = await this.permissions.defaultProfileId();
    const byProfile = new Map<number, number>();
    for (const c of counts) {
      const pid = c.permission_profile_id ?? defaultId;
      byProfile.set(pid, (byProfile.get(pid) ?? 0) + Number(c.n));
    }
    return profiles.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      isSystem: p.is_system === 1,
      boardCount: byProfile.get(p.id) ?? 0,
    }));
  }

  async profileMatrix(profileId: number) {
    const profile = (await this.profileList()).find((p) => p.id === profileId);
    if (!profile) throw Errors.notFound('Yetki profili bulunamadı.');
    // Bölüm yetkilerinde en önemli sütunlar misafir ve üye: başa alınır.
    const rank = (k: string | null) => (k === 'guest' ? 0 : k === 'member' ? 1 : 2);
    const groups = [...(await this.groups.all())].sort((a, b) => rank(a.system_key) - rank(b.system_key));
    const values = await this.permissions.profileEntries(profileId);
    const { boards } = await this.forum.structure();
    const defaultId = await this.permissions.defaultProfileId();
    return {
      profile,
      boards: boards.filter((b) => (b.permission_profile_id ?? defaultId) === profileId).map((b) => ({ id: b.id, name: b.name })),
      categories: PERMISSION_CATEGORIES.filter((c) => BOARD_PERMISSIONS.some((p) => p.category === c.key)),
      permissions: BOARD_PERMISSIONS.map((p) => ({
        key: p.key,
        scope: p.scope,
        category: p.category,
        label: p.label,
        description: p.description ?? null,
        guestGrantable: p.guestGrantable,
        dangerous: !!p.dangerous,
      })),
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        color: g.color,
        systemKey: g.system_key,
        kind: g.kind,
        editable: g.system_key !== 'admin' && !g.parent_id,
        inheritsFrom: g.parent_id,
      })),
      values: Object.fromEntries(groups.map((g) => [g.id, values[g.id] ?? {}])),
    };
  }

  /** Bakım: tüm sayaçları yeniden hesaplar. */
  async recountAll(viewer: RequestViewer): Promise<void> {
    const topics = await this.db.q.selectFrom('topics').select('id').where('moved_to_topic_id', 'is', null).execute();
    for (const t of topics) await this.counters.recountTopic(t.id);
    const boards = await this.db.q.selectFrom('boards').select('id').execute();
    for (const b of boards) await this.counters.recountBoard(b.id);
    await this.log(viewer, 'forum.recount', 'forum', null);
  }
}
