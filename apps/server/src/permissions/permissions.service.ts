import { Injectable } from '@nestjs/common';
import { BOARD_PERMISSIONS, PERMISSIONS, extraPermissions, permissionDef } from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { CacheService } from '../cache/cache.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { GroupCacheService, type CachedGroup } from '../groups/group-cache.service.js';

export const PERMISSIONS_NS = 'permissions';

export interface ResolvedPermissions {
  isAdmin: boolean;
  permissions: Set<string>;
}

export type PermissionValue = 1 | -1;

const BOARD_KEYS = new Set(BOARD_PERMISSIONS.map((p) => p.key));

export interface ProfileRow {
  id: number;
  key: string | null;
  name: string;
  description: string;
  is_system: number;
}

@Injectable()
export class PermissionsService {
  constructor(
    private readonly db: Db,
    private readonly cache: CacheService,
    private readonly groups: GroupCacheService,
    private readonly clock: Clock,
  ) {}

  async table(): Promise<Map<number, Map<string, PermissionValue>>> {
    return this.cache.wrap(PERMISSIONS_NS, 'table', async () => {
      const rows = await this.db.q.selectFrom('group_permissions').selectAll().execute();
      const out = new Map<number, Map<string, PermissionValue>>();
      for (const r of rows) {
        if ((!permissionDef(r.permission) && !r.permission.startsWith('ext.')) || BOARD_KEYS.has(r.permission)) continue;
        let m = out.get(r.group_id);
        if (!m) out.set(r.group_id, (m = new Map()));
        m.set(r.permission, r.value >= 0 ? 1 : -1);
      }
      return out;
    });
  }

  async resolve(groupIds: number[]): Promise<ResolvedPermissions> {
    const sig = [...new Set(groupIds)].sort((a, b) => a - b).join(',');
    return this.cache.wrap(PERMISSIONS_NS, `resolved:${sig}`, async () => {
      const groupMap = await this.groups.map();
      const table = await this.table();
      const groups = sig
        .split(',')
        .filter(Boolean)
        .map((id) => groupMap.get(Number(id)))
        .filter((g): g is CachedGroup => !!g);

      if (groups.some((g) => g.system_key === 'admin')) {
        return { isAdmin: true, permissions: new Set([...PERMISSIONS, ...extraPermissions()].map((p) => p.key)) };
      }

      const allow = new Set<string>();
      const deny = new Set<string>();
      for (const g of groups) {
        const source = g.parent_id ?? g.id;
        for (const [perm, value] of table.get(source) ?? []) {
          if (value === -1) deny.add(perm);
          else allow.add(perm);
        }
      }
      for (const d of deny) allow.delete(d);
      return { isAdmin: false, permissions: allow };
    });
  }

  async effectiveGroupIds(user: Row<'users'> | null): Promise<number[]> {
    if (!user) return [(await this.groups.bySystemKey('guest')).id];
    const now = this.clock.now();
    const ids = new Set<number>([(await this.groups.bySystemKey('member')).id]);
    if (user.primary_group_id && (!user.primary_group_expires_at || user.primary_group_expires_at > now)) {
      ids.add(user.primary_group_id);
    }
    if (user.post_group_id) ids.add(user.post_group_id);
    const extra = await this.db.q
      .selectFrom('group_members')
      .select('group_id')
      .where('user_id', '=', user.id)
      .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]))
      .execute();
    for (const r of extra) ids.add(r.group_id);
    return [...ids];
  }

  async forUser(user: Row<'users'> | null): Promise<ResolvedPermissions & { groupIds: number[] }> {
    const groupIds = await this.effectiveGroupIds(user);
    return { ...(await this.resolve(groupIds)), groupIds };
  }

  async groupEntries(groupId: number): Promise<Record<string, PermissionValue>> {
    const table = await this.table();
    return Object.fromEntries(table.get(groupId) ?? []);
  }

  async setGroupPermissions(groupId: number, values: Record<string, 0 | 1 | -1>): Promise<void> {
    const group = await this.groups.get(groupId);
    if (!group) throw Errors.notFound('Grup bulunamadı.');
    if (group.system_key === 'admin') throw Errors.badRequest('Yönetici grubunun yetkileri düzenlenemez; tüm yetkilere sahiptir.');
    if (group.parent_id) throw Errors.badRequest('Bu grup yetkilerini üst gruptan devralıyor; önce mirası kaldırın.');
    const fields: Record<string, string> = {};
    for (const [key, v] of Object.entries(values)) {
      const def = permissionDef(key);
      if (!def || def.scope !== 'global') fields[key] = 'Bilinmeyen yetki.';
      else if (v === 1 && group.system_key === 'guest' && !def.guestGrantable) fields[key] = 'Bu yetki misafirlere verilemez.';
      else if (![0, 1, -1].includes(v)) fields[key] = 'Geçersiz değer.';
    }
    if (Object.keys(fields).length) throw Errors.validation(fields);

    await this.db.tx(async () => {
      for (const [permission, value] of Object.entries(values)) {
        if (value === 0) {
          await this.db.q
            .deleteFrom('group_permissions')
            .where('group_id', '=', groupId)
            .where('permission', '=', permission)
            .execute();
        } else {
          await this.db.q
            .insertInto('group_permissions')
            .values({ group_id: groupId, permission, value })
            .onConflict((oc) => oc.columns(['group_id', 'permission']).doUpdateSet({ value }))
            .execute();
        }
      }
      await this.invalidate();
    });
  }

  async copyPermissions(fromGroupId: number, toGroupId: number): Promise<void> {
    const entries = await this.groupEntries(fromGroupId);
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('group_permissions').where('group_id', '=', toGroupId).execute();
      const rows = Object.entries(entries).map(([permission, value]) => ({ group_id: toGroupId, permission, value }));
      if (rows.length) await this.db.q.insertInto('group_permissions').values(rows).execute();
      await this.db.q.deleteFrom('permission_profile_entries').where('group_id', '=', toGroupId).execute();
      const boardRows = await this.db.q.selectFrom('permission_profile_entries').selectAll().where('group_id', '=', fromGroupId).execute();
      if (boardRows.length) {
        await this.db.q
          .insertInto('permission_profile_entries')
          .values(boardRows.map((r) => ({ ...r, group_id: toGroupId })))
          .execute();
      }
      await this.invalidate();
    });
  }

  async profiles(): Promise<ProfileRow[]> {
    return this.cache.wrap(PERMISSIONS_NS, 'profiles', () =>
      this.db.q.selectFrom('permission_profiles').select(['id', 'key', 'name', 'description', 'is_system']).orderBy('id').execute(),
    );
  }

  async defaultProfileId(): Promise<number> {
    const all = await this.profiles();
    const p = all.find((x) => x.key === 'default') ?? all[0];
    if (!p) throw new Error('Varsayılan yetki profili bulunamadı.');
    return p.id;
  }

  async profileTable(): Promise<Map<number, Map<number, Map<string, PermissionValue>>>> {
    return this.cache.wrap(PERMISSIONS_NS, 'profileTable', async () => {
      const rows = await this.db.q.selectFrom('permission_profile_entries').selectAll().execute();
      const out = new Map<number, Map<number, Map<string, PermissionValue>>>();
      for (const r of rows) {
        if (!BOARD_KEYS.has(r.permission)) continue;
        let byGroup = out.get(r.profile_id);
        if (!byGroup) out.set(r.profile_id, (byGroup = new Map()));
        let m = byGroup.get(r.group_id);
        if (!m) byGroup.set(r.group_id, (m = new Map()));
        m.set(r.permission, r.value >= 0 ? 1 : -1);
      }
      return out;
    });
  }

  async resolveBoard(groupIds: number[], profileId: number | null, isBoardModerator: boolean): Promise<Set<string>> {
    const pid = profileId ?? (await this.defaultProfileId());
    const moderatorId = (await this.groups.bySystemKey('moderator')).id;
    const ids = new Set(groupIds.filter((id) => id !== moderatorId));
    if (isBoardModerator) ids.add(moderatorId);
    const sig = [...ids].sort((a, b) => a - b).join(',');
    return this.cache.wrap(PERMISSIONS_NS, `board:${pid}:${sig}`, async () => {
      const groupMap = await this.groups.map();
      const groups = [...ids].map((id) => groupMap.get(id)).filter((g): g is CachedGroup => !!g);
      if (groups.some((g) => g.system_key === 'admin')) return new Set(BOARD_KEYS);
      const table = (await this.profileTable()).get(pid);
      const allow = new Set<string>();
      const deny = new Set<string>();
      for (const g of groups) {
        for (const [perm, value] of table?.get(g.parent_id ?? g.id) ?? []) {
          if (value === -1) deny.add(perm);
          else allow.add(perm);
        }
      }
      for (const d of deny) allow.delete(d);
      return allow;
    });
  }

  async profileEntries(profileId: number): Promise<Record<number, Record<string, PermissionValue>>> {
    const table = (await this.profileTable()).get(profileId);
    const out: Record<number, Record<string, PermissionValue>> = {};
    for (const [groupId, m] of table ?? []) out[groupId] = Object.fromEntries(m);
    return out;
  }

  async setProfilePermissions(profileId: number, groupId: number, values: Record<string, 0 | 1 | -1>): Promise<void> {
    const profile = (await this.profiles()).find((p) => p.id === profileId);
    if (!profile) throw Errors.notFound('Yetki profili bulunamadı.');
    const group = await this.groups.get(groupId);
    if (!group) throw Errors.notFound('Grup bulunamadı.');
    if (group.system_key === 'admin') throw Errors.badRequest('Yönetici grubu tüm bölümlerde tam yetkilidir.');
    if (group.parent_id) throw Errors.badRequest('Bu grup yetkilerini üst gruptan devralıyor; önce mirası kaldırın.');
    const fields: Record<string, string> = {};
    for (const [key, v] of Object.entries(values)) {
      const def = permissionDef(key);
      if (!def || def.scope !== 'board') fields[key] = 'Bilinmeyen yetki.';
      else if (v === 1 && group.system_key === 'guest' && !def.guestGrantable) fields[key] = 'Bu yetki misafirlere verilemez.';
      else if (![0, 1, -1].includes(v)) fields[key] = 'Geçersiz değer.';
    }
    if (Object.keys(fields).length) throw Errors.validation(fields);
    await this.db.tx(async () => {
      for (const [permission, value] of Object.entries(values)) {
        if (value === 0) {
          await this.db.q
            .deleteFrom('permission_profile_entries')
            .where('profile_id', '=', profileId)
            .where('group_id', '=', groupId)
            .where('permission', '=', permission)
            .execute();
        } else {
          await this.db.q
            .insertInto('permission_profile_entries')
            .values({ profile_id: profileId, group_id: groupId, permission, value })
            .onConflict((oc) => oc.columns(['profile_id', 'group_id', 'permission']).doUpdateSet({ value }))
            .execute();
        }
      }
      await this.invalidate();
    });
  }

  async createProfile(input: { name: string; description: string; copyFromId: number | null }): Promise<number> {
    return this.db.tx(async () => {
      const row = await this.db.q
        .insertInto('permission_profiles')
        .values({ name: input.name, description: input.description, is_system: 0, created_at: this.clock.now() })
        .returning('id')
        .executeTakeFirstOrThrow();
      const from = input.copyFromId ?? (await this.defaultProfileId());
      const entries = await this.db.q.selectFrom('permission_profile_entries').selectAll().where('profile_id', '=', from).execute();
      if (entries.length) {
        await this.db.q
          .insertInto('permission_profile_entries')
          .values(entries.map((e) => ({ ...e, profile_id: row.id })))
          .execute();
      }
      await this.invalidate();
      return row.id;
    });
  }

  async updateProfile(id: number, input: { name: string; description: string }): Promise<void> {
    const res = await this.db.q
      .updateTable('permission_profiles')
      .set({ name: input.name, description: input.description })
      .where('id', '=', id)
      .executeTakeFirst();
    if (!Number(res.numUpdatedRows)) throw Errors.notFound('Yetki profili bulunamadı.');
    await this.invalidate();
  }

  async deleteProfile(id: number): Promise<void> {
    const profile = (await this.profiles()).find((p) => p.id === id);
    if (!profile) throw Errors.notFound('Yetki profili bulunamadı.');
    if (profile.is_system) throw Errors.badRequest('Sistem profilleri silinemez.');
    await this.db.tx(async () => {
      await this.db.q.updateTable('boards').set({ permission_profile_id: null }).where('permission_profile_id', '=', id).execute();
      await this.db.q.deleteFrom('permission_profile_entries').where('profile_id', '=', id).execute();
      await this.db.q.deleteFrom('permission_profiles').where('id', '=', id).execute();
      await this.invalidate();
    });
  }

  async invalidate(): Promise<void> {
    await this.cache.invalidate(PERMISSIONS_NS);
  }
}
