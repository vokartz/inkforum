import { Injectable } from '@nestjs/common';
import { canonicalEmail, canonicalName, slugify, type UserSummary } from '@forum/shared';
import type { Row, RowUpdate, UserStatusValue } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock, MINUTE } from '../common/clock.js';
import { GroupCacheService, type CachedGroup } from '../groups/group-cache.service.js';
import { StorageService } from '../storage/storage.service.js';
import { EventsService } from '../events/events.service.js';

export type UserRow = Row<'users'>;

export interface CreateUserInput {
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  status: UserStatusValue;
  emailVerifiedAt: number | null;
  ip: string | null;
  primaryGroupId?: number | null;
  mustChangePassword?: boolean;
  policiesEpoch?: number;
  birthdate?: string | null;
  locale?: string;
}

const ACTIVITY_THROTTLE_MS = MINUTE;

@Injectable()
export class UsersService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly groups: GroupCacheService,
    private readonly storage: StorageService,
    private readonly events: EventsService,
  ) {}

  async findById(id: number): Promise<UserRow | undefined> {
    return this.db.q.selectFrom('users').selectAll().where('id', '=', id).where('deleted_at', 'is', null).executeTakeFirst();
  }

  async findByIdentifier(identifier: string): Promise<UserRow | undefined> {
    const q = this.db.q.selectFrom('users').selectAll().where('deleted_at', 'is', null);
    if (identifier.includes('@')) {
      return q.where('email_canonical', '=', canonicalEmail(identifier)).executeTakeFirst();
    }
    return q.where('username_canonical', '=', canonicalName(identifier)).executeTakeFirst();
  }

  async findByEmail(email: string): Promise<UserRow | undefined> {
    return this.db.q
      .selectFrom('users')
      .selectAll()
      .where('email_canonical', '=', canonicalEmail(email))
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }

  async isNameTaken(name: string, excludeUserId?: number): Promise<boolean> {
    const c = canonicalName(name);
    let q = this.db.q
      .selectFrom('users')
      .select('id')
      .where((eb) => eb.or([eb('username_canonical', '=', c), eb('display_name_canonical', '=', c)]));
    if (excludeUserId) q = q.where('id', '!=', excludeUserId);
    return !!(await q.executeTakeFirst());
  }

  async isEmailTaken(email: string, excludeUserId?: number): Promise<boolean> {
    let q = this.db.q.selectFrom('users').select('id').where('email_canonical', '=', canonicalEmail(email));
    if (excludeUserId) q = q.where('id', '!=', excludeUserId);
    return !!(await q.executeTakeFirst());
  }

  async create(input: CreateUserInput): Promise<UserRow> {
    const now = this.clock.now();
    const postGroup = await this.groups.postGroupFor(0);
    return this.db.tx(async () => {
      const user = await this.db.q
        .insertInto('users')
        .values({
          username: input.username.trim(),
          username_canonical: canonicalName(input.username),
          display_name: input.displayName.trim(),
          display_name_canonical: canonicalName(input.displayName),
          email: input.email.trim(),
          email_canonical: canonicalEmail(input.email),
          password_hash: input.passwordHash,
          must_change_password: input.mustChangePassword ?? false,
          email_verified_at: input.emailVerifiedAt,
          status: input.status,
          primary_group_id: input.primaryGroupId ?? null,
          post_group_id: postGroup?.id ?? null,
          policies_epoch: input.policiesEpoch ?? 0,
          locale: input.locale ?? '',
          registered_at: now,
          registered_ip: input.ip,
          last_ip: input.ip,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const birthdate = input.birthdate || null;
      await this.db.q
        .insertInto('user_profiles')
        .values({ user_id: user.id, birthdate, birth_md: birthdate ? birthdate.slice(5) : null, updated_at: now })
        .execute();
      return user;
    });
  }

  async update(userId: number, patch: RowUpdate<'users'>): Promise<void> {
    await this.db.q
      .updateTable('users')
      .set({ ...patch, updated_at: this.clock.now() })
      .where('id', '=', userId)
      .execute();
  }

  async touchActivity(user: UserRow, ip: string | null): Promise<void> {
    const now = this.clock.now();
    if (user.last_active_at && now - user.last_active_at < ACTIVITY_THROTTLE_MS && user.last_ip === ip) return;
    await this.db.q.updateTable('users').set({ last_active_at: now, last_ip: ip }).where('id', '=', user.id).execute();
  }

  async recalcPostGroup(userId: number): Promise<void> {
    const user = await this.db.q.selectFrom('users').select(['post_count', 'post_group_id']).where('id', '=', userId).executeTakeFirst();
    if (!user) return;
    const group = await this.groups.postGroupFor(user.post_count);
    const next = group?.id ?? null;
    if (next !== user.post_group_id) {
      await this.db.q.updateTable('users').set({ post_group_id: next }).where('id', '=', userId).execute();
      this.events.emit('user.groupsChanged', { userId });
    }
  }

  async displayGroup(user: Pick<UserRow, 'primary_group_id' | 'primary_group_expires_at' | 'post_group_id'>): Promise<CachedGroup | undefined> {
    const map = await this.groups.map();
    const now = this.clock.now();
    const primary =
      user.primary_group_id && (!user.primary_group_expires_at || user.primary_group_expires_at > now)
        ? map.get(user.primary_group_id)
        : undefined;
    if (primary && primary.visibility !== 'hidden') return primary;
    return user.post_group_id ? map.get(user.post_group_id) : undefined;
  }

  async summaries(ids: number[]): Promise<Map<number, UserSummary>> {
    const unique = [...new Set(ids.filter((id) => id > 0))];
    const out = new Map<number, UserSummary>();
    if (!unique.length) return out;
    const rows = await this.db.q
      .selectFrom('users')
      .leftJoin('files', 'files.id', 'users.avatar_file_id')
      .select([
        'users.id',
        'users.username',
        'users.display_name',
        'users.custom_title',
        'users.primary_group_id',
        'users.primary_group_expires_at',
        'users.post_group_id',
        'files.path as avatar_path',
      ])
      .where('users.id', 'in', unique)
      .execute();
    for (const r of rows) out.set(r.id, await this.toSummary(r));
    return out;
  }

  async summary(user: UserRow): Promise<UserSummary> {
    const file = await this.storage.get(user.avatar_file_id);
    return this.toSummary({ ...user, avatar_path: file?.path ?? null });
  }

  private async toSummary(r: {
    id: number;
    username: string;
    display_name: string;
    custom_title: string | null;
    primary_group_id: number | null;
    primary_group_expires_at: number | null;
    post_group_id: number | null;
    avatar_path: string | null;
  }): Promise<UserSummary> {
    const group = await this.displayGroup(r);
    return {
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      slug: slugify(r.username),
      avatarUrl: this.storage.publicUrl(r.avatar_path ? { path: r.avatar_path } : null),
      color: group?.color ?? null,
      customTitle: r.custom_title,
      primaryGroup: group ? this.groups.badge(group) : null,
    };
  }
}
