import { Injectable } from '@nestjs/common';
import {
  TICKET_STATUS_LABELS,
  type AdminTicketCategory,
  type TicketCategory,
  type TicketCategoryInput,
  type TicketCreateInput,
  type TicketDesk,
  type TicketDetail,
  type TicketItem,
  type TicketReplyInput,
  type TicketStatus,
  type TicketUpdateInput,
  type UserSummary,
} from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PostRenderService } from '../forum/post-render.service.js';
import { iconNode } from '../common/icons.js';
import { StorageService } from '../storage/storage.service.js';
import type { UploadedImage } from '../common/upload.js';
import { can, type RequestViewer } from '../common/request-context.js';

type CatRow = Row<'ticket_categories'>;
type TicketRow = Row<'tickets'>;
const ACTIVE: TicketStatus[] = ['open', 'answered', 'customer_reply', 'on_hold'];

const ids = (json: string): number[] => {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
};

/** Eklenti ilk açıldığında oluşturulan kategoriler */
const DEFAULT_CATEGORIES: Array<{ name: string; description: string; icon: string; color: string; priority: 'normal' | 'high' }> = [
  { name: 'Genel destek', description: 'Forum ya da topluluk hakkında her türlü soru.', icon: 'lifebuoy', color: '#3b82f6', priority: 'normal' },
  { name: 'Hesap sorunları', description: 'Giriş, şifre, e-posta ve hesap ayarları.', icon: 'user-circle', color: '#8b5cf6', priority: 'normal' },
  { name: 'Şikayet', description: 'Bir üye ya da içerik hakkında şikayet.', icon: 'warning-octagon', color: '#ef4444', priority: 'high' },
  { name: 'Hata bildirimi', description: 'Sitede karşılaştığın hatalar.', icon: 'bug', color: '#f59e0b', priority: 'normal' },
];

@Injectable()
export class TicketsService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly groupCache: GroupCacheService,
    private readonly notifications: NotificationsService,
    private readonly render: PostRenderService,
    private readonly storage: StorageService,
  ) {}

  async uploadImage(v: RequestViewer, file: UploadedImage): Promise<{ url: string }> {
    if (!can(v, 'tickets.create')) throw Errors.forbidden();
    const saved = await this.storage.saveImage(file.buffer, { purpose: 'post_image', ownerUserId: v.user!.id, maxBytes: 8 * 1024 * 1024, maxDimension: 6000 });
    return { url: this.storage.publicUrl(saved)! };
  }

  // ---------- Kategoriler ----------

  /** Varsayılan kategoriler (yöneticiler ve genel moderatörler sorumlu) — yalnızca bir kez */
  async ensureDefaults(actorId: number | null = null): Promise<void> {
    if (this.settings.get('tickets.seeded')) return;
    const any = await this.db.q.selectFrom('ticket_categories').select('id').executeTakeFirst();
    if (!any) {
      const groups = await this.groupCache.all();
      const handlers = groups.filter((g) => g.system_key === 'admin' || g.system_key === 'global_moderator').map((g) => g.id);
      const now = this.clock.now();
      await this.db.q
        .insertInto('ticket_categories')
        .values(
          DEFAULT_CATEGORIES.map((c, i) => ({
            name: c.name,
            description: c.description,
            icon: c.icon,
            color: c.color,
            handler_group_ids_json: JSON.stringify(handlers),
            sort_order: i,
            default_priority: c.priority,
            created_at: now,
            updated_at: now,
          })),
        )
        .execute();
    }
    await this.settings.update({ 'tickets.seeded': true }, actorId, { allowHidden: true });
  }

  private async catRows(): Promise<CatRow[]> {
    await this.ensureDefaults();
    return this.db.q.selectFrom('ticket_categories').selectAll().orderBy('sort_order').orderBy('id').execute();
  }

  private isStaff(v: RequestViewer, cat: CatRow | undefined): boolean {
    if (!v.user || !cat) return false;
    if (can(v, 'admin.tickets')) return true;
    const handlers = ids(cat.handler_group_ids_json);
    return v.groupIds.some((g) => handlers.includes(g));
  }

  /** Görevli olunan kategoriler */
  private staffCategories(v: RequestViewer, cats: CatRow[]): number[] {
    return cats.filter((c) => this.isStaff(v, c)).map((c) => c.id);
  }

  async categories(): Promise<TicketCategory[]> {
    return (await this.catRows())
      .filter((c) => c.is_active === 1)
      .map((c) => ({ id: c.id, name: c.name, description: c.description, icon: c.icon, iconNodes: iconNode(c.icon), color: c.color, defaultPriority: c.default_priority, introHtml: c.intro_html }));
  }

  async adminCategories(): Promise<AdminTicketCategory[]> {
    const [rows, counts] = await Promise.all([
      this.catRows(),
      this.db.q
        .selectFrom('tickets')
        .select(['category_id', (eb) => eb.fn.countAll<number>().as('total'), (eb) => eb.fn.sum<number>(eb.case().when('status', '!=', 'closed').then(1).else(0).end()).as('open')])
        .groupBy('category_id')
        .execute(),
    ]);
    const map = new Map(counts.map((c) => [c.category_id, c]));
    const people = await this.users.summaries(rows.map((c) => c.auto_assign_user_id ?? 0));
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      icon: c.icon,
      color: c.color,
      handlerGroupIds: ids(c.handler_group_ids_json),
      isActive: c.is_active === 1,
      sortOrder: c.sort_order,
      defaultPriority: c.default_priority,
      intro: c.intro,
      autoAssign: c.auto_assign,
      autoAssignUserId: c.auto_assign_user_id,
      autoAssignUser: people.get(c.auto_assign_user_id ?? 0) ?? null,
      autoAssignOnline: c.auto_assign_online === 1,
      openCount: Number(map.get(c.id)?.open ?? 0),
      totalCount: Number(map.get(c.id)?.total ?? 0),
    }));
  }

  /** Seçili sorumlu gruplardaki yetkililer (otomatik atama için seçim listesi) */
  async handlerCandidates(groups: number[]): Promise<UserSummary[]> {
    const people = await this.users.summaries(await this.groupUserIds(groups));
    return [...people.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, 'tr'));
  }

  async saveCategory(v: RequestViewer, id: number | null, input: TicketCategoryInput): Promise<void> {
    const known = new Set((await this.groupCache.all()).map((g) => g.id));
    if (input.handlerGroupIds.some((g) => !known.has(g))) throw Errors.badRequest('Bilinmeyen grup seçildi.');
    if (input.autoAssign === 'fixed' && !(await this.groupUserIds(input.handlerGroupIds)).includes(input.autoAssignUserId!))
      throw Errors.validation({ autoAssignUserId: 'Seçilen kişi bu kategorinin sorumlu gruplarında değil.' });
    const now = this.clock.now();
    const values = {
      name: input.name,
      description: input.description,
      icon: input.icon,
      color: input.color,
      handler_group_ids_json: JSON.stringify(input.handlerGroupIds),
      is_active: input.isActive ? 1 : 0,
      sort_order: input.sortOrder,
      default_priority: input.defaultPriority,
      intro: input.intro,
      intro_html: this.render.post(input.intro).html,
      auto_assign: input.autoAssign,
      auto_assign_user_id: input.autoAssign === 'fixed' ? input.autoAssignUserId : null,
      auto_assign_online: input.autoAssignOnline ? 1 : 0,
      updated_at: now,
    };
    if (id) {
      const r = await this.db.q.updateTable('ticket_categories').set(values).where('id', '=', id).executeTakeFirst();
      if (!Number(r.numUpdatedRows)) throw Errors.notFound('Kategori bulunamadı.');
    } else await this.db.q.insertInto('ticket_categories').values({ ...values, created_at: now }).execute();
    await this.audit.log({ type: 'admin', action: id ? 'ticket.category.update' : 'ticket.category.create', actorId: v.user!.id, ip: v.ip, data: { id, name: input.name } });
  }

  async deleteCategory(v: RequestViewer, id: number): Promise<void> {
    const used = await this.db.q.selectFrom('tickets').select('id').where('category_id', '=', id).executeTakeFirst();
    if (used) throw Errors.conflict('Bu kategoride talepler var; silmek yerine pasif yapın.');
    await this.db.q.deleteFrom('ticket_categories').where('id', '=', id).execute();
    await this.audit.log({ type: 'admin', action: 'ticket.category.delete', actorId: v.user!.id, ip: v.ip, data: { id } });
  }

  // ---------- Talepler ----------

  private async items(rows: TicketRow[], cats?: CatRow[]): Promise<TicketItem[]> {
    const catMap = new Map((cats ?? (await this.catRows())).map((c) => [c.id, c]));
    const people = await this.users.summaries(rows.flatMap((r) => [r.user_id, r.assignee_id ?? 0]));
    return rows.map((r) => {
      const c = catMap.get(r.category_id);
      return {
        id: r.id,
        subject: r.subject,
        category: { id: r.category_id, name: c?.name ?? 'Silinmiş', color: c?.color ?? null, iconNodes: iconNode(c?.icon ?? null) },
        user: people.get(r.user_id) ?? null,
        status: r.status,
        priority: r.priority,
        assignee: r.assignee_id ? (people.get(r.assignee_id) ?? null) : null,
        messageCount: r.message_count,
        lastReplyAt: r.last_reply_at,
        lastReplyByStaff: r.last_reply_by_staff === 1,
        createdAt: r.created_at,
        closedAt: r.closed_at,
      };
    });
  }

  async mine(v: RequestViewer): Promise<TicketItem[]> {
    const rows = await this.db.q.selectFrom('tickets').selectAll().where('user_id', '=', v.user!.id).orderBy('last_reply_at', 'desc').limit(200).execute();
    return this.items(rows);
  }

  /** Destek masası: görevli olunan kategorilerdeki talepler */
  async desk(v: RequestViewer, q: { status?: string; categoryId?: number; page: number }): Promise<TicketDesk> {
    const cats = await this.catRows();
    const allowed = this.staffCategories(v, cats);
    if (!allowed.length) throw Errors.forbidden('Sorumlu olduğunuz bir destek kategorisi yok.');
    const catIds = q.categoryId ? allowed.filter((c) => c === q.categoryId) : allowed;
    const perPage = 30;
    let base = this.db.q.selectFrom('tickets').where('category_id', 'in', catIds.length ? catIds : [0]);
    if (q.status === 'active' || !q.status) base = base.where('status', 'in', ACTIVE);
    else if (q.status === 'mine') base = base.where('assignee_id', '=', v.user!.id).where('status', 'in', ACTIVE);
    else if (q.status === 'unassigned') base = base.where('assignee_id', 'is', null).where('status', 'in', ACTIVE);
    else if (q.status !== 'all') base = base.where('status', '=', q.status as TicketStatus);
    const [rows, total, statusCounts, mine, unassigned] = await Promise.all([
      // Önce acil olanlar ve en uzun süredir bekleyenler
      base
        .selectAll()
        .orderBy((eb) => eb.case().when('priority', '=', 'urgent').then(0).when('priority', '=', 'high').then(1).when('priority', '=', 'normal').then(2).else(3).end())
        .orderBy('last_reply_at', q.status === 'closed' ? 'desc' : 'asc')
        .limit(perPage)
        .offset((q.page - 1) * perPage)
        .execute(),
      base.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
      this.db.q.selectFrom('tickets').select(['status', (eb) => eb.fn.countAll<number>().as('n')]).where('category_id', 'in', allowed).groupBy('status').execute(),
      this.db.q.selectFrom('tickets').select((eb) => eb.fn.countAll<number>().as('n')).where('category_id', 'in', allowed).where('assignee_id', '=', v.user!.id).where('status', 'in', ACTIVE).executeTakeFirst(),
      this.db.q.selectFrom('tickets').select((eb) => eb.fn.countAll<number>().as('n')).where('category_id', 'in', allowed).where('assignee_id', 'is', null).where('status', 'in', ACTIVE).executeTakeFirst(),
    ]);
    const counts = { open: 0, answered: 0, customer_reply: 0, on_hold: 0, closed: 0, mine: Number(mine?.n ?? 0), unassigned: Number(unassigned?.n ?? 0) };
    for (const s of statusCounts) counts[s.status] = Number(s.n);
    const openPerCat = await this.db.q.selectFrom('tickets').select(['category_id', (eb) => eb.fn.countAll<number>().as('n')]).where('category_id', 'in', allowed).where('status', 'in', ACTIVE).groupBy('category_id').execute();
    const openMap = new Map(openPerCat.map((o) => [o.category_id, Number(o.n)]));
    return {
      items: await this.items(rows, cats),
      total: Number(total?.n ?? 0),
      page: q.page,
      perPage,
      counts,
      categories: cats.filter((c) => allowed.includes(c.id)).map((c) => ({ id: c.id, name: c.name, open: openMap.get(c.id) ?? 0 })),
    };
  }

  async create(v: RequestViewer, input: TicketCreateInput): Promise<{ id: number }> {
    if (!can(v, 'tickets.create')) throw Errors.forbidden('Destek talebi açma yetkiniz yok.');
    const cat = (await this.catRows()).find((c) => c.id === input.categoryId && c.is_active === 1);
    if (!cat) throw Errors.field('categoryId', 'Geçerli bir kategori seçin.');
    const open = await this.db.q.selectFrom('tickets').select((eb) => eb.fn.countAll<number>().as('n')).where('user_id', '=', v.user!.id).where('status', 'in', ACTIVE).executeTakeFirst();
    const max = this.settings.get('tickets.maxOpenPerUser');
    if (Number(open?.n ?? 0) >= max) throw Errors.forbidden(`En fazla ${max} açık talebiniz olabilir; önce mevcut taleplerin kapanmasını bekleyin.`);
    // Üyeler acil öncelik seçemez (yetkililer değiştirebilir)
    const priority = input.priority === 'urgent' ? 'high' : input.priority;
    const now = this.clock.now();
    const assignee = await this.pickAssignee(cat, v.user!.id);
    const id = await this.db.tx(async () => {
      const t = await this.db.q
        .insertInto('tickets')
        .values({ category_id: cat.id, user_id: v.user!.id, subject: input.subject, status: 'open', priority, assignee_id: assignee, message_count: 1, last_reply_at: now, created_at: now, updated_at: now })
        .returning('id')
        .executeTakeFirstOrThrow();
      await this.db.q.insertInto('ticket_messages').values({ ticket_id: t.id, user_id: v.user!.id, body: input.body, body_html: this.render.post(input.body).html, created_at: now }).execute();
      return t.id;
    });
    // Otomatik atandıysa yalnızca sorumlu yetkili, değilse kategorinin tüm yetkilileri bildirim alır
    await this.notifyHandlers(cat, assignee, { ticketId: id, subject: input.subject, actorName: v.user!.display_name }, v.user!.id, 'ticket.new');
    if (assignee) await this.audit.log({ type: 'moderation', action: 'ticket.auto_assign', actorId: null, data: { id, assigneeId: assignee, mode: cat.auto_assign } });
    return { id };
  }

  /**
   * Otomatik atama: kategorinin yetkilileri arasından (talebi açan hariç) sırayla, en az açık talebi
   * olana ya da sabit kişiye. "Önce çevrimiçi" açıksa son 15 dakikada aktif olanlar tercih edilir.
   */
  private async pickAssignee(cat: CatRow, requesterId: number): Promise<number | null> {
    if (cat.auto_assign === 'none') return null;
    let pool = (await this.handlerUserIds(cat)).filter((id) => id !== requesterId);
    if (cat.auto_assign === 'fixed') return cat.auto_assign_user_id && pool.includes(cat.auto_assign_user_id) ? cat.auto_assign_user_id : null;
    if (!pool.length) return null;
    const users = await this.db.q.selectFrom('users').select(['id', 'last_active_at']).where('id', 'in', pool).where('status', '=', 'active').execute();
    pool = users.map((u) => u.id).sort((a, b) => a - b);
    if (cat.auto_assign_online) {
      const since = this.clock.now() - 15 * 60_000;
      const online = users.filter((u) => (u.last_active_at ?? 0) >= since).map((u) => u.id).sort((a, b) => a - b);
      if (online.length) pool = online;
    }
    if (!pool.length) return null;
    if (cat.auto_assign === 'least_open') {
      const counts = await this.db.q
        .selectFrom('tickets')
        .select(['assignee_id', (eb) => eb.fn.countAll<number>().as('n')])
        .where('assignee_id', 'in', pool)
        .where('status', 'in', ACTIVE)
        .groupBy('assignee_id')
        .execute();
      const load = new Map(counts.map((c) => [c.assignee_id!, Number(c.n)]));
      return [...pool].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0) || a - b)[0]!;
    }
    // Sırayla: bu kategoride en son atanan yetkiliden sonraki
    const last = await this.db.q.selectFrom('tickets').select('assignee_id').where('category_id', '=', cat.id).where('assignee_id', 'is not', null).orderBy('id', 'desc').limit(1).executeTakeFirst();
    const next = pool.find((id) => id > (last?.assignee_id ?? 0));
    return next ?? pool[0]!;
  }

  private handlerUserIds(cat: CatRow): Promise<number[]> {
    return this.groupUserIds(ids(cat.handler_group_ids_json));
  }

  /** Verilen grupların (boşsa yönetici grubunun) etkin üyeleri */
  private async groupUserIds(groups: number[]): Promise<number[]> {
    let groupIds = groups;
    if (!groupIds.length) groupIds = (await this.groupCache.all()).filter((g) => g.system_key === 'admin').map((g) => g.id);
    if (!groupIds.length) return [];
    const now = this.clock.now();
    const rows = await this.db.q
      .selectFrom('users')
      .leftJoin('group_members as gm', 'gm.user_id', 'users.id')
      .select('users.id')
      .distinct()
      .where('users.deleted_at', 'is', null)
      .where((eb) =>
        eb.or([
          eb('users.primary_group_id', 'in', groupIds),
          eb.and([eb('gm.group_id', 'in', groupIds), eb.or([eb('gm.expires_at', 'is', null), eb('gm.expires_at', '>', now)])]),
        ]),
      )
      .limit(100)
      .execute();
    return rows.map((r) => r.id);
  }

  /** Atanmış yetkili varsa ona, yoksa kategorinin sorumlularına */
  private async notifyHandlers(cat: CatRow, assigneeId: number | null, data: Record<string, unknown>, actorId: number, type: 'ticket.new' | 'ticket.reply'): Promise<void> {
    const targets = assigneeId ? [assigneeId] : await this.handlerUserIds(cat);
    for (const id of targets) if (id !== actorId) await this.notifications.notify(id, type, data, actorId);
  }

  private async load(v: RequestViewer, id: number): Promise<{ t: TicketRow; cat: CatRow | undefined; staff: boolean; cats: CatRow[] }> {
    const t = await this.db.q.selectFrom('tickets').selectAll().where('id', '=', id).executeTakeFirst();
    if (!t) throw Errors.notFound('Destek talebi bulunamadı.');
    const cats = await this.catRows();
    const cat = cats.find((c) => c.id === t.category_id);
    const staff = this.isStaff(v, cat);
    if (!staff && t.user_id !== v.user?.id) throw Errors.notFound('Destek talebi bulunamadı.');
    return { t, cat, staff, cats };
  }

  async detail(v: RequestViewer, id: number): Promise<TicketDetail> {
    const { t, cat, staff, cats } = await this.load(v, id);
    const [item] = await this.items([t], cats);
    let q = this.db.q.selectFrom('ticket_messages').selectAll().where('ticket_id', '=', id);
    if (!staff) q = q.where('is_internal', '=', 0);
    const msgs = await q.orderBy('created_at').orderBy('id').execute();
    const people = await this.users.summaries(msgs.map((m) => m.user_id ?? 0));
    let staffList: UserSummary[] = [];
    if (staff && cat) {
      const uids = await this.handlerUserIds(cat);
      const s = await this.users.summaries(uids.slice(0, 60));
      staffList = [...s.values()];
    }
    const closed = t.status === 'closed';
    const own = t.user_id === v.user?.id;
    return {
      ...item!,
      messages: msgs.map((m) => ({ id: m.id, user: m.user_id ? (people.get(m.user_id) ?? null) : null, html: m.body_html, isInternal: m.is_internal === 1, isStaff: m.is_staff === 1, createdAt: m.created_at })),
      canManage: staff,
      canReply: staff || (own && !closed),
      canClose: !closed && (staff || (own && this.settings.get('tickets.allowUserClose'))),
      canReopen: closed && (staff || own),
      staff: staffList,
      categories: staff ? cats.filter((c) => c.is_active === 1).map((c) => ({ id: c.id, name: c.name })) : [],
    };
  }

  async reply(v: RequestViewer, id: number, input: TicketReplyInput): Promise<void> {
    const { t, cat, staff } = await this.load(v, id);
    const own = t.user_id === v.user!.id;
    if (!staff && (!own || t.status === 'closed')) throw Errors.forbidden('Bu talebe yanıt yazamazsınız.');
    const internal = staff && input.internal;
    const now = this.clock.now();
    // Durum: yetkili yanıtı → "Yanıtlandı", üye yanıtı → "Yanıt bekliyor"; yetkili isterse başka durum seçebilir
    const byStaff = staff && !own;
    const nextStatus: TicketStatus = internal ? t.status : staff && input.status ? input.status : byStaff ? 'answered' : 'customer_reply';
    await this.db.tx(async () => {
      await this.db.q
        .insertInto('ticket_messages')
        .values({ ticket_id: id, user_id: v.user!.id, body: input.body, body_html: this.render.post(input.body).html, is_internal: internal ? 1 : 0, is_staff: byStaff ? 1 : 0, created_at: now })
        .execute();
      await this.db.q
        .updateTable('tickets')
        .set((eb) => ({
          message_count: eb('message_count', '+', 1),
          updated_at: now,
          ...(internal ? {} : { last_reply_at: now, last_reply_by_staff: byStaff ? 1 : 0, status: nextStatus, closed_at: nextStatus === 'closed' ? now : null }),
          // Yanıtlayan yetkili, atanmamış talebi üstlenir
          ...(byStaff && !t.assignee_id && !internal ? { assignee_id: v.user!.id } : {}),
        }))
        .where('id', '=', id)
        .execute();
    });
    if (internal) return;
    if (byStaff) await this.notifications.notify(t.user_id, 'ticket.reply', { ticketId: id, subject: t.subject }, v.user!.id);
    else if (cat) await this.notifyHandlers(cat, t.assignee_id, { ticketId: id, subject: t.subject, actorName: v.user!.display_name }, v.user!.id, 'ticket.reply');
  }

  async update(v: RequestViewer, id: number, input: TicketUpdateInput): Promise<void> {
    const { t, staff, cats } = await this.load(v, id);
    const own = t.user_id === v.user!.id;
    // Üye yalnızca kendi talebini kapatıp yeniden açabilir
    if (!staff) {
      const keys = Object.keys(input).filter((k) => input[k as keyof TicketUpdateInput] !== undefined);
      const closing = input.status === 'closed' && this.settings.get('tickets.allowUserClose') && t.status !== 'closed';
      const reopening = input.status === 'open' && t.status === 'closed';
      if (!own || keys.length !== 1 || !(closing || reopening)) throw Errors.forbidden();
    }
    if (input.categoryId && !cats.some((c) => c.id === input.categoryId)) throw Errors.field('categoryId', 'Geçersiz kategori.');
    if (input.assigneeId) {
      const cat = cats.find((c) => c.id === (input.categoryId ?? t.category_id));
      const allowed = cat ? await this.handlerUserIds(cat) : [];
      if (!allowed.includes(input.assigneeId)) throw Errors.field('assigneeId', 'Bu yetkili kategoriden sorumlu değil.');
    }
    const now = this.clock.now();
    await this.db.q
      .updateTable('tickets')
      .set({
        ...(input.status ? { status: input.status, closed_at: input.status === 'closed' ? now : null } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.assigneeId !== undefined ? { assignee_id: input.assigneeId } : {}),
        ...(input.categoryId ? { category_id: input.categoryId } : {}),
        updated_at: now,
      })
      .where('id', '=', id)
      .execute();
    if (input.status && input.status !== t.status && staff && !own) {
      await this.notifications.notify(t.user_id, 'ticket.status', { ticketId: id, subject: t.subject, status: input.status, statusLabel: TICKET_STATUS_LABELS[input.status] }, v.user!.id);
    }
    if (staff) await this.audit.log({ type: 'moderation', action: 'ticket.update', actorId: v.user!.id, ip: v.ip, data: { id, ...input } });
  }

  /** Menü rozeti: yetkililer için yanıt bekleyen, üyeler için yanıtlanmış talepler */
  async counts(v: RequestViewer): Promise<{ desk: number | null; mine: number }> {
    const cats = await this.catRows();
    const allowed = this.staffCategories(v, cats);
    const [desk, mine] = await Promise.all([
      allowed.length
        ? this.db.q.selectFrom('tickets').select((eb) => eb.fn.countAll<number>().as('n')).where('category_id', 'in', allowed).where('status', 'in', ['open', 'customer_reply']).executeTakeFirst()
        : undefined,
      this.db.q.selectFrom('tickets').select((eb) => eb.fn.countAll<number>().as('n')).where('user_id', '=', v.user!.id).where('status', '=', 'answered').executeTakeFirst(),
    ]);
    return { desk: desk ? Number(desk.n) : null, mine: Number(mine?.n ?? 0) };
  }
}
