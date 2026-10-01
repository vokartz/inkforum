import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SOCIAL_PROVIDERS, type AdminSocialProvider, type LinkedIdentity, type SocialProvider, type SocialSignupInfo } from '@forum/shared';
import { Db } from '../database/db.service.js';
import { Clock, MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { parseCookies } from '../common/http.js';
import { SettingsService } from '../settings/settings.service.js';
import { CryptoService } from '../security/crypto.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from '../auth/auth.service.js';
import { CONFIG, type AppConfig } from '../config/config.js';
import type { RequestViewer } from '../common/request-context.js';

interface ProviderDef {
  authorize: string;
  token: string;
  scope: string;
  profile: (accessToken: string) => Promise<ExternalProfile>;
}

interface ExternalProfile {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

async function getJson<T>(url: string, token: string, extra: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json', 'user-agent': 'Forum', ...extra }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

const PROVIDERS: Record<SocialProvider, ProviderDef> = {
  discord: {
    authorize: 'https://discord.com/oauth2/authorize',
    token: 'https://discord.com/api/oauth2/token',
    scope: 'identify email',
    async profile(token) {
      const u = await getJson<{ id: string; username: string; global_name?: string | null; email?: string | null; verified?: boolean; avatar?: string | null }>('https://discord.com/api/users/@me', token);
      return {
        subject: u.id,
        email: u.email ?? null,
        emailVerified: !!u.verified && !!u.email,
        username: u.username,
        displayName: u.global_name ?? null,
        avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256` : null,
      };
    },
  },
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    async profile(token) {
      const u = await getJson<{ sub: string; email?: string; email_verified?: boolean; name?: string; given_name?: string; picture?: string }>('https://openidconnect.googleapis.com/v1/userinfo', token);
      return {
        subject: u.sub,
        email: u.email ?? null,
        emailVerified: !!u.email_verified,
        username: (u.given_name ?? u.name ?? u.email?.split('@')[0] ?? 'uye').replace(/\s+/g, ''),
        displayName: u.name ?? null,
        avatarUrl: u.picture ?? null,
      };
    },
  },
  github: {
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
    async profile(token) {
      const u = await getJson<{ id: number; login: string; name?: string | null; avatar_url?: string }>('https://api.github.com/user', token);
      const emails = await getJson<Array<{ email: string; primary: boolean; verified: boolean }>>('https://api.github.com/user/emails', token).catch(() => []);
      const primary = emails.find((e) => e.primary) ?? emails.find((e) => e.verified) ?? null;
      return { subject: String(u.id), email: primary?.email ?? null, emailVerified: !!primary?.verified, username: u.login, displayName: u.name ?? null, avatarUrl: u.avatar_url ?? null };
    },
  },
};

const STATE_COOKIE = 'forum_social';
const SIGNUP_COOKIE = 'forum_social_signup';

interface StateCookie {
  s: string;
  p: SocialProvider;
  m: 'login' | 'link';
  n: string;
  u: number | null;
  e: number;
}

interface SignupCookie extends ExternalProfile {
  p: SocialProvider;
  e: number;
}

/** Discord / Google / GitHub ile giriş, kayıt ve hesap bağlama. */
@Injectable()
export class SocialService {
  private readonly logger = new Logger('Social');

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private conf(p: SocialProvider) {
    const c = this.settings.get('social.providers')[p];
    return c && c.enabled && c.clientId && c.clientSecret ? c : null;
  }

  callbackUrl(p: SocialProvider): string {
    return `${this.config.appUrl}/api/auth/social/${p}/callback`;
  }

  enabled(): Array<{ key: SocialProvider; label: string }> {
    return SOCIAL_PROVIDERS.filter((p) => this.conf(p.key)).map((p) => ({ key: p.key, label: p.label }));
  }

  // ---------- Yönetim ----------

  admin(): AdminSocialProvider[] {
    const all = this.settings.get('social.providers');
    return SOCIAL_PROVIDERS.map((p) => ({
      key: p.key,
      label: p.label,
      enabled: !!all[p.key]?.enabled,
      clientId: all[p.key]?.clientId ?? '',
      hasSecret: !!all[p.key]?.clientSecret,
      callbackUrl: this.callbackUrl(p.key),
    }));
  }

  async save(viewer: RequestViewer, input: Partial<Record<SocialProvider, { enabled: boolean; clientId: string; clientSecret?: string }>>): Promise<void> {
    const prev = this.settings.get('social.providers');
    const next = { ...prev };
    for (const [key, v] of Object.entries(input) as Array<[SocialProvider, { enabled: boolean; clientId: string; clientSecret?: string }]>) {
      const secret = v.clientSecret?.trim() ? v.clientSecret.trim() : (prev[key]?.clientSecret ?? '');
      if (v.enabled && (!v.clientId || !secret)) throw Errors.field(`${key}.clientId`, 'Etkinleştirmek için istemci kimliği ve gizli anahtar gerekli.');
      next[key] = { enabled: v.enabled, clientId: v.clientId, clientSecret: secret };
    }
    await this.settings.update({ 'social.providers': next }, viewer.user!.id, { allowHidden: true });
    await this.audit.log({ type: 'admin', action: 'social.providers', actorId: viewer.user!.id, ip: viewer.ip, data: { enabled: Object.entries(next).filter(([, v]) => v.enabled).map(([k]) => k) } });
  }

  // ---------- Akış ----------

  private setCookie(res: Response, name: string, value: unknown, maxAgeMs: number, path: string): void {
    res.cookie(name, this.crypto.encrypt(JSON.stringify(value)), { httpOnly: true, sameSite: 'lax', secure: this.config.secureCookies, path, maxAge: maxAgeMs });
  }

  private readCookie<T extends { e: number }>(req: Request, name: string): T | null {
    const raw = parseCookies(req.headers.cookie)[name];
    if (!raw) return null;
    try {
      const v = JSON.parse(this.crypto.decrypt(raw)) as T;
      return v.e > this.clock.now() ? v : null;
    } catch {
      return null;
    }
  }

  /** Sağlayıcıya yönlendirme adresi (durum çerezi ile CSRF korumalı). */
  start(p: SocialProvider, mode: 'login' | 'link', next: string, viewer: RequestViewer, res: Response): string {
    const conf = this.conf(p);
    if (!conf) throw Errors.notFound('Bu giriş yöntemi etkin değil.');
    if (mode === 'link' && !viewer.user) throw Errors.unauthenticated();
    const state = this.crypto.token(24);
    // Yalnızca site içi yol: "//evil", "/\evil" ve kontrol karakterleri tarayıcıda başka siteye yönlendirir
    const safeNext = /^\/(?![\\/])[^\s\\]*$/.test(next) && ![...next].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f) ? next.slice(0, 300) : '/';
    this.setCookie(res, STATE_COOKIE, { s: state, p, m: mode, n: safeNext, u: viewer.user?.id ?? null, e: this.clock.now() + 10 * MINUTE } satisfies StateCookie, 10 * MINUTE, '/api/auth/social');
    const url = new URL(PROVIDERS[p].authorize);
    url.searchParams.set('client_id', conf.clientId);
    url.searchParams.set('redirect_uri', this.callbackUrl(p));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', PROVIDERS[p].scope);
    url.searchParams.set('state', state);
    if (p === 'google') url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }

  private async exchange(p: SocialProvider, code: string): Promise<ExternalProfile> {
    const conf = this.conf(p)!;
    const res = await fetch(PROVIDERS[p].token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ client_id: conf.clientId, client_secret: conf.clientSecret, code, redirect_uri: this.callbackUrl(p), grant_type: 'authorization_code' }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
    if (!res.ok || !body.access_token) throw new Error(`Belirteç alınamadı: ${body.error ?? res.status}`);
    return PROVIDERS[p].profile(body.access_token);
  }

  /** Sağlayıcıdan dönüş: giriş, bağlama ya da kayıt adımına yönlendirir. Dönen değer tarayıcının gideceği adrestir. */
  async callback(p: SocialProvider, query: Record<string, unknown>, req: Request, res: Response, viewer: RequestViewer): Promise<string> {
    const st = this.readCookie<StateCookie>(req, STATE_COOKIE);
    res.clearCookie(STATE_COOKIE, { path: '/api/auth/social' });
    const fail = (code: string) => `/login?social_error=${code}&provider=${p}`;
    if (!st || st.p !== p || typeof query.state !== 'string' || !this.crypto.safeEqual(query.state, st.s)) return fail('state');
    if (typeof query.error === 'string') return st.m === 'link' ? `/settings/connections?social_error=denied` : fail('denied');
    if (typeof query.code !== 'string' || !this.conf(p)) return fail('config');

    let profile: ExternalProfile;
    try {
      profile = await this.exchange(p, query.code);
    } catch (err) {
      this.logger.warn(`${p} girişi başarısız: ${err instanceof Error ? err.message : String(err)}`);
      return fail('provider');
    }
    const client = { ip: viewer.ip, userAgent: viewer.userAgent };
    const identity = await this.db.q.selectFrom('user_identities').selectAll().where('provider', '=', p).where('subject', '=', profile.subject).executeTakeFirst();
    const now = this.clock.now();

    if (st.m === 'link') {
      if (!viewer.user || viewer.user.id !== st.u) return fail('session');
      if (identity && identity.user_id !== viewer.user.id) return `/settings/connections?social_error=taken&provider=${p}`;
      if (!identity) {
        await this.db.q
          .insertInto('user_identities')
          .values({ user_id: viewer.user.id, provider: p, subject: profile.subject, email: profile.email, display_name: profile.displayName ?? profile.username, avatar_url: profile.avatarUrl, created_at: now })
          .execute();
        await this.audit.log({ type: 'security', action: 'social.link', actorId: viewer.user.id, targetType: 'user', targetId: viewer.user.id, ip: viewer.ip, data: { provider: p } });
      }
      return `/settings/connections?linked=${p}`;
    }

    if (identity) {
      const user = await this.users.findById(identity.user_id);
      if (!user) return fail('account');
      await this.db.q.updateTable('user_identities').set({ last_login_at: now, avatar_url: profile.avatarUrl, email: profile.email }).where('id', '=', identity.id).execute();
      try {
        const result = await this.auth.loginExternal(user, client, res);
        if (result.status === 'two_factor_required') return `/login?challenge=${encodeURIComponent(result.challenge ?? '')}&next=${encodeURIComponent(st.n)}`;
      } catch (err) {
        const code = err instanceof Error && 'code' in err ? String((err as { code: unknown }).code).toLowerCase() : 'login';
        return fail(code);
      }
      return st.n;
    }

    // Bağlı hesap yok: aynı e-postayla kayıtlı üye varsa otomatik bağlanmaz (hesap ele geçirme riski).
    if (profile.email && (await this.users.isEmailTaken(profile.email))) return fail('email_taken');
    if (this.settings.get('registration.mode') === 'closed') return fail('registration_closed');
    this.setCookie(res, SIGNUP_COOKIE, { ...profile, p, e: now + 30 * MINUTE } satisfies SignupCookie, 30 * MINUTE, '/');
    return `/register/social?next=${encodeURIComponent(st.n)}`;
  }

  pending(req: Request): SocialSignupInfo {
    const s = this.readCookie<SignupCookie>(req, SIGNUP_COOKIE);
    if (!s) throw Errors.notFound('Bekleyen sosyal kayıt yok ya da süresi doldu.');
    const suggested = s.username.replace(/[^\p{L}\p{N}_.-]+/gu, '').slice(0, 20) || 'uye';
    return { provider: s.p, suggestedUsername: suggested, email: s.email, emailVerified: s.emailVerified, avatarUrl: s.avatarUrl, displayName: s.displayName };
  }

  async complete(req: Request, res: Response, viewer: RequestViewer, input: { username: string; email?: string; acceptedPolicyVersionIds: number[] }) {
    const s = this.readCookie<SignupCookie>(req, SIGNUP_COOKIE);
    if (!s) throw Errors.badRequest('Sosyal kayıt süresi doldu; lütfen yeniden deneyin.');
    const email = s.email ?? input.email;
    if (!email) throw Errors.field('email', 'E-posta adresi gerekli.');
    const verified = !!s.email && s.emailVerified;
    const exists = await this.db.q.selectFrom('user_identities').select('id').where('provider', '=', s.p).where('subject', '=', s.subject).executeTakeFirst();
    if (exists) throw Errors.badRequest('Bu hesap zaten bir üyeye bağlı.');
    const result = await this.auth.registerExternal({ username: input.username, email, emailVerified: verified, acceptedPolicyVersionIds: input.acceptedPolicyVersionIds }, { ip: viewer.ip, userAgent: viewer.userAgent }, res);
    await this.db.q
      .insertInto('user_identities')
      .values({ user_id: result.userId, provider: s.p, subject: s.subject, email: s.email, display_name: s.displayName ?? s.username, avatar_url: s.avatarUrl, created_at: this.clock.now(), last_login_at: this.clock.now() })
      .execute();
    res.clearCookie(SIGNUP_COOKIE, { path: '/' });
    return { status: result.status };
  }

  // ---------- Üye ayarları ----------

  async identities(userId: number): Promise<LinkedIdentity[]> {
    const rows = await this.db.q.selectFrom('user_identities').selectAll().where('user_id', '=', userId).orderBy('created_at').execute();
    return rows.map((r) => ({ provider: r.provider as SocialProvider, email: r.email, displayName: r.display_name, createdAt: r.created_at, lastLoginAt: r.last_login_at }));
  }

  async unlink(viewer: RequestViewer, p: SocialProvider): Promise<void> {
    const user = viewer.user!;
    const ids = await this.db.q.selectFrom('user_identities').select(['id', 'provider']).where('user_id', '=', user.id).execute();
    const target = ids.find((i) => i.provider === p);
    if (!target) throw Errors.notFound('Bu hesap bağlı değil.');
    if (user.password_hash.startsWith('!external') && ids.length <= 1) {
      throw Errors.badRequest('Hesabının şifresi yok; bağlantıyı kaldırmadan önce Güvenlik ayarlarından bir şifre belirle.');
    }
    await this.db.q.deleteFrom('user_identities').where('id', '=', target.id).execute();
    await this.audit.log({ type: 'security', action: 'social.unlink', actorId: user.id, targetType: 'user', targetId: user.id, ip: viewer.ip, data: { provider: p } });
  }
}
