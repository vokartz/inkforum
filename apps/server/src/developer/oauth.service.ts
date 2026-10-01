import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  API_SCOPE_INFO,
  API_SCOPES,
  type AdminApiKey,
  type AdminOAuthClient,
  type ApiScope,
  type AuthorizedApp,
  type OAuthAuthorizeInfo,
  type OAuthClientInput,
} from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock, DAY, MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { fromJson, toJson } from '../database/json.js';
import { SettingsService } from '../settings/settings.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { CONFIG, type AppConfig } from '../config/config.js';
import { sha256 } from '../auth/token-auth.service.js';
import type { RequestViewer } from '../common/request-context.js';

type ClientRow = Row<'oauth_clients'>;
const rand = (bytes = 30) => randomBytes(bytes).toString('base64url');
const CODE_TTL = 10 * MINUTE;

/** OAuth hata yanıtı (RFC 6749 §5.2 biçiminde döner). */
export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400,
  ) {
    super(description);
  }
}

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  responseType: string;
  scope: string;
  state: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly groups: GroupCacheService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------- Yönetim: uygulamalar ----------

  private toAdmin(r: ClientRow, activeUsers: number): AdminOAuthClient {
    return {
      id: r.id,
      clientId: r.client_id,
      name: r.name,
      description: r.description,
      homepageUrl: r.homepage_url,
      logoUrl: r.logo_url,
      redirectUris: fromJson<string[]>(r.redirect_uris_json, []),
      scopes: fromJson<ApiScope[]>(r.scopes_json, []),
      isConfidential: r.is_confidential === 1,
      isTrusted: r.is_trusted === 1,
      isEnabled: r.is_enabled === 1,
      hasSecret: !!r.secret_hash,
      activeUsers,
      createdAt: r.created_at,
    };
  }

  async adminClients(): Promise<AdminOAuthClient[]> {
    const rows = await this.db.q.selectFrom('oauth_clients').selectAll().orderBy('name').execute();
    const counts = await this.db.q.selectFrom('oauth_consents').select(['client_id', (eb) => eb.fn.countAll<number>().as('n')]).groupBy('client_id').execute();
    const byId = new Map(counts.map((c) => [c.client_id, Number(c.n)]));
    return rows.map((r) => this.toAdmin(r, byId.get(r.id) ?? 0));
  }

  private cleanScopes(scopes: string[]): ApiScope[] {
    return API_SCOPES.filter((s) => scopes.includes(s) && API_SCOPE_INFO[s].oauth);
  }

  async createClient(viewer: RequestViewer, input: OAuthClientInput): Promise<{ client: AdminOAuthClient; secret: string | null }> {
    const now = this.clock.now();
    const secret = input.isConfidential ? `fcs_${rand()}` : null;
    const clientId = `fc_${rand(12)}`;
    const row = await this.db.q
      .insertInto('oauth_clients')
      .values({
        client_id: clientId,
        name: input.name,
        description: input.description,
        homepage_url: input.homepageUrl,
        logo_url: input.logoUrl,
        redirect_uris_json: toJson(input.redirectUris),
        scopes_json: toJson(this.cleanScopes(input.scopes)),
        is_confidential: input.isConfidential ? 1 : 0,
        secret_hash: secret ? sha256(secret) : null,
        is_trusted: input.isTrusted ? 1 : 0,
        is_enabled: input.isEnabled ? 1 : 0,
        created_by: viewer.user!.id,
        created_at: now,
        updated_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.audit.log({ type: 'admin', action: 'oauth.client.create', actorId: viewer.user!.id, ip: viewer.ip, data: { id: row.id, name: input.name } });
    const r = await this.db.q.selectFrom('oauth_clients').selectAll().where('id', '=', row.id).executeTakeFirstOrThrow();
    return { client: this.toAdmin(r, 0), secret };
  }

  async updateClient(viewer: RequestViewer, id: number, input: OAuthClientInput): Promise<void> {
    const prev = await this.db.q.selectFrom('oauth_clients').selectAll().where('id', '=', id).executeTakeFirst();
    if (!prev) throw Errors.notFound('Uygulama bulunamadı.');
    await this.db.q
      .updateTable('oauth_clients')
      .set({
        name: input.name,
        description: input.description,
        homepage_url: input.homepageUrl,
        logo_url: input.logoUrl,
        redirect_uris_json: toJson(input.redirectUris),
        scopes_json: toJson(this.cleanScopes(input.scopes)),
        is_confidential: input.isConfidential ? 1 : 0,
        // Genel (public) istemciye geçince gizli anahtar anlamsızlaşır.
        secret_hash: input.isConfidential ? prev.secret_hash : null,
        is_trusted: input.isTrusted ? 1 : 0,
        is_enabled: input.isEnabled ? 1 : 0,
        updated_at: this.clock.now(),
      })
      .where('id', '=', id)
      .execute();
    await this.audit.log({ type: 'admin', action: 'oauth.client.update', actorId: viewer.user!.id, ip: viewer.ip, data: { id, name: input.name } });
  }

  async rotateSecret(viewer: RequestViewer, id: number): Promise<{ secret: string }> {
    const prev = await this.db.q.selectFrom('oauth_clients').select(['id', 'is_confidential']).where('id', '=', id).executeTakeFirst();
    if (!prev) throw Errors.notFound('Uygulama bulunamadı.');
    if (!prev.is_confidential) throw Errors.badRequest('Genel (public) uygulamaların gizli anahtarı olmaz; PKCE kullanılır.');
    const secret = `fcs_${rand()}`;
    await this.db.q.updateTable('oauth_clients').set({ secret_hash: sha256(secret), updated_at: this.clock.now() }).where('id', '=', id).execute();
    await this.audit.log({ type: 'admin', action: 'oauth.client.secret', actorId: viewer.user!.id, ip: viewer.ip, data: { id } });
    return { secret };
  }

  async deleteClient(viewer: RequestViewer, id: number): Promise<void> {
    const prev = await this.db.q.selectFrom('oauth_clients').select(['id', 'name']).where('id', '=', id).executeTakeFirst();
    if (!prev) throw Errors.notFound('Uygulama bulunamadı.');
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('oauth_tokens').where('client_id', '=', id).execute();
      await this.db.q.deleteFrom('oauth_codes').where('client_id', '=', id).execute();
      await this.db.q.deleteFrom('oauth_consents').where('client_id', '=', id).execute();
      await this.db.q.deleteFrom('oauth_clients').where('id', '=', id).execute();
    });
    await this.audit.log({ type: 'admin', action: 'oauth.client.delete', actorId: viewer.user!.id, ip: viewer.ip, data: { id, name: prev.name } });
  }

  // ---------- Yetkilendirme (onay ekranı) ----------

  private async validateAuthorize(p: AuthorizeParams): Promise<{ client: ClientRow; scopes: ApiScope[] }> {
    const client = await this.db.q.selectFrom('oauth_clients').selectAll().where('client_id', '=', p.clientId).executeTakeFirst();
    if (!client || client.is_enabled !== 1) throw Errors.badRequest('Uygulama bulunamadı ya da devre dışı.');
    const uris = fromJson<string[]>(client.redirect_uris_json, []);
    // Yönlendirme adresi kayıtlı adreslerden biriyle birebir eşleşmeli (açık yönlendirme koruması).
    if (!uris.includes(p.redirectUri)) throw Errors.badRequest('Yönlendirme adresi bu uygulama için kayıtlı değil.');
    if (p.responseType !== 'code') throw Errors.badRequest('Yalnızca "code" yanıt türü desteklenir.');
    const allowed = fromJson<ApiScope[]>(client.scopes_json, []);
    const requested = p.scope.trim() ? p.scope.trim().split(/[\s,+]+/) : ['profile'];
    const unknown = requested.filter((s) => !allowed.includes(s as ApiScope));
    if (unknown.length) throw Errors.badRequest(`Uygulamanın istemediği izin: ${unknown.join(', ')}`);
    if (p.codeChallenge) {
      if (p.codeChallengeMethod !== 'S256') throw Errors.badRequest('PKCE için yalnızca S256 yöntemi desteklenir.');
      if (!/^[A-Za-z0-9_-]{43,128}$/.test(p.codeChallenge)) throw Errors.badRequest('Geçersiz code_challenge.');
    } else if (client.is_confidential !== 1) {
      throw Errors.badRequest('Genel uygulamalar PKCE (code_challenge) kullanmak zorunda.');
    }
    return { client, scopes: API_SCOPES.filter((s) => requested.includes(s)) };
  }

  async authorizeInfo(viewer: RequestViewer, p: AuthorizeParams): Promise<OAuthAuthorizeInfo> {
    const { client, scopes } = await this.validateAuthorize(p);
    const consent = await this.db.q.selectFrom('oauth_consents').select('scopes_json').where('client_id', '=', client.id).where('user_id', '=', viewer.user!.id).executeTakeFirst();
    const granted = consent ? fromJson<string[]>(consent.scopes_json, []) : [];
    return {
      client: { name: client.name, description: client.description, homepageUrl: client.homepage_url, logoUrl: client.logo_url, isTrusted: client.is_trusted === 1 },
      scopes: scopes.map((s) => ({ key: s, label: API_SCOPE_INFO[s].label, description: API_SCOPE_INFO[s].description })),
      redirectHost: (() => {
        try {
          return new URL(p.redirectUri).host || p.redirectUri;
        } catch {
          return p.redirectUri;
        }
      })(),
      alreadyApproved: client.is_trusted === 1 || scopes.every((s) => granted.includes(s)),
    };
  }

  /** Üye onayladı ya da reddetti: uygulamaya dönülecek adres. */
  async decide(viewer: RequestViewer, p: AuthorizeParams, approve: boolean): Promise<{ redirect: string }> {
    const { client, scopes } = await this.validateAuthorize(p);
    const url = new URL(p.redirectUri);
    if (p.state) url.searchParams.set('state', p.state);
    if (!approve) {
      url.searchParams.set('error', 'access_denied');
      url.searchParams.set('error_description', 'Kullanıcı erişime izin vermedi.');
      return { redirect: url.toString() };
    }
    const now = this.clock.now();
    const code = rand(32);
    await this.db.tx(async () => {
      await this.db.q
        .insertInto('oauth_codes')
        .values({
          code_hash: sha256(code),
          client_id: client.id,
          user_id: viewer.user!.id,
          redirect_uri: p.redirectUri,
          scopes_json: toJson(scopes),
          code_challenge: p.codeChallenge,
          challenge_method: p.codeChallenge ? 'S256' : null,
          expires_at: now + CODE_TTL,
          created_at: now,
        })
        .execute();
      const prev = await this.db.q.selectFrom('oauth_consents').select('scopes_json').where('client_id', '=', client.id).where('user_id', '=', viewer.user!.id).executeTakeFirst();
      const merged = [...new Set([...(prev ? fromJson<string[]>(prev.scopes_json, []) : []), ...scopes])];
      if (prev) await this.db.q.updateTable('oauth_consents').set({ scopes_json: toJson(merged), updated_at: now }).where('client_id', '=', client.id).where('user_id', '=', viewer.user!.id).execute();
      else await this.db.q.insertInto('oauth_consents').values({ client_id: client.id, user_id: viewer.user!.id, scopes_json: toJson(merged), created_at: now, updated_at: now }).execute();
      // Süresi geçmiş kodları temizle
      await this.db.q.deleteFrom('oauth_codes').where('expires_at', '<', now).execute();
    });
    url.searchParams.set('code', code);
    return { redirect: url.toString() };
  }

  // ---------- Token uç noktası ----------

  /** İstemci kimliği: HTTP Basic ya da gövdedeki client_id / client_secret. */
  private async authenticateClient(basic: string | undefined, body: Record<string, unknown>): Promise<ClientRow> {
    let id = typeof body.client_id === 'string' ? body.client_id : '';
    let secret = typeof body.client_secret === 'string' ? body.client_secret : '';
    if (basic?.startsWith('Basic ')) {
      const decoded = Buffer.from(basic.slice(6), 'base64').toString('utf8');
      const i = decoded.indexOf(':');
      if (i > 0) {
        id = decodeURIComponent(decoded.slice(0, i));
        secret = decodeURIComponent(decoded.slice(i + 1));
      }
    }
    const client = id ? await this.db.q.selectFrom('oauth_clients').selectAll().where('client_id', '=', id).executeTakeFirst() : undefined;
    if (!client || client.is_enabled !== 1) throw new OAuthError('invalid_client', 'İstemci doğrulanamadı.', 401);
    if (client.is_confidential === 1) {
      if (!secret || !client.secret_hash || !safeEqual(sha256(secret), client.secret_hash)) throw new OAuthError('invalid_client', 'İstemci doğrulanamadı.', 401);
    }
    return client;
  }

  private async issue(clientId: number, userId: number, scopes: string[]) {
    const now = this.clock.now();
    const access = `fat_${rand()}`;
    const refresh = `frt_${rand()}`;
    const ttl = this.settings.get('oauth.accessTokenMinutes') * MINUTE;
    await this.db.q
      .insertInto('oauth_tokens')
      .values({
        access_hash: sha256(access),
        refresh_hash: sha256(refresh),
        client_id: clientId,
        user_id: userId,
        scopes_json: toJson(scopes),
        expires_at: now + ttl,
        refresh_expires_at: now + this.settings.get('oauth.refreshTokenDays') * DAY,
        created_at: now,
      })
      .execute();
    return { access_token: access, token_type: 'Bearer', expires_in: Math.round(ttl / 1000), refresh_token: refresh, scope: scopes.join(' ') };
  }

  async token(basic: string | undefined, body: Record<string, unknown>) {
    const grant = String(body.grant_type ?? '');
    const client = await this.authenticateClient(basic, body);
    const now = this.clock.now();
    if (grant === 'authorization_code') {
      const code = String(body.code ?? '');
      const row = code ? await this.db.q.selectFrom('oauth_codes').selectAll().where('code_hash', '=', sha256(code)).executeTakeFirst() : undefined;
      // Kod tek kullanımlıktır: silmeyi başaran istek kazanır (aynı anda iki istek kodu iki kez kullanamaz).
      const claimed = row ? Number((await this.db.q.deleteFrom('oauth_codes').where('code_hash', '=', row.code_hash).executeTakeFirst()).numDeletedRows) > 0 : false;
      if (!row || !claimed || row.client_id !== client.id || row.expires_at <= now) throw new OAuthError('invalid_grant', 'Kod geçersiz ya da süresi dolmuş.');
      if (String(body.redirect_uri ?? '') !== row.redirect_uri) throw new OAuthError('invalid_grant', 'redirect_uri yetkilendirmedekiyle aynı olmalı.');
      if (row.code_challenge) {
        const verifier = String(body.code_verifier ?? '');
        const computed = createHash('sha256').update(verifier).digest('base64url');
        if (!verifier || !safeEqual(computed, row.code_challenge)) throw new OAuthError('invalid_grant', 'PKCE doğrulaması başarısız (code_verifier).');
      }
      const user = await this.db.q.selectFrom('users').select(['id', 'status']).where('id', '=', row.user_id).where('deleted_at', 'is', null).executeTakeFirst();
      if (!user || user.status !== 'active') throw new OAuthError('invalid_grant', 'Hesap etkin değil.');
      return this.issue(client.id, row.user_id, fromJson<string[]>(row.scopes_json, []));
    }
    if (grant === 'refresh_token') {
      const refresh = String(body.refresh_token ?? '');
      const row = refresh ? await this.db.q.selectFrom('oauth_tokens').selectAll().where('refresh_hash', '=', sha256(refresh)).executeTakeFirst() : undefined;
      if (!row || row.client_id !== client.id || row.revoked_at || !row.user_id || (row.refresh_expires_at ?? 0) <= now) throw new OAuthError('invalid_grant', 'Yenileme belirteci geçersiz.');
      const had = fromJson<string[]>(row.scopes_json, []);
      const wanted = typeof body.scope === 'string' && body.scope.trim() ? body.scope.trim().split(/\s+/) : had;
      if (wanted.some((s) => !had.includes(s))) throw new OAuthError('invalid_scope', 'Yenilemede yeni izin istenemez.');
      // Döndürme: eski belirteç çifti iptal edilir.
      await this.db.q.updateTable('oauth_tokens').set({ revoked_at: now }).where('id', '=', row.id).execute();
      return this.issue(client.id, row.user_id, wanted);
    }
    throw new OAuthError('unsupported_grant_type', 'Desteklenen türler: authorization_code, refresh_token.');
  }

  /** RFC 7009: belirteç iptali (bilinmeyen belirteç de başarılı sayılır). */
  async revoke(basic: string | undefined, body: Record<string, unknown>): Promise<void> {
    const client = await this.authenticateClient(basic, body);
    const token = String(body.token ?? '');
    if (!token) return;
    const hash = sha256(token);
    await this.db.q
      .updateTable('oauth_tokens')
      .set({ revoked_at: this.clock.now() })
      .where('client_id', '=', client.id)
      .where((eb) => eb.or([eb('access_hash', '=', hash), eb('refresh_hash', '=', hash)]))
      .execute();
  }

  async userinfo(viewer: RequestViewer) {
    const u = viewer.user!;
    const scopes = viewer.token?.scopes ?? new Set<string>();
    const summary = (await this.users.summaries([u.id])).get(u.id);
    const groupMap = await this.groups.map();
    const groups = viewer.groupIds.map((id) => groupMap.get(id)).filter((g) => !!g && g.system_key !== 'guest').map((g) => ({ id: g!.id, name: g!.name }));
    return {
      sub: String(u.id),
      id: u.id,
      username: u.username,
      preferred_username: u.username,
      name: u.display_name,
      picture: summary?.avatarUrl ? (summary.avatarUrl.startsWith('http') ? summary.avatarUrl : `${this.config.appUrl}${summary.avatarUrl}`) : null,
      profile: `${this.config.appUrl}/u/${u.id}`,
      groups,
      primary_group: summary?.primaryGroup ? { id: summary.primaryGroup.id, name: summary.primaryGroup.name } : null,
      registered_at: u.registered_at,
      ...(scopes.has('email') ? { email: u.email, email_verified: !!u.email_verified_at } : {}),
    };
  }

  /** Sunucu meta verisi (RFC 8414 benzeri; istemci kütüphanelerinin kendini ayarlaması için). */
  metadata() {
    const base = this.config.appUrl;
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      revocation_endpoint: `${base}/api/oauth/revoke`,
      userinfo_endpoint: `${base}/api/oauth/userinfo`,
      scopes_supported: API_SCOPES.filter((s) => API_SCOPE_INFO[s].oauth),
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
      service_documentation: `${base}/developers`,
    };
  }

  // ---------- Üyenin bağlı uygulamaları ----------

  async userApps(userId: number): Promise<AuthorizedApp[]> {
    const rows = await this.db.q
      .selectFrom('oauth_consents as s')
      .innerJoin('oauth_clients as c', 'c.id', 's.client_id')
      .select(['c.id', 'c.client_id', 'c.name', 'c.logo_url', 'c.homepage_url', 's.scopes_json', 's.created_at'])
      .where('s.user_id', '=', userId)
      .orderBy('s.created_at', 'desc')
      .execute();
    const used = await this.db.q
      .selectFrom('oauth_tokens')
      .select(['client_id', (eb) => eb.fn.max('last_used_at').as('last')])
      .where('user_id', '=', userId)
      .groupBy('client_id')
      .execute();
    const lastBy = new Map(used.map((r) => [r.client_id, r.last === null ? null : Number(r.last)]));
    return rows.map((r) => ({
      clientId: r.client_id,
      name: r.name,
      logoUrl: r.logo_url,
      homepageUrl: r.homepage_url,
      scopes: fromJson<ApiScope[]>(r.scopes_json, []),
      approvedAt: r.created_at,
      lastUsedAt: lastBy.get(r.id) ?? null,
    }));
  }

  async revokeApp(userId: number, clientId: string): Promise<void> {
    const client = await this.db.q.selectFrom('oauth_clients').select('id').where('client_id', '=', clientId).executeTakeFirst();
    if (!client) throw Errors.notFound('Uygulama bulunamadı.');
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('oauth_consents').where('client_id', '=', client.id).where('user_id', '=', userId).execute();
      await this.db.q.updateTable('oauth_tokens').set({ revoked_at: this.clock.now() }).where('client_id', '=', client.id).where('user_id', '=', userId).where('revoked_at', 'is', null).execute();
    });
  }

  // ---------- API anahtarları ----------

  async adminKeys(): Promise<AdminApiKey[]> {
    const rows = await this.db.q.selectFrom('api_keys').selectAll().orderBy('created_at', 'desc').execute();
    const users = await this.users.summaries(rows.map((r) => r.user_id));
    return rows.map((r) => {
      const u = users.get(r.user_id);
      return {
        id: r.id,
        name: r.name,
        prefix: r.prefix,
        user: u ? { id: u.id, username: u.username, displayName: u.displayName } : null,
        scopes: fromJson<ApiScope[]>(r.scopes_json, []),
        expiresAt: r.expires_at,
        revokedAt: r.revoked_at,
        lastUsedAt: r.last_used_at,
        lastIp: r.last_ip,
        createdAt: r.created_at,
      };
    });
  }

  async createKey(viewer: RequestViewer, input: { name: string; userId: number | null; scopes: string[]; expiresAt: number | null }): Promise<{ key: string; id: number }> {
    const userId = input.userId ?? viewer.user!.id;
    const user = await this.db.q.selectFrom('users').select(['id', 'status']).where('id', '=', userId).where('deleted_at', 'is', null).executeTakeFirst();
    if (!user) throw Errors.field('userId', 'Üye bulunamadı.');
    if (input.expiresAt !== null && input.expiresAt <= this.clock.now()) throw Errors.field('expiresAt', 'Bitiş tarihi gelecekte olmalı.');
    // Yetki yükseltmeyi önle: başkası adına anahtar yalnızca yöneticiler, "admin" kapsamı yalnızca yöneticinin kendi anahtarında
    const self = userId === viewer.user!.id;
    if (!self && !viewer.isAdmin) throw Errors.forbidden('Başka bir üye adına anahtar yalnızca yöneticiler oluşturabilir.');
    if (input.scopes.includes('admin') && (!self || !viewer.isAdmin)) throw Errors.field('scopes', '"admin" izni yalnızca yöneticinin kendi anahtarına verilebilir.');
    if (!self) {
      const adminGroup = await this.db.q.selectFrom('member_groups').select('id').where('system_key', '=', 'admin').executeTakeFirst();
      const target = await this.db.q.selectFrom('users').select('primary_group_id').where('id', '=', userId).executeTakeFirst();
      const extra = adminGroup ? await this.db.q.selectFrom('group_members').select('user_id').where('user_id', '=', userId).where('group_id', '=', adminGroup.id).executeTakeFirst() : undefined;
      if (adminGroup && (target?.primary_group_id === adminGroup.id || extra)) throw Errors.forbidden('Başka bir yönetici adına anahtar oluşturulamaz.');
    }
    const key = `fk_${rand()}`;
    const row = await this.db.q
      .insertInto('api_keys')
      .values({
        name: input.name,
        prefix: key.slice(0, 10),
        key_hash: sha256(key),
        user_id: userId,
        scopes_json: toJson(API_SCOPES.filter((s) => input.scopes.includes(s))),
        created_by: viewer.user!.id,
        expires_at: input.expiresAt,
        created_at: this.clock.now(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.audit.log({ type: 'admin', action: 'apikey.create', actorId: viewer.user!.id, ip: viewer.ip, data: { id: row.id, name: input.name, userId, scopes: input.scopes } });
    return { key, id: row.id };
  }

  async revokeKey(viewer: RequestViewer, id: number): Promise<void> {
    const r = await this.db.q.selectFrom('api_keys').select(['id', 'name']).where('id', '=', id).executeTakeFirst();
    if (!r) throw Errors.notFound('Anahtar bulunamadı.');
    await this.db.q.updateTable('api_keys').set({ revoked_at: this.clock.now() }).where('id', '=', id).execute();
    await this.audit.log({ type: 'admin', action: 'apikey.revoke', actorId: viewer.user!.id, ip: viewer.ip, data: { id, name: r.name } });
  }
}
