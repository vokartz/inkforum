import { Injectable } from '@nestjs/common';
import {
  type AdminCustomPage,
  type CustomPageResult,
  type CustomPageView,
  type PageServerResponse,
  type PageTestInput,
  type PageTestResult,
  type PageInput,
  ErrorCode,
} from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { PostRenderService } from '../forum/post-render.service.js';
import { BuilderService } from './builder.service.js';
import { PageRuntimeService, type PageRequest } from './page-runtime.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { UploadedImage } from '../common/upload.js';
import type { RequestViewer } from '../common/request-context.js';

type PageRow = Row<'custom_pages'>;

function ids(json: string): number[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

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

@Injectable()
export class CustomService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly render: PostRenderService,
    private readonly builder: BuilderService,
    private readonly runtime: PageRuntimeService,
    private readonly storage: StorageService,
  ) {}

  private async visiblePage(viewer: RequestViewer, r: PageRow | undefined, canManage: boolean): Promise<PageRow> {
    if (!r || (!canManage && (r.is_published !== 1 || !visibleTo(r.visibility, r.group_ids_json, viewer)))) throw Errors.notFound('Sayfa bulunamadı.');
    return r;
  }

  async page(viewer: RequestViewer, slug: string, canManage: boolean, req: { path?: string; query?: Record<string, string> } = {}): Promise<CustomPageResult> {
    const r = await this.visiblePage(viewer, await this.db.q.selectFrom('custom_pages').selectAll().where('slug', '=', slug.toLowerCase()).executeTakeFirst(), canManage);
    return this.view(viewer, r, req.path ?? '/', req.query ?? {});
  }

  async pageByRoute(viewer: RequestViewer, path: string, canManage: boolean, query: Record<string, string>): Promise<CustomPageResult> {
    const clean = path.replace(/^\/+|\/+$/g, '').toLowerCase();
    const parts = clean.split('/').filter(Boolean);
    const candidates = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
    if (!candidates.length) throw Errors.notFound('Sayfa bulunamadı.');
    const rows = await this.db.q.selectFrom('custom_pages').selectAll().where('route', 'in', candidates).execute();
    const r = rows.sort((a, b) => b.route!.length - a.route!.length)[0];
    const page = await this.visiblePage(viewer, r, canManage);
    const rest = clean.slice(page.route!.length);
    if (rest && !this.runtime.active(page)) throw Errors.notFound('Sayfa bulunamadı.');
    return this.view(viewer, page, rest || '/', query);
  }

  private async view(viewer: RequestViewer, r: PageRow, path: string, query: Record<string, string>): Promise<CustomPageResult> {
    let html = r.body_html;
    let data: unknown;
    if (this.runtime.active(r)) {
      const res = await this.runtime.run(r, viewer, { kind: 'page', method: 'GET', path, query, body: null, headers: {} });
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
      css: r.format === 'builder' ? this.builder.css(r.body) : r.css,
      js: r.js,
      route: r.route,
      sidebar: r.sidebar,
      sidebarHtml: r.sidebar_html,
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

  async pageApi(viewer: RequestViewer, slug: string, req: Omit<PageRequest, 'kind'>): Promise<PageServerResponse> {
    const r = await this.visiblePage(viewer, await this.db.q.selectFrom('custom_pages').selectAll().where('slug', '=', slug.toLowerCase()).executeTakeFirst(), false);
    if (!this.runtime.active(r)) throw Errors.notFound('Bu sayfanın sunucu kodu yok.');
    const res = await this.runtime.run(r, viewer, { ...req, kind: 'api' });
    if (!res.ok) throw Errors.code(ErrorCode.INTERNAL, 'Sayfanın sunucu kodu çalışırken hata oluştu.', 500);
    return res.response!;
  }

  async testPage(viewer: RequestViewer, id: number, input: PageTestInput, guest: RequestViewer): Promise<PageTestResult> {
    const r = await this.db.q.selectFrom('custom_pages').selectAll().where('id', '=', id).executeTakeFirst();
    if (!r) throw Errors.notFound('Sayfa bulunamadı.');
    const as = input.as === 'guest' ? guest : viewer;
    let body: unknown = input.body;
    try {
      body = input.body ? JSON.parse(input.body) : null;
    } catch {
    }
    const path = input.path.startsWith('/') ? input.path : `/${input.path}`;
    const res = await this.runtime.run(
      r,
      as,
      { kind: path === '/' && input.method === 'GET' ? 'page' : 'api', method: input.method, path, query: input.query, body, headers: { 'content-type': 'application/json' } },
      { code: input.code },
    );
    return { ok: res.ok, response: res.response, error: res.error ?? null, logs: res.logs, ms: res.ms };
  }

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

  async savePage(viewer: RequestViewer, id: number | null, input: PageInput, canCode: boolean): Promise<AdminCustomPage> {
    const prev = id ? await this.db.q.selectFrom('custom_pages').selectAll().where('id', '=', id).executeTakeFirst() : undefined;
    if (id && !prev) throw Errors.notFound('Sayfa bulunamadı.');
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
    if (!canCode && touchesCode) throw Errors.forbidden('HTML, CSS, JavaScript ve sunucu kodu için "Kod düzenleme" yetkisi gerekir.');
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
    if ((r.format === 'html' || r.server_enabled === 1 || r.js) && !canCode) throw Errors.forbidden('HTML sayfaları için "Kod düzenleme" yetkisi gerekir.');
    await this.db.q.deleteFrom('custom_pages').where('id', '=', id).execute();
    if (this.settings.get('home.landingPage') === r.slug) await this.settings.update({ 'home.landingPage': '' }, viewer.user!.id, { allowHidden: true });
    await this.audit.log({ type: 'admin', action: 'custom.page.delete', actorId: viewer.user!.id, ip: viewer.ip, data: { id, slug: r.slug } });
  }

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

  async uploadImage(viewer: RequestViewer, file: UploadedImage): Promise<{ url: string }> {
    const saved = await this.storage.saveImage(file.buffer, { purpose: 'page_image', ownerUserId: viewer.user!.id, maxBytes: 8 * 1024 * 1024, maxDimension: 3200 });
    return { url: this.storage.publicUrl(saved)! };
  }
}
