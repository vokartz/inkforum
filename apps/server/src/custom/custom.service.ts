import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import {
  type AdminCustomCode,
  type AdminCustomPage,
  type AdminSnippet,
  type CustomPageResult,
  type CustomPageView,
  type CustomSettingsInput,
  type PageServerResponse,
  type PageTestInput,
  type PageTestResult,
  type IntegrationToken,
  type PageInput,
  type SnippetInput,
  type SnippetPlacement,
  type ViewerCustom,
  ErrorCode,
} from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { CacheService } from '../cache/cache.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { PostRenderService } from '../forum/post-render.service.js';
import { CONFIG, type AppConfig } from '../config/config.js';
import { BuilderService } from './builder.service.js';
import { PageRuntimeService, type PageRequest } from './page-runtime.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { UploadedImage } from '../common/upload.js';
import type { RequestViewer } from '../common/request-context.js';

const NS = 'custom';
type SnippetRow = Row<'custom_snippets'>;
type PageRow = Row<'custom_pages'>;

function ids(json: string): number[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

/** Görünürlük: herkes / üyeler / misafirler / seçili gruplar. */
function visibleTo(visibility: string, groupJson: string, viewer: RequestViewer): boolean {
  switch (visibility) {
    case 'members':
      return !!viewer.user;
    case 'guests':
      return !viewer.user;
    case 'groups': {
      if (!viewer.user) return false;
      const allowed = ids(groupJson);
      return viewer.groupIds.some((g) => allowed.includes(g));
    }
    default:
      return true;
  }
}

function ids2(json: string): string[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

@Injectable()
export class CustomService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly render: PostRenderService,
    private readonly builder: BuilderService,
    private readonly runtime: PageRuntimeService,
    private readonly storage: StorageService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private snippetRows(): Promise<SnippetRow[]> {
    return this.cache.wrap(NS, 'snippets', () =>
      this.db.q.selectFrom('custom_snippets').selectAll().orderBy('placement').orderBy('sort_order').orderBy('id').execute(),
    );
  }

  // ---------- Ziyaretçi ----------

  /** Ziyaretçiye göre çalışacak parçacıklar, özel CSS ve CSP ekleri. */
  async forViewer(viewer: RequestViewer): Promise<ViewerCustom> {
    const csp = this.settings.get('custom.csp');
    if (!this.settings.get('custom.enabled')) return { enabled: false, css: '', snippets: [], csp };
    const snippets = (await this.snippetRows())
      .filter((r) => r.is_enabled === 1 && r.html.trim() && visibleTo(r.visibility, r.group_ids_json, viewer))
      .map((r) => ({ id: r.id, placement: r.placement as SnippetPlacement, title: r.title, html: r.html }));
    return { enabled: true, css: this.settings.get('custom.css'), snippets, csp };
  }

  private async visiblePage(viewer: RequestViewer, r: PageRow | undefined, canManage: boolean): Promise<PageRow> {
    // Yayında olmayan ya da görünmeyen sayfa: yöneticiler önizleyebilir, diğerleri için yok.
    if (!r || (!canManage && (r.is_published !== 1 || !visibleTo(r.visibility, r.group_ids_json, viewer)))) throw Errors.notFound('Sayfa bulunamadı.');
    return r;
  }

  /** Sayfa görünümü; sunucu kodu açıksa önce o çalışır (yönlendirme, veri ya da HTML üretebilir) */
  async page(viewer: RequestViewer, slug: string, canManage: boolean, req: { path?: string; query?: Record<string, string> } = {}): Promise<CustomPageResult> {
    const r = await this.visiblePage(viewer, await this.db.q.selectFrom('custom_pages').selectAll().where('slug', '=', slug.toLowerCase()).executeTakeFirst(), canManage);
    return this.view(viewer, r, req.path ?? '/', req.query ?? {});
  }

  /** Kök adresli sayfa: /ucp, /ucp/karakterler → en uzun eşleşen sayfa, kalan kısım sunucu koduna gider */
  async pageByRoute(viewer: RequestViewer, path: string, canManage: boolean, query: Record<string, string>): Promise<CustomPageResult> {
    const clean = path.replace(/^\/+|\/+$/g, '').toLowerCase();
    const parts = clean.split('/').filter(Boolean);
    const candidates = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
    if (!candidates.length) throw Errors.notFound('Sayfa bulunamadı.');
    const rows = await this.db.q.selectFrom('custom_pages').selectAll().where('route', 'in', candidates).execute();
    const r = rows.sort((a, b) => b.route!.length - a.route!.length)[0];
    const page = await this.visiblePage(viewer, r, canManage);
    const rest = clean.slice(page.route!.length);
    // Sunucu kodu olmayan sayfanın alt adresleri yoktur
    if (rest && !this.runtime.active(page)) throw Errors.notFound('Sayfa bulunamadı.');
    return this.view(viewer, page, rest || '/', query);
  }

  private async view(viewer: RequestViewer, r: PageRow, path: string, query: Record<string, string>): Promise<CustomPageResult> {
    const code = this.settings.get('custom.enabled');
    // HTML sayfaları özel kod kapalıyken gösterilmez (güvenli mod davranışıyla aynı).
    let html = r.format === 'html' && !code ? '' : r.body_html;
    let data: unknown;
    if (this.runtime.active(r)) {
      const res = await this.runtime.run(r, viewer, { kind: 'page', method: 'GET', path, query, body: null, headers: {} }, { token: () => this.integrationToken(viewer).token });
      if (!res.ok) throw Errors.code(ErrorCode.INTERNAL, 'Sayfanın sunucu kodu çalışırken hata oluştu.', 500);
      const out = res.response!;
      if (out.type === 'redirect') return { redirect: out.url, status: out.status };
      if (out.type === 'status' && out.status >= 400) throw out.status === 403 ? Errors.forbidden('Bu sayfayı görme yetkin yok.') : Errors.notFound('Sayfa bulunamadı.');
      if (out.type === 'json') data = out.body;
      if (out.type === 'html') html = out.body;
      if (out.type === 'text') html = out.body.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!).replace(/\n/g, '<br>');
    } else if (path !== '/') throw Errors.notFound('Sayfa bulunamadı.');
    const blocks = r.format === 'builder' ? await this.builder.resolve(viewer, r.body) : undefined;
    const view: CustomPageView = {
      blocks,
      css: r.format === 'builder' ? this.builder.css(r.body) : code ? r.css : '',
      js: code ? r.js : '',
      route: r.route,
      sidebar: r.sidebar,
      sidebarHtml: code ? r.sidebar_html : '',
      data,
      hasServer: this.runtime.active(r),
      isLanding: this.settings.landing() === r.slug,
      id: r.id,
      slug: r.slug,
      title: r.title,
      format: r.format,
      html,
      layout: r.layout,
      showTitle: r.show_title === 1,
      metaDescription: r.meta_description,
      isPublished: r.is_published === 1,
      updatedAt: r.updated_at,
    };
    return view;
  }

  /** Sayfanın API ucu: /api/page-api/:slug/… (her yöntem) */
  async pageApi(viewer: RequestViewer, slug: string, req: Omit<PageRequest, 'kind'>): Promise<PageServerResponse> {
    const r = await this.visiblePage(viewer, await this.db.q.selectFrom('custom_pages').selectAll().where('slug', '=', slug.toLowerCase()).executeTakeFirst(), false);
    if (!this.runtime.active(r)) throw Errors.notFound('Bu sayfanın sunucu kodu yok.');
    const res = await this.runtime.run(r, viewer, { ...req, kind: 'api' }, { token: () => this.integrationToken(viewer).token });
    if (!res.ok) throw Errors.code(ErrorCode.INTERNAL, 'Sayfanın sunucu kodu çalışırken hata oluştu.', 500);
    return res.response!;
  }

  /** Yönetim: sunucu kodunu (kaydetmeden de) dener; günlükler ve hata ayrıntısı döner */
  async testPage(viewer: RequestViewer, id: number, input: PageTestInput, guest: RequestViewer): Promise<PageTestResult> {
    const r = await this.db.q.selectFrom('custom_pages').selectAll().where('id', '=', id).executeTakeFirst();
    if (!r) throw Errors.notFound('Sayfa bulunamadı.');
    const as = input.as === 'guest' ? guest : viewer;
    let body: unknown = input.body;
    try {
      body = input.body ? JSON.parse(input.body) : null;
    } catch {
      /* düz metin gövde */
    }
    const path = input.path.startsWith('/') ? input.path : `/${input.path}`;
    const res = await this.runtime.run(
      r,
      as,
      { kind: path === '/' && input.method === 'GET' ? 'page' : 'api', method: input.method, path, query: input.query, body, headers: { 'content-type': 'application/json' } },
      { code: input.code, token: () => this.integrationToken(as).token },
    );
    return { ok: res.ok, response: res.response, error: res.error ?? null, logs: res.logs, ms: res.ms };
  }

  /**
   * Dış sistemler (UCP vb.) için kısa ömürlü, HS256 imzalı JWT.
   * Karşı taraf aynı gizli anahtarla imzayı doğrulayıp `sub` alanındaki üye numarasına güvenebilir.
   */
  integrationToken(viewer: RequestViewer): IntegrationToken {
    const secret = this.settings.get('integration.secret');
    if (!secret) throw Errors.notFound('Entegrasyon anahtarı tanımlı değil.');
    const u = viewer.user!;
    const now = Math.floor(this.clock.now() / 1000);
    const exp = now + this.settings.get('custom.tokenTtl');
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(
      JSON.stringify({
        iss: this.config.appUrl,
        sub: String(u.id),
        username: u.username,
        name: u.display_name,
        groups: viewer.groupIds,
        primaryGroup: u.primary_group_id,
        emailVerified: u.email_verified_at != null,
        iat: now,
        exp,
        jti: randomBytes(9).toString('base64url'),
      }),
    );
    const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    return { token: `${header}.${payload}.${sig}`, expiresAt: exp * 1000 };
  }

  // ---------- Yönetim: parçacıklar ve ayarlar ----------

  private toAdminSnippet(r: SnippetRow): AdminSnippet {
    return {
      id: r.id,
      name: r.name,
      placement: r.placement as SnippetPlacement,
      title: r.title,
      html: r.html,
      visibility: r.visibility,
      groupIds: ids(r.group_ids_json),
      isEnabled: r.is_enabled === 1,
      sortOrder: r.sort_order,
      updatedAt: r.updated_at,
    };
  }

  async admin(): Promise<AdminCustomCode> {
    const secret = this.settings.get('integration.secret');
    return {
      snippets: (await this.snippetRows()).map((r) => this.toAdminSnippet(r)),
      settings: {
        enabled: this.settings.get('custom.enabled'),
        css: this.settings.get('custom.css'),
        csp: this.settings.get('custom.csp'),
        tokenTtl: this.settings.get('custom.tokenTtl'),
      },
      integration: { hasSecret: !!secret, secretHint: secret ? `${secret.slice(0, 4)}…${secret.slice(-4)}` : null, tokenUrl: `${this.config.appUrl}/api/me/integration-token` },
    };
  }

  async saveSnippet(viewer: RequestViewer, id: number | null, input: SnippetInput): Promise<AdminSnippet> {
    const now = this.clock.now();
    const values = {
      name: input.name,
      placement: input.placement,
      title: input.title,
      html: input.html,
      visibility: input.visibility,
      group_ids_json: JSON.stringify(input.visibility === 'groups' ? input.groupIds : []),
      is_enabled: input.isEnabled ? 1 : 0,
      sort_order: input.sortOrder,
      updated_at: now,
    };
    let rowId = id;
    if (id) {
      const res = await this.db.q.updateTable('custom_snippets').set(values).where('id', '=', id).executeTakeFirst();
      if (!Number(res.numUpdatedRows)) throw Errors.notFound('Parçacık bulunamadı.');
    } else {
      const row = await this.db.q.insertInto('custom_snippets').values({ ...values, created_at: now }).returning('id').executeTakeFirstOrThrow();
      rowId = row.id;
    }
    await this.cache.invalidate(NS);
    await this.audit.log({
      type: 'admin',
      action: id ? 'custom.snippet.update' : 'custom.snippet.create',
      actorId: viewer.user!.id,
      ip: viewer.ip,
      data: { id: rowId, name: input.name, placement: input.placement, enabled: input.isEnabled },
    });
    const row = await this.db.q.selectFrom('custom_snippets').selectAll().where('id', '=', rowId!).executeTakeFirstOrThrow();
    return this.toAdminSnippet(row);
  }

  async deleteSnippet(viewer: RequestViewer, id: number): Promise<void> {
    const row = await this.db.q.selectFrom('custom_snippets').select(['id', 'name']).where('id', '=', id).executeTakeFirst();
    if (!row) throw Errors.notFound('Parçacık bulunamadı.');
    await this.db.q.deleteFrom('custom_snippets').where('id', '=', id).execute();
    await this.cache.invalidate(NS);
    await this.audit.log({ type: 'admin', action: 'custom.snippet.delete', actorId: viewer.user!.id, ip: viewer.ip, data: { id, name: row.name } });
  }

  async saveSettings(viewer: RequestViewer, input: CustomSettingsInput): Promise<void> {
    const uniq = (list: string[]) => [...new Set(list.map((s) => s.toLowerCase()))];
    await this.settings.update(
      {
        'custom.enabled': input.enabled,
        'custom.css': input.css,
        'custom.csp': { script: uniq(input.csp.script), connect: uniq(input.csp.connect), style: uniq(input.csp.style), font: uniq(input.csp.font) },
        'custom.tokenTtl': input.tokenTtl,
      },
      viewer.user!.id,
      { allowHidden: true },
    );
    await this.audit.log({ type: 'admin', action: 'custom.settings', actorId: viewer.user!.id, ip: viewer.ip, data: { enabled: input.enabled, csp: input.csp } });
  }

  /** Yeni imza anahtarı üretir; eski anahtarla imzalanmış belirteçler geçersizleşir. Anahtar yalnızca bir kez gösterilir. */
  async rotateSecret(viewer: RequestViewer): Promise<{ secret: string }> {
    const secret = randomBytes(32).toString('base64url');
    await this.settings.update({ 'integration.secret': secret }, viewer.user!.id, { allowHidden: true });
    await this.audit.log({ type: 'admin', action: 'custom.secret.rotate', actorId: viewer.user!.id, ip: viewer.ip });
    return { secret };
  }

  async removeSecret(viewer: RequestViewer): Promise<void> {
    await this.settings.update({ 'integration.secret': '' }, viewer.user!.id, { allowHidden: true });
    await this.audit.log({ type: 'admin', action: 'custom.secret.remove', actorId: viewer.user!.id, ip: viewer.ip });
  }

  // ---------- Yönetim: sayfalar ----------

  private toAdminPage(r: PageRow): AdminCustomPage {
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      format: r.format,
      body: r.body,
      layout: r.layout,
      showTitle: r.show_title === 1,
      metaDescription: r.meta_description,
      visibility: r.visibility,
      groupIds: ids(r.group_ids_json),
      isPublished: r.is_published === 1,
      route: r.route,
      css: r.css,
      js: r.js,
      sidebar: r.sidebar,
      sidebarHtml: r.sidebar_html,
      serverEnabled: r.server_enabled === 1,
      serverCode: r.server_code,
      allowedHosts: ids2(r.allowed_hosts_json),
      secrets: Object.keys(this.runtime.secrets(r)).map((name) => ({ name })),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async adminPages(): Promise<AdminCustomPage[]> {
    const rows = await this.db.q.selectFrom('custom_pages').selectAll().orderBy('title').execute();
    return rows.map((r) => this.toAdminPage(r));
  }

  async adminPage(id: number): Promise<AdminCustomPage> {
    const r = await this.db.q.selectFrom('custom_pages').selectAll().where('id', '=', id).executeTakeFirst();
    if (!r) throw Errors.notFound('Sayfa bulunamadı.');
    return this.toAdminPage(r);
  }

  /**
   * HTML biçimi yalnızca `admin.customCode` yetkisiyle kaydedilebilir; yalnızca sayfa yetkisi olan
   * yönetici var olan bir HTML sayfasının içeriğini değiştiremez.
   */
  async savePage(viewer: RequestViewer, id: number | null, input: PageInput, canCode: boolean): Promise<AdminCustomPage> {
    const prev = id ? await this.db.q.selectFrom('custom_pages').selectAll().where('id', '=', id).executeTakeFirst() : undefined;
    if (id && !prev) throw Errors.notFound('Sayfa bulunamadı.');
    // Kod alanları (HTML, CSS, JS, kenar çubuğu, sunucu kodu, gizli değerler) yalnızca "Özel kod" yetkisiyle değişir
    const prevSecrets = prev ? this.runtime.secrets(prev) : {};
    const codeNow = [input.css, input.js, input.sidebarHtml, input.serverCode, String(input.serverEnabled), JSON.stringify(input.allowedHosts)];
    const codeBefore = prev
      ? [prev.css, prev.js, prev.sidebar_html, prev.server_code, String(prev.server_enabled === 1), JSON.stringify(ids2(prev.allowed_hosts_json))]
      : ['', '', '', '', 'false', '[]'];
    const secretsChanged =
      input.secrets.some((x) => x.value !== undefined) ||
      input.secrets
        .map((x) => x.name)
        .sort()
        .join() !== Object.keys(prevSecrets).sort().join();
    const touchesCode = input.format === 'html' || prev?.format === 'html' || codeNow.some((v, i) => v !== codeBefore[i]) || secretsChanged;
    if (!canCode && touchesCode) throw Errors.forbidden('HTML, CSS, JavaScript ve sunucu kodu için "Özel kod" yetkisi gerekir.');
    // Görsel düzenleyici kaldırıldı: eski sayfalar içerik değişmeden saklanabilir, yeni içerik HTML ya da BBCode olur
    if (input.format === 'builder' && (prev?.format !== 'builder' || prev.body !== input.body)) {
      throw Errors.field('format', 'Görsel düzenleyici kaldırıldı. Sayfayı HTML ya da BBCode olarak düzenleyin ("HTML koduna dönüştür").');
    }
    const body = input.body;
    const clash = await this.db.q.selectFrom('custom_pages').select('id').where('slug', '=', input.slug).executeTakeFirst();
    if (clash && clash.id !== id) throw Errors.field('slug', 'Bu adres başka bir sayfada kullanılıyor.');
    if (input.route) {
      const routeClash = await this.db.q.selectFrom('custom_pages').select('id').where('route', '=', input.route).executeTakeFirst();
      if (routeClash && routeClash.id !== id) throw Errors.field('route', 'Bu adres başka bir sayfada kullanılıyor.');
    }
    const secrets: Record<string, string> = {};
    for (const x of input.secrets) secrets[x.name] = x.value !== undefined ? x.value : (prevSecrets[x.name] ?? '');

    const now = this.clock.now();
    const values = {
      slug: input.slug,
      title: input.title,
      format: input.format,
      body,
      body_html: input.format === 'html' ? input.body : input.format === 'builder' ? '' : this.render.post(input.body).html,
      layout: input.layout,
      show_title: input.showTitle ? 1 : 0,
      meta_description: input.metaDescription,
      visibility: input.visibility,
      group_ids_json: JSON.stringify(input.visibility === 'groups' ? input.groupIds : []),
      is_published: input.isPublished ? 1 : 0,
      route: input.route,
      css: input.css,
      js: input.js,
      sidebar: input.sidebar,
      sidebar_html: input.sidebarHtml,
      server_enabled: input.serverEnabled ? 1 : 0,
      server_code: input.serverCode,
      allowed_hosts_json: JSON.stringify(input.allowedHosts),
      secrets_enc: this.runtime.encryptSecrets(secrets),
      updated_by: viewer.user!.id,
      updated_at: now,
    };
    let rowId = id;
    if (id) await this.db.q.updateTable('custom_pages').set(values).where('id', '=', id).execute();
    else rowId = (await this.db.q.insertInto('custom_pages').values({ ...values, created_at: now }).returning('id').executeTakeFirstOrThrow()).id;
    // Açılış sayfasının adresi değiştiyse ayar da güncellenir; taslağa alındıysa forum dizinine dönülür.
    if (prev && this.settings.get('home.landingPage') === prev.slug && (prev.slug !== input.slug || !input.isPublished)) {
      await this.settings.update({ 'home.landingPage': input.isPublished ? input.slug : '' }, viewer.user!.id, { allowHidden: true });
    }
    await this.audit.log({
      type: 'admin',
      action: id ? 'custom.page.update' : 'custom.page.create',
      actorId: viewer.user!.id,
      ip: viewer.ip,
      data: { id: rowId, slug: input.slug, format: input.format, route: input.route, server: input.serverEnabled },
    });
    return this.adminPage(rowId!);
  }

  async deletePage(viewer: RequestViewer, id: number, canCode: boolean): Promise<void> {
    const r = await this.db.q.selectFrom('custom_pages').select(['id', 'slug', 'format', 'server_enabled', 'js']).where('id', '=', id).executeTakeFirst();
    if (!r) throw Errors.notFound('Sayfa bulunamadı.');
    if ((r.format === 'html' || r.server_enabled === 1 || r.js) && !canCode) throw Errors.forbidden('HTML sayfaları için "Özel kod" yetkisi gerekir.');
    await this.db.q.deleteFrom('custom_pages').where('id', '=', id).execute();
    if (this.settings.get('home.landingPage') === r.slug) await this.settings.update({ 'home.landingPage': '' }, viewer.user!.id, { allowHidden: true });
    await this.audit.log({ type: 'admin', action: 'custom.page.delete', actorId: viewer.user!.id, ip: viewer.ip, data: { id, slug: r.slug } });
  }

  /** Açılış sayfası: seçilen sayfa ana sayfada gösterilir, forum /forum adresine taşınır. */
  async setLanding(viewer: RequestViewer, id: number | null): Promise<void> {
    if (id && !this.settings.plugin('landing')) throw Errors.badRequest('Önce Yönetim → Eklentiler ekranından "Açılış sayfası" eklentisini açın.');
    let slug = '';
    if (id) {
      const r = await this.db.q.selectFrom('custom_pages').select(['slug', 'is_published']).where('id', '=', id).executeTakeFirst();
      if (!r) throw Errors.notFound('Sayfa bulunamadı.');
      if (r.is_published !== 1) throw Errors.badRequest('Taslak sayfa açılış sayfası yapılamaz; önce yayımlayın.');
      slug = r.slug;
    }
    await this.settings.update({ 'home.landingPage': slug }, viewer.user!.id, { allowHidden: true });
    await this.audit.log({ type: 'admin', action: 'custom.page.landing', actorId: viewer.user!.id, ip: viewer.ip, data: { id, slug } });
  }

  /** Sayfa görselleri (yönetimdeki görsel alanları) */
  async uploadImage(viewer: RequestViewer, file: UploadedImage): Promise<{ url: string }> {
    const saved = await this.storage.saveImage(file.buffer, { purpose: 'page_image', ownerUserId: viewer.user!.id, maxBytes: 8 * 1024 * 1024, maxDimension: 3200 });
    return { url: this.storage.publicUrl(saved)! };
  }
}
