import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import {
  type AdminCustomCode,
  type AdminCustomPage,
  type AdminSnippet,
  type CustomPageView,
  type CustomSettingsInput,
  type IntegrationToken,
  type PageInput,
  type SnippetInput,
  type SnippetPlacement,
  type ViewerCustom,
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

  async page(viewer: RequestViewer, slug: string, canManage: boolean): Promise<CustomPageView> {
    const r = await this.db.q.selectFrom('custom_pages').selectAll().where('slug', '=', slug.toLowerCase()).executeTakeFirst();
    // Yayında olmayan ya da görünmeyen sayfa: yöneticiler önizleyebilir, diğerleri için yok.
    if (!r || (!canManage && (r.is_published !== 1 || !visibleTo(r.visibility, r.group_ids_json, viewer)))) throw Errors.notFound('Sayfa bulunamadı.');
    // HTML sayfaları özel kod kapalıyken gösterilmez (güvenli mod davranışıyla aynı).
    const html = r.format === 'html' && !this.settings.get('custom.enabled') ? '' : r.body_html;
    const blocks = r.format === 'builder' ? await this.builder.resolve(viewer, r.body) : undefined;
    return {
      blocks,
      css: r.format === 'builder' ? this.builder.css(r.body) : undefined,
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
    if (!canCode && (input.format === 'html' || prev?.format === 'html')) throw Errors.forbidden('HTML sayfaları için "Özel kod" yetkisi gerekir.');
    // Sürükle-bırak sayfa: blok şeması doğrulanır ve normalleştirilmiş JSON saklanır.
    const body =
      input.format === 'builder'
        ? JSON.stringify(this.builder.parse(input.body, canCode, prev?.format === 'builder' && BuilderService.hasHtml(prev.body)))
        : input.body;
    const clash = await this.db.q.selectFrom('custom_pages').select('id').where('slug', '=', input.slug).executeTakeFirst();
    if (clash && clash.id !== id) throw Errors.field('slug', 'Bu adres başka bir sayfada kullanılıyor.');

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
      data: { id: rowId, slug: input.slug, format: input.format },
    });
    return this.adminPage(rowId!);
  }

  async deletePage(viewer: RequestViewer, id: number, canCode: boolean): Promise<void> {
    const r = await this.db.q.selectFrom('custom_pages').select(['id', 'slug', 'format']).where('id', '=', id).executeTakeFirst();
    if (!r) throw Errors.notFound('Sayfa bulunamadı.');
    if (r.format === 'html' && !canCode) throw Errors.forbidden('HTML sayfaları için "Özel kod" yetkisi gerekir.');
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

  async previewBuilder(viewer: RequestViewer, body: string, canCode: boolean) {
    const doc = this.builder.parse(body, true, false);
    // Önizlemede görünürlük filtresi uygulanmaz; yetkisiz kullanıcıya HTML blokları boş gösterilir
    const all = doc.blocks.map((b) => ({ ...b, visibility: 'all' as const, ...(b.type === 'html' && !canCode ? { html: '' } : {}) }));
    return this.builder.resolve(viewer, JSON.stringify({ ...doc, blocks: all }));
  }

  /** Sayfa oluşturucu görselleri */
  async uploadImage(viewer: RequestViewer, file: UploadedImage): Promise<{ url: string }> {
    const saved = await this.storage.saveImage(file.buffer, { purpose: 'page_image', ownerUserId: viewer.user!.id, maxBytes: 8 * 1024 * 1024, maxDimension: 3200 });
    return { url: this.storage.publicUrl(saved)! };
  }
}
