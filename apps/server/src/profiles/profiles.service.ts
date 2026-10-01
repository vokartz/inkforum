import { Injectable } from '@nestjs/common';
import {
  ageOn,
  canonicalEmail,
  canonicalName,
  displayNameIssue,
  usernameIssue,
  isoDate,
  likePattern,
  type GroupBadge,
  type UserSummary,
} from '@forum/shared';
import type { Row } from '@forum/db';
import type { z } from 'zod';
import { Db } from '../database/db.service.js';
import { Clock, DAY, HOUR, MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { revokeUserTokens } from '../auth/revoke-tokens.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import { StorageService } from '../storage/storage.service.js';
import { ProfileFieldsService, type FieldAudience } from './profile-fields.service.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { EventsService } from '../events/events.service.js';
import { AuditService } from '../audit/audit.service.js';
import { TokensService } from '../auth/tokens.service.js';
import { MailService } from '../mail/mail.service.js';
import { PasswordHasher } from '../security/password-hasher.js';
import { AuthService } from '../auth/auth.service.js';
import { AchievementsService } from '../achievements/achievements.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { can, type RequestViewer } from '../common/request-context.js';
import { renderRichText } from '../common/rich-text.js';
import { fromJsonSchema, toJson } from '../database/json.js';
import {
  DEFAULT_PRIVACY,
  privacySchema,
  type Privacy,
  type memberListSchema,
  type preferencesSchema,
  type profileUpdateSchema,
} from './profiles.schemas.js';

export const ONLINE_WINDOW_MS = 15 * MINUTE;

@Injectable()
export class ProfilesService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly storage: StorageService,
    private readonly fields: ProfileFieldsService,
    private readonly groups: GroupCacheService,
    private readonly permissions: PermissionsService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
    private readonly hasher: PasswordHasher,
    private readonly auth: AuthService,
    private readonly achievements: AchievementsService,
    private readonly presence: PresenceService,
  ) {}

  async profileRow(userId: number): Promise<Row<'user_profiles'>> {
    const row = await this.db.q.selectFrom('user_profiles').selectAll().where('user_id', '=', userId).executeTakeFirst();
    if (row) return row;
    const now = this.clock.now();
    await this.db.q.insertInto('user_profiles').values({ user_id: userId, updated_at: now }).execute();
    return this.db.q.selectFrom('user_profiles').selectAll().where('user_id', '=', userId).executeTakeFirstOrThrow();
  }

  privacy(profile: Pick<Row<'user_profiles'>, 'privacy_json'>): Privacy {
    return fromJsonSchema(privacySchema, profile.privacy_json, DEFAULT_PRIVACY);
  }

  isStaff(viewer: RequestViewer): boolean {
    return can(viewer, 'admin.users.view') || can(viewer, 'mod.warnings.view');
  }

  audience(viewer: RequestViewer, userId: number): FieldAudience {
    if (this.isStaff(viewer)) return 'staff';
    if (viewer.user?.id === userId) return 'owner';
    return viewer.user ? 'member' : 'guest';
  }

  private async visibleGroups(user: Row<'users'>): Promise<GroupBadge[]> {
    const ids = await this.permissions.effectiveGroupIds(user);
    const map = await this.groups.map();
    return ids
      .map((id) => map.get(id))
      .filter((g) => !!g && g.kind !== 'system' && g.visibility !== 'hidden')
      .sort((a, b) => a!.sort_order - b!.sort_order)
      .map((g) => this.groups.badge(g!));
  }

  // ---------- Herkese açık profil ----------

  /** Profil sayfası dışındaki üye listeleri (konular, mesajlar) de aynı görünürlük kurallarına uyar */
  async assertProfileVisible(viewer: RequestViewer, userId: number): Promise<void> {
    if (!can(viewer, 'profile.view')) throw Errors.forbidden('Profilleri görüntüleme yetkiniz yok.');
    const user = await this.users.findById(userId);
    if (!user || (user.status !== 'active' && !this.isStaff(viewer))) throw Errors.notFound('Üye bulunamadı.');
    const privacy = this.privacy(await this.profileRow(userId));
    if (privacy.profileVisibility === 'members' && this.audience(viewer, userId) === 'guest') throw Errors.unauthenticated('Bu profili görmek için giriş yapmalısınız.');
  }

  async publicProfile(viewer: RequestViewer, userId: number) {
    const user = await this.users.findById(userId);
    if (!user || (user.status !== 'active' && !this.isStaff(viewer))) throw Errors.notFound('Üye bulunamadı.');
    const profile = await this.profileRow(userId);
    const privacy = this.privacy(profile);
    const audience = this.audience(viewer, userId);
    const isOwn = audience === 'owner';
    const staff = audience === 'staff';
    if (privacy.profileVisibility === 'members' && audience === 'guest') {
      throw Errors.unauthenticated('Bu profili görmek için giriş yapmalısınız.');
    }

    const now = this.clock.now();
    const showOnline = privacy.showOnline || isOwn || staff;
    const isOnline = showOnline && !!user.last_active_at && now - user.last_active_at < ONLINE_WINDOW_MS;

    let birthdate: string | null = null;
    let age: number | null = null;
    if (profile.birthdate) {
      if (privacy.birthdateVisibility === 'full' || isOwn || staff) {
        birthdate = profile.birthdate;
        age = ageOn(profile.birthdate, this.clock.date());
      } else if (privacy.birthdateVisibility === 'day_month') {
        birthdate = `--${profile.birthdate.slice(5)}`;
      }
    }

    const showWarnings = this.settings.get('warnings.enabled') && (isOwn || staff || this.settings.get('warnings.showLevelPublicly'));
    const earned = privacy.showAchievements || isOwn || staff ? await this.achievements.forUser(userId) : [];

    return {
      user: await this.users.summary(user),
      status: staff ? user.status : undefined,
      registeredAt: user.registered_at,
      lastActiveAt: showOnline ? user.last_active_at : null,
      isOnline,
      postCount: user.post_count,
      achievementPoints: user.achievement_points,
      cover: await this.coverOf(user),
      bioHtml: profile.bio ? renderRichText(profile.bio) : '',
      signatureHtml: this.settings.get('signatures.enabled') && profile.signature ? renderRichText(profile.signature) : '',
      location: profile.location,
      websiteUrl: profile.website_url,
      birthdate,
      age,
      groups: await this.visibleGroups(user),
      customFields: await this.fields.valuesFor(userId, audience),
      warnings: showWarnings ? { points: user.warning_points, max: this.settings.get('warnings.maxPoints') } : null,
      achievements: {
        total: earned.length,
        featured: earned.filter((a) => a.isFeatured).slice(0, this.settings.get('achievements.featuredMax')),
        recent: earned.slice(0, 12),
      },
      staff: staff
        ? {
            // E-posta yalnızca üye yönetimi yetkisiyle (moderatörler göremez)
            email: can(viewer, 'admin.users.view') ? user.email : null,
            registeredIp: can(viewer, 'mod.ip.view') ? user.registered_ip : null,
            lastIp: can(viewer, 'mod.ip.view') ? user.last_ip : null,
            watched: user.is_watched === 1,
          }
        : null,
      can: {
        edit: isOwn ? can(viewer, 'profile.edit.own') : can(viewer, 'profile.edit.any'),
        warn: !isOwn && can(viewer, 'mod.warnings.issue') && this.settings.get('warnings.enabled'),
        manage: can(viewer, 'admin.users.edit'),
        cover: this.settings.get('profile.coversEnabled') && (isOwn ? can(viewer, 'profile.avatar.upload') : can(viewer, 'profile.edit.any')),
      },
    };
  }

  private async coverOf(user: { cover_file_id: number | null; cover_offset: number }): Promise<{ url: string; offset: number } | null> {
    if (!user.cover_file_id || !this.settings.get('profile.coversEnabled')) return null;
    const file = await this.storage.get(user.cover_file_id);
    const url = this.storage.publicUrl(file);
    return url ? { url, offset: user.cover_offset } : null;
  }

  async setCover(viewer: RequestViewer, userId: number, file: Buffer | null): Promise<{ url: string | null }> {
    this.assertCanEdit(viewer, userId);
    if (file && !this.settings.get('profile.coversEnabled')) throw Errors.badRequest('Kapak fotoğrafları kapalı.');
    if (file && viewer.user?.id === userId && !can(viewer, 'profile.avatar.upload')) throw Errors.forbidden('Görsel yükleme yetkiniz yok.');
    const user = await this.users.findById(userId);
    if (!user) throw Errors.notFound('Üye bulunamadı.');
    return this.db.tx(async () => {
      let url: string | null = null;
      let fileId: number | null = null;
      if (file) {
        const saved = await this.storage.saveImage(file, {
          purpose: 'cover',
          ownerUserId: userId,
          maxBytes: this.settings.get('profile.coverMaxKb') * 1024,
          maxDimension: 6000,
        });
        fileId = saved.id;
        url = this.storage.publicUrl(saved);
      }
      await this.users.update(userId, { cover_file_id: fileId, cover_offset: 50 });
      await this.storage.delete(user.cover_file_id);
      return { url };
    });
  }

  async setCoverOffset(viewer: RequestViewer, userId: number, offset: number): Promise<void> {
    this.assertCanEdit(viewer, userId);
    await this.users.update(userId, { cover_offset: Math.min(100, Math.max(0, Math.round(offset))) });
  }

  // ---------- Kendi profili ----------

  async editData(viewer: RequestViewer, userId: number) {
    const user = await this.users.findById(userId);
    if (!user) throw Errors.notFound('Üye bulunamadı.');
    const profile = await this.profileRow(userId);
    const isStaff = can(viewer, 'profile.edit.any');
    const file = await this.storage.get(user.avatar_file_id);
    return {
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      customTitle: user.custom_title ?? '',
      bio: profile.bio,
      location: profile.location,
      websiteUrl: profile.website_url,
      birthdate: profile.birthdate ?? '',
      signature: profile.signature,
      avatarUrl: this.storage.publicUrl(file),
      privacy: this.privacy(profile),
      timezone: user.timezone,
      theme: user.theme,
      usernameChangedAt: user.username_changed_at,
      customFields: await this.fields.editableFor(userId, isStaff),
      limits: {
        bioMaxLength: this.settings.get('profile.bioMaxLength'),
        customTitleMaxLength: this.settings.get('profile.customTitleMaxLength'),
        signatureMaxLength: this.settings.get('signatures.maxLength'),
        signatureMaxLines: this.settings.get('signatures.maxLines'),
        avatarMaxKb: this.settings.get('avatars.maxSizeKb'),
        avatarSize: this.settings.get('avatars.size'),
        usernameCooldownDays: this.settings.get('profile.usernameChangeCooldownDays'),
      },
      can: {
        customTitle: can(viewer, 'profile.customTitle'),
        signature: can(viewer, 'profile.signature') && this.settings.get('signatures.enabled'),
        avatar: can(viewer, 'profile.avatar.upload') && this.settings.get('avatars.enabled'),
        changeUsername: can(viewer, 'profile.username.change') || can(viewer, 'admin.users.edit'),
        changeDisplayName: can(viewer, 'profile.displayName.change') || can(viewer, 'admin.users.edit'),
      },
    };
  }

  assertCanEdit(viewer: RequestViewer, userId: number): void {
    const own = viewer.user?.id === userId;
    if (own ? !can(viewer, 'profile.edit.own') : !can(viewer, 'profile.edit.any')) throw Errors.forbidden();
  }

  async updateProfile(viewer: RequestViewer, userId: number, input: z.output<typeof profileUpdateSchema>): Promise<void> {
    this.assertCanEdit(viewer, userId);
    const fields: Record<string, string> = {};
    const bioMax = this.settings.get('profile.bioMaxLength');
    if ([...input.bio].length > bioMax) fields.bio = `Hakkımda en fazla ${bioMax} karakter olabilir.`;

    let birthdate: string | null = null;
    if (input.birthdate) {
      const parsed = isoDate.safeParse(input.birthdate);
      if (!parsed.success) fields.birthdate = 'Geçerli bir tarih girin.';
      else {
        const age = ageOn(parsed.data, this.clock.date());
        if (age < 0 || age > 120) fields.birthdate = 'Geçerli bir tarih girin.';
        else birthdate = parsed.data;
      }
    } else if (this.settings.get('registration.requireBirthdate')) {
      fields.birthdate = 'Doğum tarihi gerekli.';
    }

    let customTitle: string | null | undefined;
    if (input.customTitle !== undefined) {
      if (!can(viewer, 'profile.customTitle')) {
        // Yetkisi yoksa alan sessizce yok sayılır (form tüm alanları gönderebilir).
        customTitle = undefined;
      } else {
        const max = this.settings.get('profile.customTitleMaxLength');
        if ([...input.customTitle].length > max) fields.customTitle = `Özel başlık en fazla ${max} karakter olabilir.`;
        customTitle = input.customTitle || null;
      }
    }

    const editable = (await this.fields.active()).filter((f) => f.editableBy === 'owner' || can(viewer, 'profile.edit.any'));
    const provided = editable.filter((f) => f.key in input.customFields);
    let values = new Map<number, string>();
    try {
      values = this.fields.validateAll(provided, input.customFields);
    } catch (err) {
      const e = err as { fields?: Record<string, string> };
      if (e.fields) Object.assign(fields, e.fields);
      else throw err;
    }
    if (Object.keys(fields).length) throw Errors.validation(fields);

    const now = this.clock.now();
    await this.db.tx(async () => {
      await this.profileRow(userId);
      await this.db.q
        .updateTable('user_profiles')
        .set({
          bio: input.bio.trim(),
          location: input.location,
          website_url: input.websiteUrl,
          birthdate,
          birth_md: birthdate ? birthdate.slice(5) : null,
          updated_at: now,
        })
        .where('user_id', '=', userId)
        .execute();
      if (customTitle !== undefined) await this.users.update(userId, { custom_title: customTitle });
      await this.fields.saveValues(userId, values);
      if (viewer.user?.id !== userId) {
        await this.audit.log({ type: 'admin', action: 'user.profile_edit', actorId: viewer.user!.id, targetType: 'user', targetId: userId, ip: viewer.ip });
      }
      this.events.emit('user.profileUpdated', { userId });
    });
  }

  async updateSignature(viewer: RequestViewer, userId: number, signature: string): Promise<void> {
    this.assertCanEdit(viewer, userId);
    if (!this.settings.get('signatures.enabled')) throw Errors.badRequest('İmzalar kapalı.');
    if (viewer.user?.id === userId && !can(viewer, 'profile.signature')) throw Errors.forbidden('İmza kullanma yetkiniz yok.');
    const text = signature.replace(/\r\n/g, '\n').trim();
    const maxLen = this.settings.get('signatures.maxLength');
    const maxLines = this.settings.get('signatures.maxLines');
    if ([...text].length > maxLen) throw Errors.field('signature', `İmza en fazla ${maxLen} karakter olabilir.`);
    if (text.split('\n').length > maxLines) throw Errors.field('signature', `İmza en fazla ${maxLines} satır olabilir.`);
    await this.profileRow(userId);
    await this.db.q.updateTable('user_profiles').set({ signature: text, updated_at: this.clock.now() }).where('user_id', '=', userId).execute();
  }

  async updatePrivacy(userId: number, privacy: Privacy): Promise<void> {
    await this.profileRow(userId);
    await this.db.q
      .updateTable('user_profiles')
      .set({ privacy_json: toJson(privacy), updated_at: this.clock.now() })
      .where('user_id', '=', userId)
      .execute();
  }

  async updatePreferences(userId: number, prefs: z.output<typeof preferencesSchema>): Promise<void> {
    await this.users.update(userId, { timezone: prefs.timezone, theme: prefs.theme });
  }

  async setAvatar(viewer: RequestViewer, userId: number, file: Buffer | null): Promise<string | null> {
    this.assertCanEdit(viewer, userId);
    if (file) {
      if (!this.settings.get('avatars.enabled')) throw Errors.badRequest('Avatar yüklemeleri kapalı.');
      if (viewer.user?.id === userId && !can(viewer, 'profile.avatar.upload')) throw Errors.forbidden('Avatar yükleme yetkiniz yok.');
    }
    const user = await this.users.findById(userId);
    if (!user) throw Errors.notFound('Üye bulunamadı.');
    const size = this.settings.get('avatars.size');
    return this.db.tx(async () => {
      let url: string | null = null;
      let fileId: number | null = null;
      if (file) {
        const saved = await this.storage.saveImage(file, {
          purpose: 'avatar',
          ownerUserId: userId,
          maxBytes: this.settings.get('avatars.maxSizeKb') * 1024,
          maxDimension: 2048,
          resizeTo: size,
          allowGif: true,
        });
        fileId = saved.id;
        url = this.storage.publicUrl(saved);
      }
      await this.users.update(userId, { avatar_file_id: fileId });
      await this.storage.delete(user.avatar_file_id);
      this.events.emit('user.avatarChanged', { userId });
      return url;
    });
  }

  // ---------- Hesap: kullanıcı adı / görünen ad / e-posta ----------

  async changeUsername(viewer: RequestViewer, userId: number, username: string): Promise<void> {
    const own = viewer.user?.id === userId;
    const isAdmin = can(viewer, 'admin.users.edit');
    if (!isAdmin && (!own || !can(viewer, 'profile.username.change'))) throw Errors.forbidden('Kullanıcı adınızı değiştirme yetkiniz yok.');
    const user = await this.users.findById(userId);
    if (!user) throw Errors.notFound('Üye bulunamadı.');
    const clean = username.trim().replace(/\s+/g, ' ');
    if (clean === user.username) return;
    if (!isAdmin && user.username_changed_at) {
      const cooldown = this.settings.get('profile.usernameChangeCooldownDays') * DAY;
      const next = user.username_changed_at + cooldown;
      if (next > this.clock.now()) {
        throw Errors.field('username', `Kullanıcı adınızı ${new Date(next).toLocaleDateString('tr-TR')} tarihinden sonra değiştirebilirsiniz.`);
      }
    }
    // Aynı kişinin yalnızca büyük/küçük harf değişikliği serbesttir.
    const sameCanonical = canonicalName(clean) === user.username_canonical;
    const errors = sameCanonical ? {} : await this.auth.validateNames(clean, user.display_name, userId, !isAdmin);
    if ('username' in errors) throw Errors.field('username', errors.username!);
    const rules = { minLength: this.settings.get('registration.usernameMinLength'), maxLength: this.settings.get('registration.usernameMaxLength') };
    const issue = usernameIssue(clean, rules);
    if (issue) throw Errors.field('username', issue);

    const now = this.clock.now();
    await this.db.tx(async () => {
      await this.db.q
        .insertInto('user_name_history')
        .values({
          user_id: userId,
          old_username: user.username,
          new_username: clean,
          old_display_name: user.display_name,
          new_display_name: user.display_name,
          changed_by: viewer.user!.id,
          changed_at: now,
        })
        .execute();
      await this.users.update(userId, { username: clean, username_canonical: canonicalName(clean), username_changed_at: now });
      await this.audit.log({
        type: own ? 'user' : 'admin',
        action: 'user.username_change',
        actorId: viewer.user!.id,
        targetType: 'user',
        targetId: userId,
        ip: viewer.ip,
        data: { from: user.username, to: clean },
      });
    });
  }

  async changeDisplayName(viewer: RequestViewer, userId: number, displayName: string): Promise<void> {
    const own = viewer.user?.id === userId;
    const isAdmin = can(viewer, 'admin.users.edit');
    if (!isAdmin && (!own || !can(viewer, 'profile.displayName.change'))) throw Errors.forbidden('Görünen adınızı değiştirme yetkiniz yok.');
    const user = await this.users.findById(userId);
    if (!user) throw Errors.notFound('Üye bulunamadı.');
    const clean = displayName.trim().replace(/\s+/g, ' ');
    if (clean === user.display_name) return;
    const sameCanonical = canonicalName(clean) === user.display_name_canonical || canonicalName(clean) === user.username_canonical;
    if (!sameCanonical) {
      const errors = await this.auth.validateNames(user.username, clean, userId, !isAdmin);
      if (errors.displayName) throw Errors.field('displayName', errors.displayName);
    }
    const issue = displayNameIssue(clean);
    if (issue) throw Errors.field('displayName', issue);
    const now = this.clock.now();
    await this.db.tx(async () => {
      await this.db.q
        .insertInto('user_name_history')
        .values({
          user_id: userId,
          old_username: user.username,
          new_username: user.username,
          old_display_name: user.display_name,
          new_display_name: clean,
          changed_by: viewer.user!.id,
          changed_at: now,
        })
        .execute();
      await this.users.update(userId, { display_name: clean, display_name_canonical: canonicalName(clean) });
    });
  }

  async nameHistory(userId: number) {
    return this.db.q.selectFrom('user_name_history').selectAll().where('user_id', '=', userId).orderBy('changed_at', 'desc').limit(50).execute();
  }

  async requestEmailChange(viewer: RequestViewer, email: string, password: string): Promise<void> {
    const user = viewer.user!;
    if (!(await this.hasher.verify(user.password_hash, password))) throw Errors.field('password', 'Şifre hatalı.');
    if (await this.users.isEmailTaken(email, user.id)) throw Errors.field('email', 'Bu e-posta adresi kullanılıyor.');
    const hours = this.settings.get('email.verifyTokenHours');
    await this.db.tx(async () => {
      const token = await this.tokens.create(user.id, 'email_change', hours * HOUR, viewer.ip, { email });
      await this.mail.send(
        email,
        await this.mail.compose('emailChange', { name: user.display_name, url: this.mail.url(`/confirm-email/${token}`), hours }, user.locale),
      );
    });
  }

  async confirmEmailChange(token: string, ip: string | null): Promise<void> {
    await this.db.tx(async () => {
      const { row, payload } = await this.tokens.consume<{ email: string }>('email_change', token);
      const user = await this.users.findById(row.user_id);
      if (!user || !payload?.email) throw Errors.badRequest('Geçersiz istek.');
      if (await this.users.isEmailTaken(payload.email, user.id)) throw Errors.conflict('Bu e-posta adresi artık kullanılıyor.');
      await this.users.update(user.id, {
        email: payload.email,
        email_canonical: canonicalEmail(payload.email),
        email_verified_at: this.clock.now(),
      });
      // Hesap e-postası değişti: üçüncü taraf erişimleri (OAuth, API anahtarı) sıfırlanır
      await revokeUserTokens(this.db, user.id, this.clock.now());
      await this.mail.send(user.email, await this.mail.compose('emailChangedNotice', { name: user.display_name, newEmail: payload.email }, user.locale));
      await this.audit.log({ type: 'security', action: 'user.email_change', actorId: user.id, targetType: 'user', targetId: user.id, ip, data: { from: user.email, to: payload.email } });
      this.events.emit('user.emailVerified', { userId: user.id });
    });
  }

  // ---------- Üye listesi / çevrimiçi ----------

  async memberList(viewer: RequestViewer, q: z.output<typeof memberListSchema>) {
    let base = this.db.q.selectFrom('users').where('users.deleted_at', 'is', null).where('users.status', '=', 'active');
    if (q.q) {
      const pattern = likePattern(q.q, 'contains');
      base = base.where((eb) =>
        eb.or([eb('users.username_canonical', 'like', pattern), eb('users.display_name_canonical', 'like', pattern)]),
      );
    }
    if (q.group) {
      const gid = q.group;
      const now = this.clock.now();
      base = base.where((eb) =>
        eb.or([
          eb('users.primary_group_id', '=', gid),
          eb('users.post_group_id', '=', gid),
          eb.exists(
            eb
              .selectFrom('group_members')
              .select('group_members.user_id')
              .whereRef('group_members.user_id', '=', 'users.id')
              .where('group_members.group_id', '=', gid)
              .where((e2) => e2.or([e2('group_members.expires_at', 'is', null), e2('group_members.expires_at', '>', now)])),
          ),
        ]),
      );
    }
    const sortCol = {
      registered: 'users.registered_at',
      name: 'users.display_name_canonical',
      posts: 'users.post_count',
      active: 'users.last_active_at',
      achievements: 'users.achievement_points',
    } as const;
    const [rows, total] = await Promise.all([
      base
        .select(['users.id', 'users.registered_at', 'users.post_count', 'users.last_active_at', 'users.achievement_points'])
        .orderBy(sortCol[q.sort], q.dir)
        .orderBy('users.id', q.dir)
        .limit(q.perPage)
        .offset((q.page - 1) * q.perPage)
        .execute(),
      base.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
    ]);
    const summaries = await this.users.summaries(rows.map((r) => r.id));
    const hideActivity = new Set(await this.hiddenOnlineIds(rows.map((r) => r.id)));
    const staff = this.isStaff(viewer);
    return {
      items: rows.map((r) => ({
        user: summaries.get(r.id)!,
        registeredAt: r.registered_at,
        postCount: r.post_count,
        achievementPoints: r.achievement_points,
        lastActiveAt: !staff && hideActivity.has(r.id) ? null : r.last_active_at,
      })),
      total: Number(total?.n ?? 0),
      page: q.page,
      perPage: q.perPage,
    };
  }

  private async hiddenOnlineIds(ids: number[]): Promise<number[]> {
    if (!ids.length) return [];
    const rows = await this.db.q.selectFrom('user_profiles').select(['user_id', 'privacy_json']).where('user_id', 'in', ids).execute();
    return rows.filter((r) => !this.privacy(r).showOnline).map((r) => r.user_id);
  }

  async online(viewer: RequestViewer) {
    const since = this.clock.now() - ONLINE_WINDOW_MS;
    const rows = await this.db.q
      .selectFrom('users')
      .select(['id', 'last_active_at'])
      .where('deleted_at', 'is', null)
      .where('status', '=', 'active')
      .where('last_active_at', '>=', since)
      .orderBy('last_active_at', 'desc')
      .limit(500)
      .execute();
    const hidden = new Set(await this.hiddenOnlineIds(rows.map((r) => r.id)));
    const staff = this.isStaff(viewer);
    const visible = rows.filter((r) => staff || !hidden.has(r.id));
    const summaries = await this.users.summaries(visible.map((r) => r.id));
    const users: Array<UserSummary & { hidden: boolean }> = visible.map((r) => ({ ...summaries.get(r.id)!, hidden: hidden.has(r.id) }));
    return {
      users,
      total: rows.length,
      hiddenCount: [...hidden].length,
      guests: this.presence.guestCount(ONLINE_WINDOW_MS),
      windowMinutes: ONLINE_WINDOW_MS / MINUTE,
    };
  }

  async birthdaysToday() {
    const d = this.clock.date();
    const md = `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const rows = await this.db.q
      .selectFrom('user_profiles')
      .innerJoin('users', 'users.id', 'user_profiles.user_id')
      .select(['users.id', 'user_profiles.privacy_json'])
      .where('user_profiles.birth_md', '=', md)
      .where('users.status', '=', 'active')
      .where('users.deleted_at', 'is', null)
      .limit(100)
      .execute();
    const visible = rows.filter((r) => this.privacy(r).birthdateVisibility !== 'none');
    const summaries = await this.users.summaries(visible.map((r) => r.id));
    return visible.map((r) => summaries.get(r.id)!).filter(Boolean);
  }
}
