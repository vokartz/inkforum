import { Injectable } from '@nestjs/common';
import type {
  WikiIndex,
  WikiLink,
  WikiPageInput,
  WikiPageView,
  WikiReorderInput,
  WikiRevisionDetail,
  WikiRevisionItem,
  WikiTreeNode,
} from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { CacheService } from '../cache/cache.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import { PostRenderService } from '../forum/post-render.service.js';
import { StorageService } from '../storage/storage.service.js';
import { can, type RequestViewer } from '../common/request-context.js';
import type { UploadedImage } from '../common/upload.js';
import { iconExists, iconNode } from '../common/icons.js';

const NS = 'wiki';
type PageMeta = Pick<Row<'wiki_pages'>, 'id' | 'parent_id' | 'slug' | 'title' | 'icon' | 'summary' | 'sort_order' | 'is_published' | 'updated_at' | 'updated_by'>;

interface Tree {
  byId: Map<number, PageMeta>;
  children: Map<number | null, PageMeta[]>;
  paths: Map<number, string>;
  order: number[];
}

@Injectable()
export class WikiService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly render: PostRenderService,
    private readonly storage: StorageService,
  ) {}

  canEdit(v: RequestViewer): boolean {
    return can(v, 'wiki.edit') || this.canManage(v);
  }

  canManage(v: RequestViewer): boolean {
    return can(v, 'admin.wiki');
  }

  private assertView(v: RequestViewer): void {
    if (!can(v, 'wiki.view') && !this.canEdit(v)) throw Errors.forbidden('Wiki sayfalarını görme yetkiniz yok.');
    if (!this.settings.get('wiki.enabled') && !this.canEdit(v)) throw Errors.notFound('Wiki kapalı.');
  }

  private async tree(): Promise<Tree> {
    return this.cache.wrap(NS, 'tree', async () => {
      const rows = await this.db.q
        .selectFrom('wiki_pages')
        .select(['id', 'parent_id', 'slug', 'title', 'icon', 'summary', 'sort_order', 'is_published', 'updated_at', 'updated_by'])
        .orderBy('sort_order')
        .orderBy('title')
        .execute();
      const byId = new Map(rows.map((r) => [r.id, r]));
      const children = new Map<number | null, PageMeta[]>();
      for (const r of rows) {
        const parent = r.parent_id && byId.has(r.parent_id) ? r.parent_id : null;
        const list = children.get(parent) ?? [];
        list.push(r);
        children.set(parent, list);
      }
      const paths = new Map<number, string>();
      const order: number[] = [];
      const walk = (parent: number | null, prefix: string, depth: number) => {
        if (depth > 20) return;
        for (const r of children.get(parent) ?? []) {
          const path = prefix ? `${prefix}/${r.slug}` : r.slug;
          paths.set(r.id, path);
          order.push(r.id);
          walk(r.id, path, depth + 1);
        }
      };
      walk(null, '', 0);
      return { byId, children, paths, order };
    });
  }

  private visible(r: PageMeta, v: RequestViewer): boolean {
    return r.is_published === 1 || this.canEdit(v);
  }

  private link(t: Tree, r: PageMeta): WikiLink {
    return { title: r.title, path: t.paths.get(r.id) ?? r.slug, icon: r.icon, iconNodes: iconNode(r.icon) };
  }

  private nodes(t: Tree, parent: number | null, v: RequestViewer): WikiTreeNode[] {
    return (t.children.get(parent) ?? [])
      .filter((r) => this.visible(r, v) && t.paths.has(r.id))
      .map((r) => ({
        id: r.id,
        parentId: r.parent_id,
        slug: r.slug,
        path: t.paths.get(r.id)!,
        title: r.title,
        icon: r.icon,
        iconNodes: iconNode(r.icon),
        summary: r.summary,
        sortOrder: r.sort_order,
        isPublished: r.is_published === 1,
        updatedAt: r.updated_at,
        children: this.nodes(t, r.id, v),
      }));
  }

  async sitemap(): Promise<Array<{ path: string; title: string; updatedAt: number }>> {
    const t = await this.tree();
    return [...t.byId.values()].filter((r) => r.is_published === 1 && t.paths.has(r.id)).map((r) => ({ path: t.paths.get(r.id)!, title: r.title, updatedAt: r.updated_at }));
  }

  async index(v: RequestViewer): Promise<WikiIndex> {
    this.assertView(v);
    const t = await this.tree();
    const all = [...t.byId.values()].filter((r) => this.visible(r, v) && t.paths.has(r.id));
    const recentRows = [...all].sort((a, b) => b.updated_at - a.updated_at).slice(0, 8);
    const people = await this.users.summaries(recentRows.map((r) => r.updated_by ?? 0));
    return {
      title: this.settings.get('wiki.title'),
      description: this.settings.get('wiki.description'),
      tree: this.nodes(t, null, v),
      recent: recentRows.map((r) => ({ ...this.link(t, r), updatedAt: r.updated_at, updatedBy: r.updated_by ? (people.get(r.updated_by) ?? null) : null })),
      pageCount: all.length,
      canEdit: this.canEdit(v),
      canManage: this.canManage(v),
    };
  }

  private resolvePath(t: Tree, path: string): PageMeta | null {
    let parent: number | null = null;
    let found: PageMeta | null = null;
    for (const seg of path.split('/').filter(Boolean)) {
      found = (t.children.get(parent) ?? []).find((r) => r.slug === seg.toLowerCase()) ?? null;
      if (!found) return null;
      parent = found.id;
    }
    return found;
  }

  async page(v: RequestViewer, path: string): Promise<WikiPageView> {
    this.assertView(v);
    const t = await this.tree();
    const meta = this.resolvePath(t, path);
    if (!meta || !this.visible(meta, v)) throw Errors.notFound('Wiki sayfası bulunamadı.');
    const row = await this.db.q.selectFrom('wiki_pages').selectAll().where('id', '=', meta.id).executeTakeFirstOrThrow();
    const [revs, people] = await Promise.all([
      this.db.q.selectFrom('wiki_revisions').select((eb) => eb.fn.countAll<number>().as('n')).where('page_id', '=', row.id).executeTakeFirst(),
      this.users.summaries([row.updated_by ?? 0]),
    ]);
    await this.db.q.updateTable('wiki_pages').set((eb) => ({ view_count: eb('view_count', '+', 1) })).where('id', '=', row.id).execute();

    const crumbs: WikiLink[] = [];
    for (let p = row.parent_id ? t.byId.get(row.parent_id) : undefined, n = 0; p && n < 20; p = p.parent_id ? t.byId.get(p.parent_id) : undefined, n++) crumbs.unshift(this.link(t, p));
    const order = t.order.filter((id) => this.visible(t.byId.get(id)!, v));
    const at = order.indexOf(row.id);
    const neighbour = (id: number | undefined) => (id ? this.link(t, t.byId.get(id)!) : null);
    const editable = this.canEdit(v) && (row.is_locked !== 1 || this.canManage(v));

    return {
      id: row.id,
      parentId: row.parent_id,
      slug: row.slug,
      path: t.paths.get(row.id)!,
      title: row.title,
      icon: row.icon,
      iconNodes: iconNode(row.icon),
      summary: row.summary,
      html: row.body_html,
      body: editable ? row.body : null,
      isPublished: row.is_published === 1,
      isLocked: row.is_locked === 1,
      views: row.view_count + 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by ? (people.get(row.updated_by) ?? null) : null,
      revisionCount: Number(revs?.n ?? 0),
      breadcrumbs: crumbs,
      children: (t.children.get(row.id) ?? []).filter((c) => this.visible(c, v)).map((c) => ({ ...this.link(t, c), summary: c.summary })),
      prev: at > 0 ? neighbour(order[at - 1]) : null,
      next: at >= 0 && at < order.length - 1 ? neighbour(order[at + 1]) : null,
      canEdit: editable,
      canManage: this.canManage(v),
    };
  }

  private async validate(t: Tree, id: number | null, input: WikiPageInput): Promise<void> {
    if (input.icon && !iconExists(input.icon)) throw Errors.field('icon', 'Bu ikon bulunamadı.');
    if (input.parentId !== null) {
      if (!t.byId.has(input.parentId)) throw Errors.field('parentId', 'Üst sayfa bulunamadı.');
      for (let p: number | null = input.parentId, n = 0; p && n < 50; p = t.byId.get(p)?.parent_id ?? null, n++) {
        if (p === id) throw Errors.field('parentId', 'Sayfa kendi alt sayfasının altına taşınamaz.');
      }
    }
    if (input.parentId === null && ['new', 'edit', 'history'].includes(input.slug)) throw Errors.field('slug', 'Bu adres ayrılmış; başka bir adres seçin.');
    const clash = (t.children.get(input.parentId) ?? []).find((r) => r.slug === input.slug && r.id !== id);
    if (clash) throw Errors.field('slug', 'Aynı yerde bu adrese sahip başka bir sayfa var.');
  }

  async save(v: RequestViewer, id: number | null, input: WikiPageInput): Promise<{ id: number; path: string }> {
    if (!this.canEdit(v)) throw Errors.forbidden('Wiki düzenleme yetkiniz yok.');
    const t = await this.tree();
    const prev = id ? await this.db.q.selectFrom('wiki_pages').selectAll().where('id', '=', id).executeTakeFirst() : undefined;
    if (id && !prev) throw Errors.notFound('Wiki sayfası bulunamadı.');
    const manage = this.canManage(v);
    if (prev?.is_locked === 1 && !manage) throw Errors.forbidden('Bu sayfa kilitli; yalnızca wiki yöneticileri düzenleyebilir.');
    if (!manage) {
      input.isLocked = prev ? prev.is_locked === 1 : false;
      if (prev) input.parentId = prev.parent_id;
    }
    await this.validate(t, id, input);

    const now = this.clock.now();
    const values = {
      parent_id: input.parentId,
      slug: input.slug,
      title: input.title,
      icon: input.icon || null,
      summary: input.summary || null,
      body: input.body,
      body_html: this.render.post(input.body).html,
      is_published: input.isPublished ? 1 : 0,
      is_locked: input.isLocked ? 1 : 0,
      updated_by: v.user!.id,
      updated_at: now,
    };
    const rowId = await this.db.tx(async () => {
      let pageId = id;
      if (id) await this.db.q.updateTable('wiki_pages').set(values).where('id', '=', id).execute();
      else {
        const last = await this.db.q
          .selectFrom('wiki_pages')
          .select((eb) => eb.fn.max('sort_order').as('m'))
          .where((eb) => (input.parentId === null ? eb('parent_id', 'is', null) : eb('parent_id', '=', input.parentId)))
          .executeTakeFirst();
        pageId = (
          await this.db.q
            .insertInto('wiki_pages')
            .values({ ...values, sort_order: Number(last?.m ?? -1) + 1, created_by: v.user!.id, created_at: now })
            .returning('id')
            .executeTakeFirstOrThrow()
        ).id;
      }
      if (!prev || prev.body !== input.body || prev.title !== input.title) {
        await this.db.q.insertInto('wiki_revisions').values({ page_id: pageId!, title: input.title, body: input.body, note: input.note, user_id: v.user!.id, created_at: now }).execute();
      }
      return pageId!;
    });
    await this.cache.invalidate(NS);
    await this.audit.log({ type: 'admin', action: id ? 'wiki.update' : 'wiki.create', actorId: v.user!.id, ip: v.ip, data: { id: rowId, title: input.title } });
    const fresh = await this.tree();
    return { id: rowId, path: fresh.paths.get(rowId) ?? input.slug };
  }

  async remove(v: RequestViewer, id: number): Promise<void> {
    if (!this.canManage(v)) throw Errors.forbidden('Wiki sayfası silme yetkiniz yok.');
    const row = await this.db.q.selectFrom('wiki_pages').select(['id', 'title', 'parent_id']).where('id', '=', id).executeTakeFirst();
    if (!row) throw Errors.notFound('Wiki sayfası bulunamadı.');
    await this.db.tx(async () => {
      await this.db.q.updateTable('wiki_pages').set({ parent_id: row.parent_id }).where('parent_id', '=', id).execute();
      await this.db.q.deleteFrom('wiki_revisions').where('page_id', '=', id).execute();
      await this.db.q.deleteFrom('wiki_pages').where('id', '=', id).execute();
    });
    await this.cache.invalidate(NS);
    await this.audit.log({ type: 'admin', action: 'wiki.delete', actorId: v.user!.id, ip: v.ip, data: { id, title: row.title } });
  }

  async reorder(v: RequestViewer, input: WikiReorderInput): Promise<void> {
    if (!this.canManage(v)) throw Errors.forbidden('Wiki düzenini değiştirme yetkiniz yok.');
    const t = await this.tree();
    const parentOf = new Map([...t.byId.values()].map((r) => [r.id, r.parent_id]));
    for (const it of input.items) {
      if (!t.byId.has(it.id)) throw Errors.badRequest('Bilinmeyen sayfa.');
      if (it.parentId !== null && !t.byId.has(it.parentId)) throw Errors.badRequest('Bilinmeyen üst sayfa.');
      parentOf.set(it.id, it.parentId);
    }
    for (const id of parentOf.keys()) {
      for (let p = parentOf.get(id) ?? null, n = 0; p !== null; p = parentOf.get(p) ?? null, n++) {
        if (p === id || n > 50) throw Errors.badRequest('Bir sayfa kendi altına taşınamaz.');
      }
    }
    const seen = new Set<string>();
    for (const [id, parent] of parentOf) {
      const key = `${parent ?? 0}/${t.byId.get(id)!.slug}`;
      if (seen.has(key)) throw Errors.badRequest(`"${t.byId.get(id)!.title}" taşındığı yerde aynı adrese sahip bir sayfa var.`);
      seen.add(key);
    }
    await this.db.tx(async () => {
      for (const it of input.items) {
        await this.db.q.updateTable('wiki_pages').set({ parent_id: it.parentId, sort_order: it.sortOrder }).where('id', '=', it.id).execute();
      }
    });
    await this.cache.invalidate(NS);
    await this.audit.log({ type: 'admin', action: 'wiki.reorder', actorId: v.user!.id, ip: v.ip, data: { count: input.items.length } });
  }

  async forEdit(v: RequestViewer, id: number) {
    if (!this.canEdit(v)) throw Errors.forbidden('Wiki düzenleme yetkiniz yok.');
    const r = await this.db.q.selectFrom('wiki_pages').selectAll().where('id', '=', id).executeTakeFirst();
    if (!r) throw Errors.notFound('Wiki sayfası bulunamadı.');
    if (r.is_locked === 1 && !this.canManage(v)) throw Errors.forbidden('Bu sayfa kilitli; yalnızca wiki yöneticileri düzenleyebilir.');
    const t = await this.tree();
    return {
      id: r.id,
      parentId: r.parent_id,
      slug: r.slug,
      title: r.title,
      icon: r.icon,
      summary: r.summary,
      body: r.body,
      isPublished: r.is_published === 1,
      isLocked: r.is_locked === 1,
      path: t.paths.get(r.id) ?? r.slug,
    };
  }

  async revisions(v: RequestViewer, pageId: number): Promise<WikiRevisionItem[]> {
    this.assertView(v);
    const page = await this.db.q.selectFrom('wiki_pages').select(['is_published']).where('id', '=', pageId).executeTakeFirst();
    if (!page || (page.is_published !== 1 && !this.canEdit(v))) throw Errors.notFound('Wiki sayfası bulunamadı.');
    const rows = await this.db.q
      .selectFrom('wiki_revisions')
      .select(['id', 'title', 'note', 'user_id', 'created_at', (eb) => eb.fn('length', ['body']).as('size')])
      .where('page_id', '=', pageId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(100)
      .execute();
    const people = await this.users.summaries(rows.map((r) => r.user_id ?? 0));
    return rows.map((r) => ({ id: r.id, title: r.title, note: r.note, user: r.user_id ? (people.get(r.user_id) ?? null) : null, createdAt: r.created_at, size: Number(r.size ?? 0) }));
  }

  async revision(v: RequestViewer, pageId: number, revId: number): Promise<WikiRevisionDetail> {
    await this.revisions(v, pageId);
    const r = await this.db.q.selectFrom('wiki_revisions').selectAll().where('id', '=', revId).where('page_id', '=', pageId).executeTakeFirst();
    if (!r) throw Errors.notFound('Sürüm bulunamadı.');
    const people = await this.users.summaries([r.user_id ?? 0]);
    return {
      id: r.id,
      title: r.title,
      note: r.note,
      user: r.user_id ? (people.get(r.user_id) ?? null) : null,
      createdAt: r.created_at,
      size: r.body.length,
      body: this.canEdit(v) ? r.body : '',
      html: this.render.post(r.body).html,
    };
  }

  async uploadImage(v: RequestViewer, file: UploadedImage): Promise<{ url: string; width: number; height: number }> {
    if (!this.canEdit(v)) throw Errors.forbidden('Wiki düzenleme yetkiniz yok.');
    const saved = await this.storage.saveImage(file.buffer, { purpose: 'wiki_image', ownerUserId: v.user!.id, maxBytes: 8 * 1024 * 1024, maxDimension: 4000 });
    return { url: this.storage.publicUrl(saved)!, width: saved.width ?? 0, height: saved.height ?? 0 };
  }

  async search(v: RequestViewer, q: string): Promise<Array<WikiLink & { summary: string | null }>> {
    this.assertView(v);
    const term = q.trim().toLocaleLowerCase('tr-TR');
    if (term.length < 2) return [];
    const t = await this.tree();
    const like = `%${term.replace(/[%_]/g, '')}%`;
    const rows = await this.db.q
      .selectFrom('wiki_pages')
      .select('id')
      .where((eb) => eb.or([eb(eb.fn('lower', ['title']), 'like', like), eb(eb.fn('lower', ['body']), 'like', like)]))
      .limit(40)
      .execute();
    return rows
      .map((r) => t.byId.get(r.id))
      .filter((r): r is PageMeta => !!r && this.visible(r, v) && t.paths.has(r.id))
      .slice(0, 20)
      .map((r) => ({ ...this.link(t, r), summary: r.summary }));
  }
}
