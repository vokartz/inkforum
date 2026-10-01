import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { isLocale, type PendingPolicy, type Viewer, type ViewerBan, type ViewerUser } from '@forum/shared';
import type { Row } from '@forum/db';
import { CONFIG, type AppConfig } from '../config/config.js';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { clientIp, parseCookies, userAgent } from '../common/http.js';
import type { RequestViewer } from '../common/request-context.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { SessionService } from './session.service.js';
import { UsersService } from '../users/users.service.js';
import { PoliciesService } from '../policies/policies.service.js';
import { BansService } from '../bans/bans.service.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { CacheService } from '../cache/cache.service.js';
import { unreadConversationCount } from '../messages/unread.js';
import { PresenceService } from '../presence/presence.service.js';
import { TokenAuthService } from './token-auth.service.js';
import { I18nService } from '../i18n/i18n.service.js';

export interface Compliance {
  mustChangePassword: boolean;
  pendingPolicies: PendingPolicy[];
  twoFactorSetupRequired: boolean;
}

@Injectable()
export class ViewerService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly permissions: PermissionsService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly policies: PoliciesService,
    private readonly bans: BansService,
    private readonly groups: GroupCacheService,
    private readonly settings: SettingsService,
    private readonly cache: CacheService,
    private readonly tokens: TokenAuthService,
    private readonly presence: PresenceService,
    private readonly i18n: I18nService,
  ) {}

  /** İstekten kimlik bağlamını çıkarır (her istekte bir kez). */
  async fromRequest(req: Request): Promise<RequestViewer> {
    await this.cache.sync();
    const ip = clientIp(req);
    const ua = userAgent(req);

    // API istemcileri: Bearer belirteci varsa çerez oturumuna hiç bakılmaz.
    const bearer = TokenAuthService.parse(req.headers.authorization);
    if (bearer || req.headers.authorization?.toLowerCase().startsWith('bearer')) {
      const resolved = bearer ? await this.tokens.resolve(bearer, ip) : null;
      const lang = this.i18n.resolve({ preference: resolved?.user.locale, acceptLanguage: req.headers['accept-language'] });
      if (!resolved) return { ...(await this.forUser(null, null, ip, ua)), tokenError: true, locale: lang };
      const viewer = await this.forUser(resolved.user, null, ip, ua);
      return { ...viewer, locale: lang, token: { kind: resolved.kind, id: resolved.id, clientId: resolved.clientId, scopes: new Set(resolved.scopes) } };
    }

    const token = parseCookies(req.headers.cookie)[this.config.sessionCookieName];
    const resolved = await this.sessions.resolve(token, ip);
    const user = resolved?.user ?? null;
    const perms = await this.permissions.forUser(user);
    if (user) await this.users.touchActivity(user, ip);
    else this.presence.touchGuest(ip, ua);
    return {
      user,
      session: resolved?.session ?? null,
      groupIds: perms.groupIds,
      permissions: perms.permissions,
      isAdmin: perms.isAdmin,
      ip,
      userAgent: ua,
      locale: this.i18n.resolve({ preference: user?.locale, cookie: req.headers.cookie, acceptLanguage: req.headers['accept-language'] }),
    };
  }

  /** Oturum değişikliğinden sonra (giriş vb.) bağlamı yeniden kurmak için. */
  async forUser(user: Row<'users'> | null, session: Row<'sessions'> | null, ip: string | null, ua: string | null): Promise<RequestViewer> {
    const perms = await this.permissions.forUser(user);
    return { user, session, groupIds: perms.groupIds, permissions: perms.permissions, isAdmin: perms.isAdmin, ip, userAgent: ua, locale: this.i18n.resolve({ preference: user?.locale }) };
  }

  async twoFactorEnabled(userId: number): Promise<boolean> {
    const row = await this.db.q
      .selectFrom('user_totp')
      .select('enabled_at')
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return !!row?.enabled_at;
  }

  async compliance(viewer: RequestViewer): Promise<Compliance> {
    if (!viewer.user) return { mustChangePassword: false, pendingPolicies: [], twoFactorSetupRequired: false };
    const pendingPolicies = await this.policies.pendingFor(viewer.user, viewer.locale);
    const map = await this.groups.map();
    const needs2fa = viewer.groupIds.some((id) => map.get(id)?.require_2fa === 1);
    const twoFactorSetupRequired = needs2fa && !(await this.twoFactorEnabled(viewer.user.id));
    return {
      mustChangePassword: viewer.user.must_change_password === 1,
      pendingPolicies,
      twoFactorSetupRequired,
    };
  }

  async ban(viewer: RequestViewer): Promise<ViewerBan | null> {
    return this.bans.activeFor({ userId: viewer.user?.id ?? null, ip: viewer.ip });
  }

  async toDto(viewer: RequestViewer): Promise<Viewer> {
    const now = this.clock.now();
    const compliance = await this.compliance(viewer);
    const ban = await this.ban(viewer);
    let user: ViewerUser | null = null;
    if (viewer.user) {
      const u = viewer.user;
      const summary = await this.users.summary(u);
      const map = await this.groups.map();
      const groups = viewer.groupIds
        .map((id) => map.get(id))
        .filter((g) => !!g && g.kind !== 'system' && g.visibility !== 'hidden')
        .map((g) => this.groups.badge(g!));
      user = {
        ...summary,
        email: u.email,
        emailVerified: !!u.email_verified_at,
        status: u.status,
        timezone: u.timezone,
        language: isLocale(u.locale) ? u.locale : '',
        theme: (['system', 'light', 'dark'].includes(u.theme) ? u.theme : 'system') as ViewerUser['theme'],
        warningPoints: u.warning_points,
        achievementPoints: u.achievement_points,
        unreadNotifications: u.unread_notifications,
        unreadMessages: await unreadConversationCount(this.db, u.id),
        hasPassword: !u.password_hash.startsWith('!external'),
        twoFactorEnabled: await this.twoFactorEnabled(u.id),
        groups,
        elevatedUntil: viewer.session?.elevated_until && viewer.session.elevated_until > now ? viewer.session.elevated_until : null,
        mutedUntil: u.muted_until && u.muted_until > now ? u.muted_until : null,
      };
    }
    return {
      user,
      isAdmin: viewer.isAdmin,
      permissions: [...viewer.permissions].sort(),
      flags: {
        mustChangePassword: compliance.mustChangePassword,
        pendingPolicies: compliance.pendingPolicies,
        emailUnverified: !!viewer.user && !viewer.user.email_verified_at,
        twoFactorSetupRequired: compliance.twoFactorSetupRequired,
        ban,
      },
      // i18n.defaultLocale: kurulumdan önce DEFAULT_LOCALE ortam değişkeni de hesaba katılır (örnek içerik bu dilde)
      settings: { ...this.i18n.localizeSettings(this.settings.publicSettings(), viewer.locale ?? this.i18n.defaultLocale()), 'i18n.defaultLocale': this.i18n.defaultLocale() },
      locale: viewer.locale ?? this.i18n.defaultLocale(),
      now,
    };
  }
}
