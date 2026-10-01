import { Injectable, type OnModuleInit } from '@nestjs/common';
import { sql } from 'kysely';
import type { UserSummary } from '@forum/shared';
import { Db } from '../database/db.service.js';
import { Clock, HOUR } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { GroupCacheService, type CachedGroup } from './group-cache.service.js';
import { UsersService } from '../users/users.service.js';
import { StorageService } from '../storage/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EventsService } from '../events/events.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { can, type RequestViewer } from '../common/request-context.js';
import type { GroupInput } from './groups.schemas.js';
import { bool } from '../database/json.js';

export interface GroupDto {
  id: number;
  systemKey: string | null;
  name: string;
  description: string;
  color: string | null;
  iconUrl: string | null;
  iconCount: number;
  kind: string;
  minPosts: number | null;
  joinType: string;
  visibility: string;
  parentId: number | null;
  require2fa: boolean;
  isProtected: boolean;
  sortOrder: number;
  memberCount: number;
}

const RECALC_JOB = 'groups.recalcPostGroups';
const NON_ASSIGNABLE = new Set(['guest', 'member', 'moderator']);

@Injectable()
export class GroupsService implements OnModuleInit {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly cache: GroupCacheService,
    private readonly users: UsersService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    this.jobs.schedule('groups.expire', HOUR, () => this.expireMemberships().then(() => undefined));
    this.jobs.register(RECALC_JOB, () => this.recalcAllPostGroups());
  }

  toDto(g: CachedGroup): GroupDto {
    return {
      id: g.id,
      systemKey: g.system_key,
      name: g.name,
      description: g.description,
      color: g.color,
      iconUrl: g.iconUrl,
      iconCount: g.icon_count,
      kind: g.kind,
      minPosts: g.min_posts,
      joinType: g.join_type,
      visibility: g.visibility,
      parentId: g.parent_id,
      require2fa: bool(g.require_2fa),
      isProtected: bool(g.is_protected),
      sortOrder: g.sort_order,
      memberCount: g.member_count,
    };
  }

  async require(id: number): Promise<CachedGroup> {
    const g = await this.cache.get(id);
    if (!g) throw Errors.notFound('Grup bulunamadı.');
    return g;
  }

  isAssignable(g: CachedGroup): boolean {
    return g.kind === 'regular' && !NON_ASSIGNABLE.has(g.system_key ?? '');
  }

  // ---------- Herkese açık ----------

  /** Üyenin görebileceği gruplar. Gizli gruplar yalnızca üyelerine ve yöneticilere görünür. */
  async listVisible(viewer: RequestViewer): Promise<Array<GroupDto & { isMember: boolean; hasPendingRequest: boolean }>> {
    const all = await this.cache.all();
    const manage = can(viewer, 'admin.groups.manage');
    const pending = viewer.user
      ? new Set(
          (
            await this.db.q
              .selectFrom('group_join_requests')
              .select('group_id')
              .where('user_id', '=', viewer.user.id)
              .where('status', '=', 'pending')
              .execute()
          ).map((r) => r.group_id),
        )
      : new Set<number>();
    return all
      .filter((g) => g.system_key !== 'guest' && g.system_key !== 'member')
      .filter((g) => manage || g.visibility !== 'hidden' || viewer.groupIds.includes(g.id))
      .map((g) => ({ ...this.toDto(g), isMember: viewer.groupIds.includes(g.id), hasPendingRequest: pending.has(g.id) }));
  }

  async getVisible(viewer: RequestViewer, id: number) {
    const g = await this.require(id);
    if (g.system_key === 'guest' || g.system_key === 'member') throw Errors.notFound('Grup bulunamadı.');
    if (g.visibility === 'hidden' && !can(viewer, 'admin.groups.manage') && !viewer.groupIds.includes(g.id)) {
      throw Errors.notFound('Grup bulunamadı.');
    }
    const moderators = await this.moderatorIds(id);
    const summaries = await this.users.summaries(moderators);
    const pending = viewer.user
      ? await this.db.q
          .selectFrom('group_join_requests')
          .select('id')
          .where('group_id', '=', id)
          .where('user_id', '=', viewer.user.id)
          .where('status', '=', 'pending')
          .executeTakeFirst()
      : undefined;
    return {
      ...this.toDto(g),
      isMember: viewer.groupIds.includes(g.id),
      isPrimary: viewer.user?.primary_group_id === g.id,
      hasPendingRequest: !!pending,
      canManage: await this.canManage(viewer, id),
      moderators: moderators.map((uid) => summaries.get(uid)).filter((u): u is UserSummary => !!u),
    };
  }

  private memberQuery(groupId: number) {
    const now = this.clock.now();
    return this.db.q
      .selectFrom('users')
      .leftJoin('group_members as gm', (j) => j.onRef('gm.user_id', '=', 'users.id').on('gm.group_id', '=', groupId))
      .where('users.deleted_at', 'is', null)
      .where('users.status', '=', 'active')
      .where((eb) =>
        eb.or([
          eb('users.primary_group_id', '=', groupId),
          eb('users.post_group_id', '=', groupId),
          eb.and([eb('gm.group_id', '=', groupId), eb.or([eb('gm.expires_at', 'is', null), eb('gm.expires_at', '>', now)])]),
        ]),
      );
  }

  async members(groupId: number, page: number, perPage: number) {
    const g = await this.require(groupId);
    let base = this.memberQuery(groupId);
    if (g.system_key === 'member') {
      base = this.db.q
        .selectFrom('users')
        .leftJoin('group_members as gm', (j) => j.onRef('gm.user_id', '=', 'users.id').on('gm.group_id', '=', groupId))
        .where('users.deleted_at', 'is', null)
        .where('users.status', '=', 'active');
    }
    const [rows, total] = await Promise.all([
      base
        .select(['users.id', 'users.primary_group_id', 'gm.expires_at', 'gm.added_at', 'users.registered_at'])
        .orderBy('users.id')
        .limit(perPage)
        .offset((page - 1) * perPage)
        .execute(),
      base.select((eb) => eb.fn.count<number>('users.id').distinct().as('n')).executeTakeFirst(),
    ]);
    const summaries = await this.users.summaries(rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        user: summaries.get(r.id)!,
        isPrimary: r.primary_group_id === groupId,
        expiresAt: r.expires_at,
        addedAt: r.added_at ?? r.registered_at,
      })),
      total: Number(total?.n ?? 0),
      page,
      perPage,
    };
  }

  async moderatorIds(groupId: number): Promise<number[]> {
    const rows = await this.db.q.selectFrom('group_moderators').select('user_id').where('group_id', '=', groupId).execute();
    return rows.map((r) => r.user_id);
  }

  async canManage(viewer: RequestViewer, groupId: number): Promise<boolean> {
    if (!viewer.user) return false;
    if (can(viewer, 'admin.groups.manage')) return true;
    const row = await this.db.q
      .selectFrom('group_moderators')
      .select('user_id')
      .where('group_id', '=', groupId)
      .where('user_id', '=', viewer.user.id)
      .executeTakeFirst();
    return !!row;
  }

  // ---------- Üye işlemleri ----------

  async join(viewer: RequestViewer, groupId: number, reason: string): Promise<{ status: 'joined' | 'requested' }> {
    const user = viewer.user!;
    if (!can(viewer, 'groups.join')) throw Errors.forbidden('Gruplara katılma yetkiniz yok.');
    const g = await this.require(groupId);
    if (!this.isAssignable(g) || g.system_key === 'admin' || g.system_key === 'global_moderator') {
      throw Errors.forbidden('Bu gruba katılamazsınız.');
    }
    if (viewer.groupIds.includes(groupId)) throw Errors.conflict('Zaten bu grubun üyesisiniz.');
    if (g.join_type === 'free') {
      await this.db.tx(async () => {
        await this.addAdditional(user.id, groupId, 'free', user.id, null);
        await this.recountMembers([groupId]);
      });
      return { status: 'joined' };
    }
    if (g.join_type === 'requestable') {
      const existing = await this.db.q
        .selectFrom('group_join_requests')
        .select('id')
        .where('group_id', '=', groupId)
        .where('user_id', '=', user.id)
        .where('status', '=', 'pending')
        .executeTakeFirst();
      if (existing) throw Errors.conflict('Bu grup için bekleyen bir isteğiniz var.');
      await this.db.tx(async () => {
        await this.db.q
          .insertInto('group_join_requests')
          .values({ group_id: groupId, user_id: user.id, reason, created_at: this.clock.now() })
          .execute();
        for (const modId of await this.moderatorIds(groupId)) {
          await this.notifications.notify(modId, 'group.request.new', { groupId, groupName: g.name, userId: user.id }, user.id);
        }
      });
      return { status: 'requested' };
    }
    throw Errors.forbidden('Bu grup yeni üye kabul etmiyor.');
  }

  async cancelRequest(viewer: RequestViewer, groupId: number): Promise<void> {
    await this.db.q
      .updateTable('group_join_requests')
      .set({ status: 'cancelled', handled_at: this.clock.now() })
      .where('group_id', '=', groupId)
      .where('user_id', '=', viewer.user!.id)
      .where('status', '=', 'pending')
      .execute();
  }

  async leave(viewer: RequestViewer, groupId: number): Promise<void> {
    const user = viewer.user!;
    const g = await this.require(groupId);
    if (bool(g.is_protected) || !this.isAssignable(g)) throw Errors.forbidden('Bu gruptan kendiniz ayrılamazsınız.');
    if (g.join_type === 'closed') throw Errors.forbidden('Bu gruptan ayrılmak için yöneticilere başvurun.');
    await this.db.tx(async () => {
      await this.removeMembership(user.id, groupId);
      await this.recountMembers([groupId]);
    });
  }

  /** Kullanıcı kendi ek gruplarından birini ana grup yapar (eski ana grup ek gruba döner). */
  async setOwnPrimary(viewer: RequestViewer, groupId: number | null): Promise<void> {
    const user = viewer.user!;
    const current = user.primary_group_id;
    if (groupId === current) return;
    if (groupId !== null) {
      const g = await this.require(groupId);
      if (g.visibility === 'additional_only' || !this.isAssignable(g)) throw Errors.badRequest('Bu grup ana grup olarak seçilemez.');
      const membership = await this.db.q
        .selectFrom('group_members')
        .selectAll()
        .where('user_id', '=', user.id)
        .where('group_id', '=', groupId)
        .executeTakeFirst();
      if (!membership) throw Errors.forbidden('Yalnızca üyesi olduğunuz grupları seçebilirsiniz.');
    }
    await this.db.tx(async () => {
      let expires: number | null = null;
      if (groupId !== null) {
        const m = await this.db.q
          .selectFrom('group_members')
          .select(['expires_at'])
          .where('user_id', '=', user.id)
          .where('group_id', '=', groupId)
          .executeTakeFirst();
        expires = m?.expires_at ?? null;
        await this.db.q.deleteFrom('group_members').where('user_id', '=', user.id).where('group_id', '=', groupId).execute();
      }
      if (current) await this.addAdditional(user.id, current, 'manual', user.id, user.primary_group_expires_at);
      await this.users.update(user.id, { primary_group_id: groupId, primary_group_expires_at: expires });
      this.events.emit('user.groupsChanged', { userId: user.id });
    });
  }

  // ---------- Grup yöneticisi (lider) işlemleri ----------

  async pendingRequests(groupId: number) {
    const rows = await this.db.q
      .selectFrom('group_join_requests')
      .selectAll()
      .where('group_id', '=', groupId)
      .where('status', '=', 'pending')
      .orderBy('created_at')
      .execute();
    const summaries = await this.users.summaries(rows.map((r) => r.user_id));
    return rows.map((r) => ({ id: r.id, user: summaries.get(r.user_id)!, reason: r.reason, createdAt: r.created_at }));
  }

  /** Tüm grupların bekleyen istekleri (admin paneli). */
  async allPendingRequests() {
    const rows = await this.db.q
      .selectFrom('group_join_requests')
      .selectAll()
      .where('status', '=', 'pending')
      .orderBy('created_at')
      .limit(500)
      .execute();
    const summaries = await this.users.summaries(rows.map((r) => r.user_id));
    const groups = await this.cache.map();
    return rows.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      groupName: groups.get(r.group_id)?.name ?? '?',
      user: summaries.get(r.user_id)!,
      reason: r.reason,
      createdAt: r.created_at,
    }));
  }

  async handleRequest(viewer: RequestViewer, requestId: number, approve: boolean, response: string | null): Promise<void> {
    const req = await this.db.q.selectFrom('group_join_requests').selectAll().where('id', '=', requestId).executeTakeFirst();
    if (!req || req.status !== 'pending') throw Errors.notFound('Bekleyen istek bulunamadı.');
    if (!(await this.canManage(viewer, req.group_id))) throw Errors.forbidden();
    const g = await this.require(req.group_id);
    await this.db.tx(async () => {
      await this.db.q
        .updateTable('group_join_requests')
        .set({ status: approve ? 'approved' : 'rejected', handled_by: viewer.user!.id, handled_at: this.clock.now(), response })
        .where('id', '=', requestId)
        .execute();
      if (approve) {
        await this.addAdditional(req.user_id, req.group_id, 'request', viewer.user!.id, null);
        await this.recountMembers([req.group_id]);
      }
      await this.notifications.notify(
        req.user_id,
        approve ? 'group.request.approved' : 'group.request.rejected',
        { groupId: g.id, groupName: g.name, response },
        viewer.user!.id,
      );
    });
  }

  async removeByManager(viewer: RequestViewer, groupId: number, userId: number): Promise<void> {
    if (!(await this.canManage(viewer, groupId))) throw Errors.forbidden();
    const g = await this.require(groupId);
    if (bool(g.is_protected) && !can(viewer, 'admin.groups.manage')) throw Errors.forbidden();
    await this.db.tx(async () => {
      await this.removeMembership(userId, groupId);
      await this.recountMembers([groupId]);
      await this.notifications.notify(userId, 'group.removed', { groupId, groupName: g.name }, viewer.user!.id);
    });
  }

  async addByManager(viewer: RequestViewer, groupId: number, userId: number, asPrimary: boolean, expiresAt: number | null): Promise<void> {
    if (!(await this.canManage(viewer, groupId))) throw Errors.forbidden();
    const isAdmin = can(viewer, 'admin.groups.manage');
    const g = await this.require(groupId);
    if (!this.isAssignable(g)) throw Errors.badRequest('Bu gruba üye eklenemez.');
    if (bool(g.is_protected) && !isAdmin) throw Errors.forbidden();
    if (g.system_key === 'admin' && !viewer.isAdmin) throw Errors.forbidden('Yönetici grubuna yalnızca yöneticiler üye ekleyebilir.');
    const target = await this.users.findById(userId);
    if (!target) throw Errors.notFound('Üye bulunamadı.');
    await this.db.tx(async () => {
      if (asPrimary && isAdmin) {
        if (target.primary_group_id && target.primary_group_id !== groupId) {
          await this.addAdditional(userId, target.primary_group_id, 'manual', viewer.user!.id, target.primary_group_expires_at);
        }
        await this.db.q.deleteFrom('group_members').where('user_id', '=', userId).where('group_id', '=', groupId).execute();
        await this.users.update(userId, { primary_group_id: groupId, primary_group_expires_at: expiresAt });
        this.events.emit('user.groupsChanged', { userId });
      } else {
        if (target.primary_group_id === groupId) throw Errors.conflict('Üye zaten bu grubun ana üyesi.');
        await this.addAdditional(userId, groupId, 'manual', viewer.user!.id, expiresAt);
      }
      await this.recountMembers([groupId]);
      await this.notifications.notify(userId, 'group.added', { groupId, groupName: g.name, expiresAt }, viewer.user!.id);
    });
  }

  // ---------- Yönetim ----------

  private async validateInput(input: GroupInput, id?: number): Promise<void> {
    if (input.parentId !== null) {
      if (input.parentId === id) throw Errors.field('parentId', 'Grup kendisinden miras alamaz.');
      const parent = await this.require(input.parentId);
      if (parent.parent_id) throw Errors.field('parentId', 'Miras alınan grubun kendisi başka bir gruptan miras alıyor olamaz.');
      if (parent.system_key === 'admin') throw Errors.field('parentId', 'Yönetici grubundan miras alınamaz.');
      if (id) {
        const children = (await this.cache.all()).filter((g) => g.parent_id === id);
        if (children.length) throw Errors.field('parentId', 'Başka grupların miras aldığı bir grup miras alamaz.');
      }
    }
  }

  async create(input: GroupInput): Promise<number> {
    await this.validateInput(input);
    const now = this.clock.now();
    const row = await this.db.q
      .insertInto('member_groups')
      .values({
        name: input.name,
        description: input.description,
        color: input.color,
        icon_count: input.iconCount,
        kind: input.kind,
        min_posts: input.kind === 'post_count' ? input.minPosts : null,
        join_type: input.kind === 'post_count' ? 'closed' : input.joinType,
        visibility: input.visibility,
        parent_id: input.parentId,
        require_2fa: input.require2fa,
        sort_order: input.sortOrder,
        created_at: now,
        updated_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.cache.invalidate();
    if (input.kind === 'post_count') await this.jobs.enqueue(RECALC_JOB, {});
    return row.id;
  }

  async update(id: number, input: GroupInput): Promise<void> {
    const g = await this.require(id);
    await this.validateInput(input, id);
    const isSystem = g.kind === 'system' || !!g.system_key;
    const kindChanged = !isSystem && g.kind !== input.kind;
    if (kindChanged && g.kind === 'regular') {
      const members = await this.memberQuery(id).select('users.id').limit(1).executeTakeFirst();
      if (members) throw Errors.field('kind', 'Üyesi olan bir grup mesaj grubuna dönüştürülemez.');
    }
    await this.db.q
      .updateTable('member_groups')
      .set({
        name: input.name,
        description: input.description,
        color: input.color,
        icon_count: input.iconCount,
        ...(isSystem
          ? {}
          : {
              kind: input.kind,
              min_posts: input.kind === 'post_count' ? input.minPosts : null,
              join_type: input.kind === 'post_count' ? 'closed' : input.joinType,
            }),
        visibility: g.system_key === 'guest' || g.system_key === 'member' ? g.visibility : input.visibility,
        parent_id: g.system_key ? null : input.parentId,
        require_2fa: input.require2fa,
        sort_order: input.sortOrder,
        updated_at: this.clock.now(),
      })
      .where('id', '=', id)
      .execute();
    await this.cache.invalidate();
    if (g.kind === 'post_count' || input.kind === 'post_count') await this.jobs.enqueue(RECALC_JOB, {});
  }

  async delete(id: number): Promise<void> {
    const g = await this.require(id);
    if (g.system_key || bool(g.is_protected)) throw Errors.badRequest('Sistem grupları silinemez.');
    const children = (await this.cache.all()).filter((x) => x.parent_id === id);
    await this.db.tx(async () => {
      for (const c of children) {
        await this.db.q.updateTable('member_groups').set({ parent_id: null }).where('id', '=', c.id).execute();
      }
      await this.db.q.updateTable('users').set({ primary_group_id: null, primary_group_expires_at: null }).where('primary_group_id', '=', id).execute();
      await this.db.q.updateTable('users').set({ post_group_id: null }).where('post_group_id', '=', id).execute();
      await this.db.q.deleteFrom('group_members').where('group_id', '=', id).execute();
      await this.db.q.deleteFrom('group_moderators').where('group_id', '=', id).execute();
      await this.db.q.deleteFrom('group_join_requests').where('group_id', '=', id).execute();
      await this.db.q.deleteFrom('group_permissions').where('group_id', '=', id).execute();
      await this.db.q.deleteFrom('permission_profile_entries').where('group_id', '=', id).execute();
      await this.db.q.deleteFrom('member_groups').where('id', '=', id).execute();
      await this.storage.delete(g.icon_file_id);
      await this.cache.invalidate();
    });
    if (g.kind === 'post_count') await this.jobs.enqueue(RECALC_JOB, {});
  }

  async setIcon(id: number, file: Buffer | null): Promise<void> {
    const g = await this.require(id);
    await this.db.tx(async () => {
      let fileId: number | null = null;
      if (file) {
        const saved = await this.storage.saveImage(file, {
          purpose: 'group_icon',
          ownerUserId: null,
          // Yatay rütbe görselleri (ör. 300×60) de yüklenebilsin
          maxBytes: 1024 * 1024,
          maxDimension: 1600,
          allowGif: true,
        });
        fileId = saved.id;
      }
      await this.db.q.updateTable('member_groups').set({ icon_file_id: fileId, updated_at: this.clock.now() }).where('id', '=', id).execute();
      await this.storage.delete(g.icon_file_id);
      await this.cache.invalidate();
    });
  }

  async setModerators(groupId: number, userIds: number[]): Promise<void> {
    const g = await this.require(groupId);
    if (g.kind !== 'regular') throw Errors.badRequest('Bu grubun lideri olamaz.');
    const now = this.clock.now();
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('group_moderators').where('group_id', '=', groupId).execute();
      const unique = [...new Set(userIds)];
      if (unique.length) {
        const existing = await this.db.q.selectFrom('users').select('id').where('id', 'in', unique).execute();
        if (existing.length !== unique.length) throw Errors.field('userIds', 'Bazı üyeler bulunamadı.');
        await this.db.q
          .insertInto('group_moderators')
          .values(unique.map((user_id) => ({ group_id: groupId, user_id, added_at: now })))
          .execute();
      }
    });
  }

  /** Admin: bir üyenin grup yapısını tamamen belirler. */
  async setUserGroups(
    actor: RequestViewer,
    userId: number,
    primaryGroupId: number | null,
    primaryExpiresAt: number | null,
    additional: Array<{ groupId: number; expiresAt: number | null }>,
  ): Promise<void> {
    const target = await this.users.findById(userId);
    if (!target) throw Errors.notFound('Üye bulunamadı.');
    const map = await this.cache.map();
    const adminGroup = await this.cache.bySystemKey('admin');
    const ids = [primaryGroupId, ...additional.map((a) => a.groupId)].filter((x): x is number => x !== null);
    for (const gid of ids) {
      const g = map.get(gid);
      if (!g || !this.isAssignable(g)) throw Errors.field('groups', `Geçersiz grup: ${g?.name ?? gid}`);
    }
    const touchesAdmin =
      ids.includes(adminGroup.id) !== (target.primary_group_id === adminGroup.id || (await this.isAdditionalMember(userId, adminGroup.id)));
    if (touchesAdmin && !actor.isAdmin) throw Errors.forbidden('Yönetici grubunu yalnızca yöneticiler değiştirebilir.');
    if (userId === actor.user?.id && !ids.includes(adminGroup.id) && actor.isAdmin && this.viewerIsOnlyByAdminGroup(actor, adminGroup.id)) {
      throw Errors.badRequest('Kendi yönetici yetkinizi kaldıramazsınız.');
    }

    const before = new Set(await this.additionalIds(userId));
    if (target.primary_group_id) before.add(target.primary_group_id);
    const now = this.clock.now();
    await this.db.tx(async () => {
      await this.users.update(userId, { primary_group_id: primaryGroupId, primary_group_expires_at: primaryGroupId ? primaryExpiresAt : null });
      await this.db.q.deleteFrom('group_members').where('user_id', '=', userId).execute();
      const rows = additional
        .filter((a) => a.groupId !== primaryGroupId)
        .map((a) => ({ user_id: userId, group_id: a.groupId, source: 'manual' as const, added_by: actor.user!.id, added_at: now, expires_at: a.expiresAt }));
      if (rows.length) await this.db.q.insertInto('group_members').values(rows).execute();
      const after = new Set(ids);
      for (const gid of after) {
        if (!before.has(gid)) await this.notifications.notify(userId, 'group.added', { groupId: gid, groupName: map.get(gid)?.name }, actor.user!.id);
      }
      await this.recountMembers([...new Set([...before, ...after])]);
      this.events.emit('user.groupsChanged', { userId });
    });
  }

  private viewerIsOnlyByAdminGroup(actor: RequestViewer, adminGroupId: number): boolean {
    return actor.groupIds.includes(adminGroupId);
  }

  private async isAdditionalMember(userId: number, groupId: number): Promise<boolean> {
    return !!(await this.db.q
      .selectFrom('group_members')
      .select('user_id')
      .where('user_id', '=', userId)
      .where('group_id', '=', groupId)
      .executeTakeFirst());
  }

  async additionalIds(userId: number): Promise<number[]> {
    const rows = await this.db.q.selectFrom('group_members').select('group_id').where('user_id', '=', userId).execute();
    return rows.map((r) => r.group_id);
  }

  async userMemberships(userId: number) {
    const user = await this.users.findById(userId);
    if (!user) throw Errors.notFound('Üye bulunamadı.');
    const rows = await this.db.q.selectFrom('group_members').selectAll().where('user_id', '=', userId).execute();
    const map = await this.cache.map();
    const badge = (id: number | null) => (id && map.get(id) ? this.toDto(map.get(id)!) : null);
    return {
      primary: badge(user.primary_group_id),
      primaryExpiresAt: user.primary_group_expires_at,
      postGroup: badge(user.post_group_id),
      additional: rows
        .map((r) => ({ group: badge(r.group_id), source: r.source, addedAt: r.added_at, expiresAt: r.expires_at }))
        .filter((r) => r.group !== null),
    };
  }

  // ---------- Yardımcılar ----------

  /** Başvuru onayı gibi sistem işlemleri: yetki denetimi çağıranın sorumluluğunda. */
  async grant(userId: number, groupId: number, asPrimary: boolean, actorId: number | null): Promise<void> {
    const g = await this.require(groupId);
    const target = await this.users.findById(userId);
    if (!target) throw Errors.notFound('Üye bulunamadı.');
    if (target.primary_group_id === groupId) return;
    if (asPrimary) {
      if (target.primary_group_id) await this.addAdditional(userId, target.primary_group_id, 'manual', actorId, target.primary_group_expires_at);
      await this.db.q.deleteFrom('group_members').where('user_id', '=', userId).where('group_id', '=', groupId).execute();
      await this.users.update(userId, { primary_group_id: groupId, primary_group_expires_at: null });
      this.events.emit('user.groupsChanged', { userId });
    } else {
      await this.addAdditional(userId, groupId, 'request', actorId, null);
    }
    await this.recountMembers([groupId]);
    await this.notifications.notify(userId, 'group.added', { groupId, groupName: g.name, expiresAt: null }, actorId);
  }

  private async addAdditional(userId: number, groupId: number, source: 'manual' | 'request' | 'free', addedBy: number | null, expiresAt: number | null) {
    await this.db.q
      .insertInto('group_members')
      .values({ user_id: userId, group_id: groupId, source, added_by: addedBy, added_at: this.clock.now(), expires_at: expiresAt })
      .onConflict((oc) => oc.columns(['user_id', 'group_id']).doUpdateSet({ expires_at: expiresAt }))
      .execute();
    this.events.emit('user.groupsChanged', { userId });
  }

  private async removeMembership(userId: number, groupId: number): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw Errors.notFound('Üye bulunamadı.');
    const r = await this.db.q.deleteFrom('group_members').where('user_id', '=', userId).where('group_id', '=', groupId).executeTakeFirst();
    let changed = Number(r.numDeletedRows) > 0;
    if (user.primary_group_id === groupId) {
      await this.users.update(userId, { primary_group_id: null, primary_group_expires_at: null });
      changed = true;
    }
    if (!changed) throw Errors.notFound('Üye bu grupta değil.');
    this.events.emit('user.groupsChanged', { userId });
  }

  async recountMembers(groupIds?: number[]): Promise<void> {
    const groups = await this.cache.all();
    const targets = groupIds ? groups.filter((g) => groupIds.includes(g.id)) : groups;
    let changed = false;
    for (const g of targets) {
      let n = 0;
      if (g.system_key === 'member') {
        const r = await this.db.q
          .selectFrom('users')
          .select((eb) => eb.fn.countAll<number>().as('n'))
          .where('deleted_at', 'is', null)
          .where('status', '=', 'active')
          .executeTakeFirst();
        n = Number(r?.n ?? 0);
      } else if (g.system_key !== 'guest') {
        const r = await this.memberQuery(g.id).select((eb) => eb.fn.count<number>('users.id').distinct().as('n')).executeTakeFirst();
        n = Number(r?.n ?? 0);
      }
      if (n !== g.member_count) {
        await this.db.q.updateTable('member_groups').set({ member_count: n }).where('id', '=', g.id).execute();
        changed = true;
      }
    }
    if (changed) await this.cache.invalidate();
  }

  /** Süresi dolan üyelikleri kaldırır. */
  async expireMemberships(): Promise<number> {
    const now = this.clock.now();
    const expired = await this.db.q
      .selectFrom('group_members')
      .select(['user_id', 'group_id'])
      .where('expires_at', 'is not', null)
      .where('expires_at', '<=', now)
      .execute();
    const primaries = await this.db.q
      .selectFrom('users')
      .select(['id', 'primary_group_id'])
      .where('primary_group_expires_at', 'is not', null)
      .where('primary_group_expires_at', '<=', now)
      .execute();
    if (!expired.length && !primaries.length) return 0;
    const map = await this.cache.map();
    const affected = new Set<number>();
    await this.db.tx(async () => {
      for (const e of expired) {
        await this.db.q.deleteFrom('group_members').where('user_id', '=', e.user_id).where('group_id', '=', e.group_id).execute();
        await this.notifications.notify(e.user_id, 'group.removed', { groupId: e.group_id, groupName: map.get(e.group_id)?.name, expired: true });
        affected.add(e.group_id);
        this.events.emit('user.groupsChanged', { userId: e.user_id });
      }
      for (const p of primaries) {
        await this.users.update(p.id, { primary_group_id: null, primary_group_expires_at: null });
        if (p.primary_group_id) {
          await this.notifications.notify(p.id, 'group.removed', { groupId: p.primary_group_id, groupName: map.get(p.primary_group_id)?.name, expired: true });
          affected.add(p.primary_group_id);
        }
        this.events.emit('user.groupsChanged', { userId: p.id });
      }
      await this.recountMembers([...affected]);
    });
    return expired.length + primaries.length;
  }

  /** Mesaj gruplarını tüm üyeler için tek sorguda yeniden hesaplar. */
  async recalcAllPostGroups(): Promise<void> {
    await sql`
      update users set post_group_id = (
        select g.id from member_groups g
        where g.kind = 'post_count' and g.min_posts <= users.post_count
        order by g.min_posts desc limit 1
      )
    `.execute(this.db.q);
    await this.recountMembers();
  }
}
