import { Injectable } from '@nestjs/common';
import {
  applicationQuestionSchema,
  applicationRequirementsSchema,
  type AdminApplicationForm,
  type ApplicationDetail,
  type ApplicationFormInput,
  type ApplicationFormSummary,
  type ApplicationFormView,
  type ApplicationItem,
  type ApplicationQuestion,
  type ApplicationRequirements,
  type ApplicationStatus,
  type Eligibility,
  type EligibilityCheck,
  type Paginated,
} from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock, DAY } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { GroupsService } from '../groups/groups.service.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PostRenderService } from '../forum/post-render.service.js';
import { iconNode } from '../common/icons.js';
import { BansService } from '../bans/bans.service.js';
import { can, type RequestViewer } from '../common/request-context.js';

type FormRow = Row<'application_forms'>;
type AppRow = Row<'applications'>;
type Answer = string | string[] | number | boolean | null;
const OPEN_STATUSES: ApplicationStatus[] = ['pending', 'reviewing'];

function parseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function plain(text: string, max = 180): string {
  const t = text.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly groups: GroupsService,
    private readonly groupCache: GroupCacheService,
    private readonly notifications: NotificationsService,
    private readonly render: PostRenderService,
    private readonly bans: BansService,
  ) {}

  private questions(r: FormRow): ApplicationQuestion[] {
    const list = parseJson<unknown[]>(r.questions_json, []);
    return list.flatMap((q) => {
      const p = applicationQuestionSchema.safeParse(q);
      return p.success ? [p.data] : [];
    });
  }

  private requirements(r: FormRow): ApplicationRequirements {
    const p = applicationRequirementsSchema.safeParse(parseJson(r.requirements_json, {}));
    return p.success ? p.data : applicationRequirementsSchema.parse({});
  }

  private reviewerGroups(r: FormRow): number[] {
    return parseJson<number[]>(r.reviewer_group_ids_json, []).filter((n) => Number.isInteger(n));
  }

  canReview(v: RequestViewer, form: FormRow): boolean {
    if (!v.user) return false;
    if (can(v, 'admin.applications')) return true;
    const groups = this.reviewerGroups(form);
    return v.groupIds.some((g) => groups.includes(g));
  }

  private async targetGroup(id: number | null) {
    if (!id) return null;
    const g = (await this.groupCache.all()).find((x) => x.id === id);
    return g ? { id: g.id, name: g.name, color: g.color } : null;
  }

  private async form(slugOrId: string | number): Promise<FormRow> {
    const q = this.db.q.selectFrom('application_forms').selectAll();
    const r = await (typeof slugOrId === 'number' ? q.where('id', '=', slugOrId) : q.where('slug', '=', slugOrId.toLowerCase())).executeTakeFirst();
    if (!r) throw Errors.notFound('Başvuru formu bulunamadı.');
    return r;
  }

  async eligibility(v: RequestViewer, form: FormRow): Promise<Eligibility> {
    const req = this.requirements(form);
    if (!v.user) return { ok: false, checks: [], blocker: 'Başvuru yapmak için giriş yapmalısınız.' };
    const u = v.user;
    const now = this.clock.now();
    const checks: EligibilityCheck[] = [];
    if (req.emailVerified) checks.push({ key: 'email', label: 'E-posta adresi doğrulanmış', ok: u.email_verified_at != null });
    if (req.minAccountDays > 0) {
      const days = Math.floor((now - u.registered_at) / DAY);
      checks.push({ key: 'age', label: `En az ${req.minAccountDays} günlük üyelik`, ok: days >= req.minAccountDays, detail: `${days} gün` });
    }
    if (req.minPosts > 0) checks.push({ key: 'posts', label: `En az ${req.minPosts} mesaj`, ok: u.post_count >= req.minPosts, detail: `${u.post_count} mesaj` });
    if (req.maxWarningPoints !== null) checks.push({ key: 'warnings', label: `En fazla ${req.maxWarningPoints} uyarı puanı`, ok: u.warning_points <= req.maxWarningPoints, detail: `${u.warning_points} puan` });
    if (req.requiredGroupIds.length) {
      const names = (await this.groupCache.all()).filter((g) => req.requiredGroupIds.includes(g.id)).map((g) => g.name);
      checks.push({ key: 'groups', label: `Şu gruplardan birinde olmak: ${names.join(', ')}`, ok: v.groupIds.some((g) => req.requiredGroupIds.includes(g)) });
    }
    if (req.blockedGroupIds.length && v.groupIds.some((g) => req.blockedGroupIds.includes(g))) {
      checks.push({ key: 'blocked', label: 'Bu forma başvuramayan bir gruptasınız', ok: false });
    }
    if (form.target_group_id && v.groupIds.includes(form.target_group_id)) checks.push({ key: 'member', label: 'Zaten bu gruptasınız', ok: false });

    let blocker: string | null = null;
    if (form.is_open !== 1) blocker = 'Bu form şu an başvuruya kapalı.';
    else if ((await this.bans.activeFor({ userId: u.id, ip: v.ip }))?.cannotPost) blocker = 'Hesabınız kısıtlı olduğu için başvuru yapamazsınız.';
    else {
      const last = await this.db.q
        .selectFrom('applications')
        .select(['status', 'decided_at'])
        .where('form_id', '=', form.id)
        .where('user_id', '=', u.id)
        .orderBy('id', 'desc')
        .executeTakeFirst();
      if (last && OPEN_STATUSES.includes(last.status)) blocker = 'Bu forma ait bekleyen bir başvurunuz var.';
      else if (last?.status === 'rejected' && last.decided_at && req.cooldownDays > 0) {
        const until = last.decided_at + req.cooldownDays * DAY;
        if (until > now) blocker = `Başvurunuz reddedildi; ${Math.ceil((until - now) / DAY)} gün sonra yeniden başvurabilirsiniz.`;
      }
    }
    return { ok: !blocker && checks.every((c) => c.ok), checks, blocker };
  }

  private async summary(v: RequestViewer, r: FormRow, withEligibility: boolean): Promise<ApplicationFormSummary> {
    const [latest, pending] = await Promise.all([
      v.user
        ? this.db.q.selectFrom('applications').select(['id', 'status', 'created_at']).where('form_id', '=', r.id).where('user_id', '=', v.user.id).orderBy('id', 'desc').executeTakeFirst()
        : undefined,
      this.canReview(v, r)
        ? this.db.q.selectFrom('applications').select((eb) => eb.fn.countAll<number>().as('n')).where('form_id', '=', r.id).where('status', 'in', OPEN_STATUSES).executeTakeFirst()
        : undefined,
    ]);
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      icon: r.icon,
      iconNodes: iconNode(r.icon),
      excerpt: plain(r.description),
      isOpen: r.is_open === 1,
      questionCount: this.questions(r).length,
      targetGroup: await this.targetGroup(r.target_group_id),
      eligibility: withEligibility && v.user ? await this.eligibility(v, r) : null,
      myLatest: latest ? { id: latest.id, status: latest.status, createdAt: latest.created_at } : null,
      pendingCount: pending ? Number(pending.n) : null,
    };
  }

  async list(v: RequestViewer): Promise<ApplicationFormSummary[]> {
    const rows = await this.db.q.selectFrom('application_forms').selectAll().orderBy('sort_order').orderBy('id').execute();
    const out: ApplicationFormSummary[] = [];
    for (const r of rows) {
      const s = await this.summary(v, r, true);
      if (r.is_open === 1 || s.pendingCount !== null || s.myLatest) out.push(s);
    }
    return out;
  }

  async view(v: RequestViewer, slug: string): Promise<ApplicationFormView> {
    const r = await this.form(slug);
    const s = await this.summary(v, r, true);
    if (r.is_open !== 1 && s.pendingCount === null && !s.myLatest) throw Errors.notFound('Başvuru formu bulunamadı.');
    return { ...s, descriptionHtml: r.description_html, questions: this.questions(r), requirements: this.requirements(r), canReview: this.canReview(v, r) };
  }

  private validateAnswers(questions: ApplicationQuestion[], raw: Record<string, Answer>): Record<string, Answer> {
    const fields: Record<string, string> = {};
    const out: Record<string, Answer> = {};
    for (const q of questions) {
      const key = `answers.${q.id}`;
      const v = raw[q.id];
      const empty = v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
      if (empty) {
        if (q.required && q.type !== 'yesno') fields[key] = 'Bu soru zorunlu.';
        else if (q.required && q.type === 'yesno') fields[key] = 'Lütfen bir seçim yapın.';
        out[q.id] = null;
        continue;
      }
      switch (q.type) {
        case 'text':
        case 'textarea':
        case 'url': {
          if (typeof v !== 'string') {
            fields[key] = 'Geçersiz yanıt.';
            break;
          }
          const t = v.trim();
          if (t.length < q.minLength) fields[key] = `En az ${q.minLength} karakter yazın.`;
          else if (t.length > q.maxLength) fields[key] = `En fazla ${q.maxLength} karakter yazabilirsiniz.`;
          else if (q.type === 'url' && !/^https?:\/\/[^\s]+$/i.test(t)) fields[key] = 'Bağlantı http(s):// ile başlamalı.';
          else out[q.id] = t;
          break;
        }
        case 'number': {
          const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
          if (!Number.isFinite(n)) fields[key] = 'Bir sayı girin.';
          else out[q.id] = n;
          break;
        }
        case 'select':
        case 'radio':
          if (typeof v !== 'string' || !q.options.includes(v)) fields[key] = 'Listeden bir seçenek seçin.';
          else out[q.id] = v;
          break;
        case 'checkboxes':
          if (!Array.isArray(v) || v.some((x) => !q.options.includes(x))) fields[key] = 'Geçersiz seçim.';
          else out[q.id] = [...new Set(v)];
          break;
        case 'yesno':
          if (typeof v !== 'boolean') fields[key] = 'Evet ya da hayır seçin.';
          else out[q.id] = v;
          break;
      }
    }
    if (Object.keys(fields).length) throw Errors.validation(fields);
    return out;
  }

  async submit(v: RequestViewer, slug: string, answers: Record<string, Answer>): Promise<{ id: number }> {
    if (!can(v, 'applications.apply')) throw Errors.forbidden('Başvuru yapma yetkiniz yok.');
    const form = await this.form(slug);
    const el = await this.eligibility(v, form);
    if (el.blocker) throw Errors.forbidden(el.blocker);
    const failed = el.checks.find((c) => !c.ok);
    if (failed) throw Errors.forbidden(`Gereksinim karşılanmıyor: ${failed.label}.`);
    const clean = this.validateAnswers(this.questions(form), answers);
    const now = this.clock.now();
    const row = await this.db.q
      .insertInto('applications')
      .values({ form_id: form.id, user_id: v.user!.id, status: 'pending', answers_json: JSON.stringify(clean), created_at: now, updated_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.notifyReviewers(form, { applicationId: row.id, formTitle: form.title, actorName: v.user!.display_name }, v.user!.id);
    return { id: row.id };
  }

  private async notifyReviewers(form: FormRow, data: Record<string, unknown>, actorId: number): Promise<void> {
    let groupIds = this.reviewerGroups(form);
    if (!groupIds.length) {
      const admin = (await this.groupCache.all()).find((g) => g.system_key === 'admin');
      groupIds = admin ? [admin.id] : [];
    }
    if (!groupIds.length) return;
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
    for (const r of rows) if (r.id !== actorId) await this.notifications.notify(r.id, 'application.new', { ...data, formSlug: form.slug }, actorId);
  }

  private async items(rows: AppRow[]): Promise<ApplicationItem[]> {
    const forms = new Map(
      (rows.length ? await this.db.q.selectFrom('application_forms').select(['id', 'slug', 'title', 'icon']).where('id', 'in', [...new Set(rows.map((r) => r.form_id))]).execute() : []).map((f) => [f.id, f]),
    );
    const people = await this.users.summaries(rows.flatMap((r) => [r.user_id, r.reviewer_id ?? 0, r.decided_by ?? 0]));
    return rows.map((r) => {
      const f = forms.get(r.form_id);
      return {
        id: r.id,
        form: { id: r.form_id, slug: f?.slug ?? '', title: f?.title ?? 'Silinmiş form', iconNodes: iconNode(f?.icon ?? null) },
        user: people.get(r.user_id) ?? null,
        status: r.status,
        reviewer: r.reviewer_id ? (people.get(r.reviewer_id) ?? null) : null,
        decidedBy: r.decided_by ? (people.get(r.decided_by) ?? null) : null,
        decisionReason: r.decision_reason,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        decidedAt: r.decided_at,
      };
    });
  }

  async mine(v: RequestViewer): Promise<ApplicationItem[]> {
    const rows = await this.db.q.selectFrom('applications').selectAll().where('user_id', '=', v.user!.id).orderBy('id', 'desc').limit(100).execute();
    return this.items(rows);
  }

  async reviewList(v: RequestViewer, q: { status?: string; formId?: number; page: number }): Promise<Paginated<ApplicationItem> & { forms: Array<{ id: number; title: string; pending: number }> }> {
    const forms = (await this.db.q.selectFrom('application_forms').selectAll().orderBy('sort_order').execute()).filter((f) => this.canReview(v, f));
    if (!forms.length) throw Errors.forbidden('İnceleyebileceğiniz bir başvuru formu yok.');
    const ids = q.formId ? forms.filter((f) => f.id === q.formId).map((f) => f.id) : forms.map((f) => f.id);
    const perPage = 30;
    let base = this.db.q.selectFrom('applications').where('form_id', 'in', ids.length ? ids : [0]);
    if (q.status === 'open') base = base.where('status', 'in', OPEN_STATUSES);
    else if (q.status && ['pending', 'reviewing', 'approved', 'rejected', 'withdrawn'].includes(q.status)) base = base.where('status', '=', q.status as ApplicationStatus);
    const [rows, total, pend] = await Promise.all([
      base.selectAll().orderBy('id', 'desc').limit(perPage).offset((q.page - 1) * perPage).execute(),
      base.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
      this.db.q
        .selectFrom('applications')
        .select(['form_id', (eb) => eb.fn.countAll<number>().as('n')])
        .where('status', 'in', OPEN_STATUSES)
        .where('form_id', 'in', forms.map((f) => f.id))
        .groupBy('form_id')
        .execute(),
    ]);
    const pendMap = new Map(pend.map((p) => [p.form_id, Number(p.n)]));
    return { items: await this.items(rows), total: Number(total?.n ?? 0), page: q.page, perPage, forms: forms.map((f) => ({ id: f.id, title: f.title, pending: pendMap.get(f.id) ?? 0 })) };
  }

  private async load(v: RequestViewer, id: number): Promise<{ app: AppRow; form: FormRow; reviewer: boolean }> {
    const app = await this.db.q.selectFrom('applications').selectAll().where('id', '=', id).executeTakeFirst();
    if (!app) throw Errors.notFound('Başvuru bulunamadı.');
    const form = await this.form(app.form_id);
    const reviewer = this.canReview(v, form);
    if (!reviewer && app.user_id !== v.user?.id) throw Errors.notFound('Başvuru bulunamadı.');
    return { app, form, reviewer };
  }

  async detail(v: RequestViewer, id: number): Promise<ApplicationDetail> {
    const { app, form, reviewer } = await this.load(v, id);
    const [item] = await this.items([app]);
    const answers = parseJson<Record<string, Answer>>(app.answers_json, {});
    let notesQ = this.db.q.selectFrom('application_notes').selectAll().where('application_id', '=', id);
    if (!reviewer) notesQ = notesQ.where('is_internal', '=', 0);
    const notes = await notesQ.orderBy('created_at').orderBy('id').execute();
    const people = await this.users.summaries(notes.map((n) => n.user_id ?? 0));
    const u = reviewer ? await this.users.findById(app.user_id) : null;
    return {
      ...item!,
      answers: this.questions(form).map((q) => ({ question: q, value: answers[q.id] ?? null })),
      notes: notes.map((n) => ({ id: n.id, user: n.user_id ? (people.get(n.user_id) ?? null) : null, body: n.body, isInternal: n.is_internal === 1, createdAt: n.created_at })),
      canReview: reviewer,
      canWithdraw: app.user_id === v.user?.id && OPEN_STATUSES.includes(app.status),
      applicant: u ? { postCount: u.post_count, registeredAt: u.registered_at, warningPoints: u.warning_points, emailVerified: u.email_verified_at != null } : null,
    };
  }

  async withdraw(v: RequestViewer, id: number): Promise<void> {
    const { app } = await this.load(v, id);
    if (app.user_id !== v.user!.id || !OPEN_STATUSES.includes(app.status)) throw Errors.badRequest('Bu başvuru geri çekilemez.');
    await this.db.q.updateTable('applications').set({ status: 'withdrawn', updated_at: this.clock.now() }).where('id', '=', id).execute();
  }

  async claim(v: RequestViewer, id: number): Promise<void> {
    const { app, reviewer } = await this.load(v, id);
    if (!reviewer) throw Errors.forbidden();
    if (!OPEN_STATUSES.includes(app.status)) throw Errors.badRequest('Sonuçlanmış başvuru üstlenilemez.');
    await this.db.q.updateTable('applications').set({ status: 'reviewing', reviewer_id: v.user!.id, updated_at: this.clock.now() }).where('id', '=', id).execute();
  }

  async note(v: RequestViewer, id: number, body: string, internal: boolean): Promise<void> {
    const { app, form, reviewer } = await this.load(v, id);
    const isInternal = reviewer && internal;
    if (!reviewer && app.status !== 'pending' && app.status !== 'reviewing') throw Errors.badRequest('Sonuçlanmış başvuruya yanıt yazılamaz.');
    await this.db.q.insertInto('application_notes').values({ application_id: id, user_id: v.user!.id, body, is_internal: isInternal ? 1 : 0, created_at: this.clock.now() }).execute();
    await this.db.q.updateTable('applications').set({ updated_at: this.clock.now() }).where('id', '=', id).execute();
    if (!isInternal && reviewer && app.user_id !== v.user!.id) {
      await this.notifications.notify(app.user_id, 'application.note', { applicationId: id, formTitle: form.title }, v.user!.id);
    }
  }

  async decide(v: RequestViewer, id: number, decision: 'approve' | 'reject', reason: string): Promise<void> {
    const { app, form, reviewer } = await this.load(v, id);
    if (!reviewer) throw Errors.forbidden();
    if (!OPEN_STATUSES.includes(app.status)) throw Errors.badRequest('Bu başvuru zaten sonuçlandı.');
    if (app.user_id === v.user!.id && !can(v, 'admin.applications')) throw Errors.forbidden('Kendi başvurunuzu sonuçlandıramazsınız.');
    const now = this.clock.now();
    const text = reason.trim() || (decision === 'approve' ? form.accept_message : form.reject_message) || null;
    await this.db.tx(async () => {
      await this.db.q
        .updateTable('applications')
        .set({ status: decision === 'approve' ? 'approved' : 'rejected', decided_by: v.user!.id, decided_at: now, decision_reason: text, reviewer_id: app.reviewer_id ?? v.user!.id, updated_at: now })
        .where('id', '=', id)
        .execute();
      if (decision === 'approve' && form.target_group_id) await this.groups.grant(app.user_id, form.target_group_id, form.set_primary === 1, v.user!.id);
      await this.notifications.notify(app.user_id, 'application.decided', { applicationId: id, formTitle: form.title, approved: decision === 'approve', reason: text }, v.user!.id);
    });
    await this.audit.log({ type: 'moderation', action: `application.${decision}`, actorId: v.user!.id, ip: v.ip, targetType: 'user', targetId: app.user_id, data: { applicationId: id, form: form.slug } });
  }

  private toAdmin(r: FormRow, counts: Map<number, { pending: number; total: number }>): AdminApplicationForm {
    const c = counts.get(r.id) ?? { pending: 0, total: 0 };
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      description: r.description,
      icon: r.icon,
      isOpen: r.is_open === 1,
      questions: this.questions(r),
      requirements: this.requirements(r),
      targetGroupId: r.target_group_id,
      setPrimary: r.set_primary === 1,
      reviewerGroupIds: this.reviewerGroups(r),
      acceptMessage: r.accept_message,
      rejectMessage: r.reject_message,
      sortOrder: r.sort_order,
      pendingCount: c.pending,
      totalCount: c.total,
      updatedAt: r.updated_at,
    };
  }

  async adminList(): Promise<AdminApplicationForm[]> {
    const [rows, counts] = await Promise.all([
      this.db.q.selectFrom('application_forms').selectAll().orderBy('sort_order').orderBy('id').execute(),
      this.db.q
        .selectFrom('applications')
        .select(['form_id', (eb) => eb.fn.countAll<number>().as('total'), (eb) => eb.fn.sum<number>(eb.case().when('status', 'in', OPEN_STATUSES).then(1).else(0).end()).as('pending')])
        .groupBy('form_id')
        .execute(),
    ]);
    const map = new Map(counts.map((c) => [c.form_id, { pending: Number(c.pending ?? 0), total: Number(c.total) }]));
    return rows.map((r) => this.toAdmin(r, map));
  }

  async save(v: RequestViewer, id: number | null, input: ApplicationFormInput): Promise<AdminApplicationForm> {
    const clash = await this.db.q.selectFrom('application_forms').select('id').where('slug', '=', input.slug).executeTakeFirst();
    if (clash && clash.id !== id) throw Errors.field('slug', 'Bu adres başka bir formda kullanılıyor.');
    const all = await this.groupCache.all();
    const known = new Set(all.map((g) => g.id));
    for (const g of [...input.reviewerGroupIds, ...input.requirements.requiredGroupIds, ...input.requirements.blockedGroupIds, ...(input.targetGroupId ? [input.targetGroupId] : [])]) {
      if (!known.has(g)) throw Errors.badRequest('Bilinmeyen grup seçildi.');
    }
    const target = input.targetGroupId ? all.find((g) => g.id === input.targetGroupId) : null;
    if (target && (target.system_key === 'admin' || target.system_key === 'guest' || target.system_key === 'member')) throw Errors.field('targetGroupId', 'Bu gruba başvuruyla üye eklenemez.');
    const now = this.clock.now();
    const values = {
      slug: input.slug,
      title: input.title,
      description: input.description,
      description_html: this.render.post(input.description).html,
      icon: input.icon,
      is_open: input.isOpen ? 1 : 0,
      questions_json: JSON.stringify(input.questions),
      requirements_json: JSON.stringify(input.requirements),
      target_group_id: input.targetGroupId,
      set_primary: input.setPrimary ? 1 : 0,
      reviewer_group_ids_json: JSON.stringify(input.reviewerGroupIds),
      accept_message: input.acceptMessage,
      reject_message: input.rejectMessage,
      sort_order: input.sortOrder,
      updated_at: now,
    };
    let rowId = id;
    if (id) {
      const r = await this.db.q.updateTable('application_forms').set(values).where('id', '=', id).executeTakeFirst();
      if (!Number(r.numUpdatedRows)) throw Errors.notFound('Başvuru formu bulunamadı.');
    } else rowId = (await this.db.q.insertInto('application_forms').values({ ...values, created_at: now }).returning('id').executeTakeFirstOrThrow()).id;
    await this.audit.log({ type: 'admin', action: id ? 'application.form.update' : 'application.form.create', actorId: v.user!.id, ip: v.ip, data: { id: rowId, slug: input.slug } });
    return (await this.adminList()).find((f) => f.id === rowId)!;
  }

  async remove(v: RequestViewer, id: number): Promise<void> {
    const r = await this.form(id);
    await this.db.tx(async () => {
      const apps = await this.db.q.selectFrom('applications').select('id').where('form_id', '=', id).execute();
      if (apps.length) await this.db.q.deleteFrom('application_notes').where('application_id', 'in', apps.map((a) => a.id)).execute();
      await this.db.q.deleteFrom('applications').where('form_id', '=', id).execute();
      await this.db.q.deleteFrom('application_forms').where('id', '=', id).execute();
    });
    await this.audit.log({ type: 'admin', action: 'application.form.delete', actorId: v.user!.id, ip: v.ip, data: { id, slug: r.slug } });
  }
}
