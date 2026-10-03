import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { canonicalEmail, canonicalName, likePattern } from '@forum/shared';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { UsersService } from '../users/users.service.js';
import { SessionService } from '../auth/session.service.js';
import { MailService } from '../mail/mail.service.js';
import { AuditService } from '../audit/audit.service.js';
import { EventsService } from '../events/events.service.js';
import { GroupsService } from '../groups/groups.service.js';
import { StorageService } from '../storage/storage.service.js';
import { PasswordHasher } from '../security/password-hasher.js';
import { AuthService } from '../auth/auth.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { can, type RequestViewer } from '../common/request-context.js';
import { bool } from '../database/json.js';

export const adminUserListSchema = z.object({
  q: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'active', 'pending_email', 'pending_approval', 'deactivated']).default('all'),
  group: z.coerce.number().int().positive().optional(),
  sort: z.enum(['registered', 'name', 'active', 'posts', 'warnings']).default('registered'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

export const adminUserUpdateSchema = z.object({
  email: z.email('Geçerli bir e-posta girin.').max(254).optional(),
  emailVerified: z.boolean().optional(),
  status: z.enum(['active', 'deactivated']).optional(),
  postCount: z.number().int().min(0).max(100_000_000).optional(),
  customTitle: z.string().trim().max(100).nullable().optional(),
  mustChangePassword: z.boolean().optional(),
  newPassword: z.string().max(256).optional(),
  isWatched: z.boolean().optional(),
});

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly groups: GroupsService,
    private readonly storage: StorageService,
    private readonly hasher: PasswordHasher,
    private readonly auth: AuthService,
    private readonly permissions: PermissionsService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(viewer: RequestViewer, q: z.output<typeof adminUserListSchema>) {
    let base = this.db.q.selectFrom('users').where('users.deleted_at', 'is', null);
    if (q.status !== 'all') base = base.where('users.status', '=', q.status);
    if (q.q) {
      const term = q.q.trim();
      if (/^\d+$/.test(term)) base = base.where('users.id', '=', Number(term));
      else if (term.includes('@')) base = base.where('users.email_canonical', 'like', `%${canonicalEmail(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      else if (/^[\d.:a-f]+$/i.test(term) && term.includes('.') && can(viewer, 'mod.ip.view')) {
        base = base.where((eb) => eb.or([eb('users.last_ip', 'like', `${term}%`), eb('users.registered_ip', 'like', `${term}%`)]));
      } else {
        const pattern = likePattern(term);
        base = base.where((eb) => eb.or([eb('users.username_canonical', 'like', pattern), eb('users.display_name_canonical', 'like', pattern)]));
      }
    }
    if (q.group) {
      const gid = q.group;
      base = base.where((eb) =>
        eb.or([
          eb('users.primary_group_id', '=', gid),
          eb('users.post_group_id', '=', gid),
          eb.exists(eb.selectFrom('group_members').select('group_members.user_id').whereRef('group_members.user_id', '=', 'users.id').where('group_members.group_id', '=', gid)),
        ]),
      );
    }
    const sortCol = {
      registered: 'users.registered_at',
      name: 'users.username_canonical',
      active: 'users.last_active_at',
      posts: 'users.post_count',
      warnings: 'users.warning_points',
    } as const;
    const [rows, total] = await Promise.all([
      base
        .select([
          'users.id',
          'users.email',
          'users.status',
          'users.registered_at',
          'users.last_active_at',
          'users.post_count',
          'users.warning_points',
          'users.email_verified_at',
          'users.last_ip',
        ])
        .orderBy(sortCol[q.sort], q.dir)
        .orderBy('users.id', q.dir)
        .limit(q.perPage)
        .offset((q.page - 1) * q.perPage)
        .execute(),
      base.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
    ]);
    const summaries = await this.users.summaries(rows.map((r) => r.id));
    const showIp = can(viewer, 'mod.ip.view');
    return {
      items: rows.map((r) => ({
        user: summaries.get(r.id)!,
        email: r.email,
        status: r.status,
        emailVerified: !!r.email_verified_at,
        registeredAt: r.registered_at,
        lastActiveAt: r.last_active_at,
        postCount: r.post_count,
        warningPoints: r.warning_points,
        lastIp: showIp ? r.last_ip : null,
      })),
      total: Number(total?.n ?? 0),
      page: q.page,
      perPage: q.perPage,
    };
  }

  async counts() {
    const rows = await this.db.q
      .selectFrom('users')
      .select(['status', (eb) => eb.fn.countAll<number>().as('n')])
      .where('deleted_at', 'is', null)
      .groupBy('status')
      .execute();
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  }

  async detail(viewer: RequestViewer, userId: number) {
    const user = await this.users.findById(userId);
    if (!user) throw Errors.notFound('Üye bulunamadı.');
    const showIp = can(viewer, 'mod.ip.view');
    const perms = await this.permissions.forUser(user);
    const [memberships, sessions, notes, history, logs] = await Promise.all([
      this.groups.userMemberships(userId),
      this.sessions.list(userId, null),
      can(viewer, 'mod.users.notes') ? this.notes(userId) : Promise.resolve(null),
      this.db.q.selectFrom('user_name_history').selectAll().where('user_id', '=', userId).orderBy('changed_at', 'desc').limit(20).execute(),
      this.db.q
        .selectFrom('audit_log')
        .selectAll()
        .where((eb) => eb.or([eb.and([eb('target_type', '=', 'user'), eb('target_id', '=', userId)]), eb('actor_id', '=', userId)]))
        .orderBy('id', 'desc')
        .limit(30)
        .execute(),
    ]);
    return {
      summary: await this.users.summary(user),
      email: user.email,
      emailVerifiedAt: user.email_verified_at,
      status: user.status,
      isAdmin: perms.isAdmin,
      mustChangePassword: bool(user.must_change_password),
      postCount: user.post_count,
      warningPoints: user.warning_points,
      achievementPoints: user.achievement_points,
      isWatched: bool(user.is_watched),
      moderatedUntil: user.moderated_until,
      mutedUntil: user.muted_until,
      registeredAt: user.registered_at,
      registeredIp: showIp ? user.registered_ip : null,
      lastLoginAt: user.last_login_at,
      lastActiveAt: user.last_active_at,
      lastIp: showIp ? user.last_ip : null,
      approvedAt: user.approved_at,
      memberships,
      sessions: sessions.map((s) => ({ ...s, ip: showIp ? s.ip : null })),
      notes,
      nameHistory: history.map((h) => ({
        oldUsername: h.old_username,
        newUsername: h.new_username,
        oldDisplayName: h.old_display_name,
        newDisplayName: h.new_display_name,
        changedAt: h.changed_at,
      })),
      logs: logs.map((l) => ({ id: l.id, type: l.log_type, action: l.action, actorId: l.actor_id, createdAt: l.created_at, ip: showIp ? l.ip : null })),
    };
  }

  async assertNotProtectedTarget(viewer: RequestViewer, userId: number) {
    const target = await this.users.findById(userId);
    if (!target) throw Errors.notFound('Üye bulunamadı.');
    const perms = await this.permissions.forUser(target);
    if (perms.isAdmin && !viewer.isAdmin) throw Errors.forbidden('Yöneticileri yalnızca yöneticiler düzenleyebilir.');
    return target;
  }

  async update(viewer: RequestViewer, userId: number, input: z.output<typeof adminUserUpdateSchema>) {
    const user = await this.assertNotProtectedTarget(viewer, userId);
    if (userId === viewer.user?.id && input.status === 'deactivated') throw Errors.badRequest('Kendi hesabınızı devre dışı bırakamazsınız.');
    const patch: Parameters<UsersService['update']>[1] = {};
    const changes: Record<string, unknown> = {};
    if (input.email !== undefined && canonicalEmail(input.email) !== user.email_canonical) {
      if (await this.users.isEmailTaken(input.email, userId)) throw Errors.field('email', 'Bu e-posta adresi kullanılıyor.');
      patch.email = input.email;
      patch.email_canonical = canonicalEmail(input.email);
      changes.email = input.email;
    }
    if (input.emailVerified !== undefined && input.emailVerified !== !!user.email_verified_at) {
      patch.email_verified_at = input.emailVerified ? this.clock.now() : null;
      if (input.emailVerified && user.status === 'pending_email') patch.status = 'active';
      changes.emailVerified = input.emailVerified;
    }
    if (input.status !== undefined && input.status !== user.status) {
      patch.status = input.status;
      changes.status = input.status;
    }
    if (input.customTitle !== undefined) patch.custom_title = input.customTitle || null;
    if (input.mustChangePassword !== undefined) patch.must_change_password = input.mustChangePassword;
    if (input.isWatched !== undefined) patch.is_watched = input.isWatched;
    if (input.postCount !== undefined && input.postCount !== user.post_count) {
      patch.post_count = input.postCount;
      changes.postCount = input.postCount;
    }
    let newHash: string | null = null;
    if (input.newPassword) {
      this.auth.checkPassword(input.newPassword, user.username, 'newPassword');
      newHash = await this.hasher.hash(input.newPassword);
      patch.password_hash = newHash;
      changes.password = 'değiştirildi';
    }

    await this.db.tx(async () => {
      if (Object.keys(patch).length) await this.users.update(userId, patch);
      if (newHash || patch.status === 'deactivated') await this.sessions.revokeAll(userId);
      if (patch.post_count !== undefined) {
        await this.users.recalcPostGroup(userId);
        this.events.emit('user.postCountChanged', { userId });
      }
      if (patch.status === 'active' && user.status !== 'active') this.events.emit('user.activated', { userId });
      await this.audit.log({ type: 'admin', action: 'user.edit', actorId: viewer.user!.id, targetType: 'user', targetId: userId, ip: viewer.ip, data: changes });
    });
  }

  async approve(viewer: RequestViewer, userId: number): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'pending_approval') throw Errors.notFound('Onay bekleyen üye bulunamadı.');
    await this.db.tx(async () => {
      await this.users.update(userId, { status: 'active', approved_by: viewer.user!.id, approved_at: this.clock.now() });
      await this.mail.send(user.email, await this.mail.compose('accountApproved', { name: user.display_name, url: this.mail.url('/login') }, user.locale));
      await this.audit.log({ type: 'admin', action: 'user.approve', actorId: viewer.user!.id, targetType: 'user', targetId: userId, ip: viewer.ip });
      this.events.emit('user.activated', { userId });
    });
    await this.groups.recountMembers();
  }

  async reject(viewer: RequestViewer, userId: number, reason: string | null): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || (user.status !== 'pending_approval' && user.status !== 'pending_email')) {
      throw Errors.notFound('Onay bekleyen üye bulunamadı.');
    }
    await this.db.tx(async () => {
      await this.mail.send(user.email, await this.mail.compose('accountRejected', { name: user.display_name, reason }, user.locale));
      await this.anonymize(userId);
      await this.audit.log({ type: 'admin', action: 'user.reject', actorId: viewer.user!.id, targetType: 'user', targetId: userId, ip: viewer.ip, data: { username: user.username, reason } });
    });
  }

  async resendVerification(viewer: RequestViewer, userId: number): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'pending_email') throw Errors.badRequest('Bu üye e-posta doğrulaması beklemiyor.');
    await this.auth.resendVerification(user.email, { ip: viewer.ip, userAgent: viewer.userAgent });
  }

  async delete(viewer: RequestViewer, userId: number): Promise<void> {
    if (userId === viewer.user?.id) throw Errors.badRequest('Kendi hesabınızı buradan silemezsiniz.');
    const user = await this.assertNotProtectedTarget(viewer, userId);
    await this.db.tx(async () => {
      await this.anonymize(userId);
      await this.audit.log({ type: 'admin', action: 'user.delete', actorId: viewer.user!.id, targetType: 'user', targetId: userId, ip: viewer.ip, data: { username: user.username, email: user.email } });
    });
    await this.groups.recountMembers();
  }

  private async anonymize(userId: number): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) return;
    const now = this.clock.now();
    const placeholder = `silinmis-uye-${userId}`;
    await this.sessions.revokeAll(userId);
    await this.db.q.deleteFrom('group_members').where('user_id', '=', userId).execute();
    await this.db.q.deleteFrom('group_moderators').where('user_id', '=', userId).execute();
    await this.db.q.deleteFrom('group_join_requests').where('user_id', '=', userId).execute();
    await this.db.q.deleteFrom('user_tokens').where('user_id', '=', userId).execute();
    await this.db.q.deleteFrom('user_totp').where('user_id', '=', userId).execute();
    await this.db.q.deleteFrom('user_recovery_codes').where('user_id', '=', userId).execute();
    await this.db.q.deleteFrom('user_profile_field_values').where('user_id', '=', userId).execute();
    await this.db.q.deleteFrom('notifications').where('user_id', '=', userId).execute();
    await this.db.q.deleteFrom('login_challenges').where('user_id', '=', userId).execute();
    await this.db.q
      .updateTable('user_profiles')
      .set({ signature: '', bio: '', birthdate: null, birth_md: null, location: '', website_url: '', privacy_json: '{}', updated_at: now })
      .where('user_id', '=', userId)
      .execute();
    await this.storage.delete(user.avatar_file_id);
    await this.users.update(userId, {
      username: placeholder,
      username_canonical: canonicalName(placeholder),
      display_name: 'Silinmiş üye',
      display_name_canonical: canonicalName(placeholder + '-gorunen'),
      email: `${placeholder}@deleted.invalid`,
      email_canonical: `${placeholder}@deleted.invalid`,
      password_hash: '!',
      status: 'deactivated',
      primary_group_id: null,
      primary_group_expires_at: null,
      avatar_file_id: null,
      custom_title: null,
      registered_ip: null,
      last_ip: null,
      deleted_at: now,
    });
  }

  async notes(userId: number) {
    const rows = await this.db.q.selectFrom('user_notes').selectAll().where('user_id', '=', userId).orderBy('created_at', 'desc').execute();
    const authors = await this.users.summaries(rows.map((r) => r.author_id ?? 0));
    return rows.map((r) => ({ id: r.id, body: r.body, createdAt: r.created_at, author: r.author_id ? (authors.get(r.author_id) ?? null) : null }));
  }

  async addNote(viewer: RequestViewer, userId: number, body: string): Promise<void> {
    if (!(await this.users.findById(userId))) throw Errors.notFound('Üye bulunamadı.');
    await this.db.q.insertInto('user_notes').values({ user_id: userId, author_id: viewer.user!.id, body, created_at: this.clock.now() }).execute();
  }

  async deleteNote(noteId: number): Promise<void> {
    await this.db.q.deleteFrom('user_notes').where('id', '=', noteId).execute();
  }

  async notifyAll(viewer: RequestViewer, message: string, groupId: number | null): Promise<number> {
    let q = this.db.q.selectFrom('users').select('id').where('status', '=', 'active').where('deleted_at', 'is', null);
    if (groupId) {
      q = q.where((eb) =>
        eb.or([
          eb('primary_group_id', '=', groupId),
          eb('post_group_id', '=', groupId),
          eb.exists(eb.selectFrom('group_members').select('group_members.user_id').whereRef('group_members.user_id', '=', 'users.id').where('group_members.group_id', '=', groupId)),
        ]),
      );
    }
    const ids = await q.execute();
    await this.db.tx(async () => {
      for (const { id } of ids) await this.notifications.notify(id, 'system.message', { message }, viewer.user!.id);
    });
    return ids.length;
  }
}
