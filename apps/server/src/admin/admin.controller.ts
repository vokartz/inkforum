import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { MAIL_TEMPLATE_KEYS, onboardingInput, type AdminOnboarding, type OnboardingInput, maintenancePageInput, type MaintenancePageInput, SETTINGS, SETTING_KEYS, SETTING_SECTIONS, mailTemplateSchema, mailTransportInput, type MailTemplateKey, type MailTransportInput } from '@forum/shared';
import { sql } from 'kysely';
import { ZodPipe, parse } from '../common/validation.js';
import { AdminEndpoint, RequirePermission } from '../common/decorators.js';
import { CurrentViewer, can, type RequestViewer } from '../common/request-context.js';
import { CONFIG, type AppConfig } from '../config/config.js';
import { Db } from '../database/db.service.js';
import { Clock, DAY } from '../common/clock.js';
import { SettingsService } from '../settings/settings.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { MailService, explainMailError } from '../mail/mail.service.js';
import { MailTemplates } from '../mail/templates.js';
import { AuditService } from '../audit/audit.service.js';
import { CacheService } from '../cache/cache.service.js';
import { GroupsService } from '../groups/groups.service.js';
import { UsersService } from '../users/users.service.js';
import { UpdatesService } from '../updates/updates.service.js';
import { SystemInfoService } from '../maintenance/system-info.service.js';
import { ExtensionsService } from '../extensions/extensions.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ONLINE_WINDOW_MS } from '../profiles/profiles.service.js';
import { fromJson } from '../database/json.js';
import { Errors } from '../common/errors.js';

const mailKeyParam = z.enum(MAIL_TEMPLATE_KEYS);
const mailPreviewSchema = mailTemplateSchema.extend({ to: z.email('Geçerli bir e-posta girin.').optional() });

const logQuerySchema = z.object({
  type: z.enum(['all', 'admin', 'moderation', 'security', 'user']).default('all'),
  action: z.string().trim().max(60).default(''),
  actorId: z.coerce.number().int().positive().optional(),
  targetId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
});

@Controller('admin')
export class AdminController {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly jobs: JobsService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly groups: GroupsService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly updates: UpdatesService,
    private readonly system_: SystemInfoService,
    private readonly extensions: ExtensionsService,
  ) {}

  @Get('access')
  @RequirePermission('admin.access')
  async access(@CurrentViewer() v: RequestViewer) {
    const until = v.session?.elevated_until ?? 0;
    const count = async (q: any) => Number((await q.select((eb: any) => eb.fn.countAll().as('n')).executeTakeFirst())?.n ?? 0);
    const [pendingUsers, pendingPosts, groupRequests, failedJobs] = await Promise.all([
      count(this.db.q.selectFrom('users').where('status', '=', 'pending_approval').where('deleted_at', 'is', null)),
      count(this.db.q.selectFrom('posts').where('is_approved', '=', 0).where('deleted_at', 'is', null)),
      count(this.db.q.selectFrom('group_join_requests').where('status', '=', 'pending')),
      count(this.db.q.selectFrom('jobs').where('status', '=', 'failed')),
    ]);
    return {
      elevated: until > this.clock.now(),
      elevatedUntil: until > this.clock.now() ? until : null,
      badges: { pendingUsers, pendingPosts, groupRequests, failedJobs },
      version: await this.updates.summary(),
      extensions: this.extensions.adminMenu(v),
      onboarding: await this.onboarding(v.user!.id),
    };
  }

  private async onboarding(userId: number): Promise<AdminOnboarding> {
    const row = await this.db.q.selectFrom('system_state').select('value').where('key', '=', `admin-onboarding:${userId}`).executeTakeFirst();
    const state = fromJson<{ tourDoneAt?: number | null; seenVersion?: string | null }>(row?.value ?? '{}', {});
    return { tourDoneAt: state.tourDoneAt ?? null, seenVersion: state.seenVersion ?? null, currentVersion: this.config.version };
  }

  @Post('onboarding')
  @HttpCode(200)
  @RequirePermission('admin.access')
  async saveOnboarding(@Body(new ZodPipe(onboardingInput)) body: OnboardingInput, @CurrentViewer() v: RequestViewer) {
    const userId = v.user!.id;
    const cur = await this.onboarding(userId);
    const next = {
      tourDoneAt: body.tour === 'done' ? this.clock.now() : body.tour === 'reset' ? null : cur.tourDoneAt,
      seenVersion: body.seenVersion ?? cur.seenVersion,
    };
    const value = JSON.stringify(next);
    const now = this.clock.now();
    await this.db.q
      .insertInto('system_state')
      .values({ key: `admin-onboarding:${userId}`, value, updated_at: now })
      .onConflict((oc) => oc.column('key').doUpdateSet({ value, updated_at: now }))
      .execute();
    return { ...next, currentVersion: this.config.version };
  }

  @Get('dashboard')
  @AdminEndpoint()
  async dashboard() {
    const now = this.clock.now();
    const count = async (q: any) => Number((await q.select((eb: any) => eb.fn.countAll().as('n')).executeTakeFirst())?.n ?? 0);
    const users = this.db.q.selectFrom('users').where('deleted_at', 'is', null);
    const [total, pendingApproval, pendingEmail, today, week, online, activeBans, warnings7d, failedJobs, pendingRequests] = await Promise.all([
      count(users.where('status', '=', 'active')),
      count(users.where('status', '=', 'pending_approval')),
      count(users.where('status', '=', 'pending_email')),
      count(users.where('registered_at', '>=', now - DAY)),
      count(users.where('registered_at', '>=', now - 7 * DAY)),
      count(users.where('last_active_at', '>=', now - ONLINE_WINDOW_MS)),
      count(
        this.db.q
          .selectFrom('bans')
          .where('lifted_at', 'is', null)
          .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)])),
      ),
      count(this.db.q.selectFrom('user_warnings').where('created_at', '>=', now - 7 * DAY)),
      count(this.db.q.selectFrom('jobs').where('status', '=', 'failed')),
      count(this.db.q.selectFrom('group_join_requests').where('status', '=', 'pending')),
    ]);
    const latest = await this.db.q
      .selectFrom('users')
      .select('id')
      .where('deleted_at', 'is', null)
      .orderBy('registered_at', 'desc')
      .limit(8)
      .execute();
    const summaries = await this.users.summaries(latest.map((r) => r.id));

    const since = now - 14 * DAY;
    const regs = await this.db.q.selectFrom('users').select('registered_at').where('registered_at', '>=', since).where('deleted_at', 'is', null).execute();
    const buckets: Array<{ day: string; count: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * DAY);
      buckets.push({ day: d.toISOString().slice(0, 10), count: 0 });
    }
    for (const r of regs) {
      const key = new Date(r.registered_at).toISOString().slice(0, 10);
      const b = buckets.find((x) => x.day === key);
      if (b) b.count++;
    }

    const postRows = await this.db.q
      .selectFrom('posts')
      .select('created_at')
      .where('created_at', '>=', since)
      .where('deleted_at', 'is', null)
      .execute();
    const posts = buckets.map((b) => ({ day: b.day, count: 0 }));
    for (const r of postRows) {
      const key = new Date(r.created_at).toISOString().slice(0, 10);
      const b = posts.find((x) => x.day === key);
      if (b) b.count++;
    }
    const [totals, postsToday, pendingPosts] = await Promise.all([
      this.db.q
        .selectFrom('boards')
        .select((eb) => [eb.fn.sum<number>('topic_count').as('topics'), eb.fn.sum<number>('post_count').as('posts')])
        .executeTakeFirst(),
      count(this.db.q.selectFrom('posts').where('created_at', '>=', now - DAY).where('deleted_at', 'is', null)),
      count(this.db.q.selectFrom('posts').where('is_approved', '=', 0).where('deleted_at', 'is', null)),
    ]);

    const topicRows = await this.db.q.selectFrom('topics').select('created_at').where('created_at', '>=', since).where('deleted_at', 'is', null).execute();
    const topics = buckets.map((b) => ({ day: b.day, count: 0 }));
    for (const r of topicRows) {
      const b = topics.find((x) => x.day === new Date(r.created_at).toISOString().slice(0, 10));
      if (b) b.count++;
    }

    const actions = await this.db.q
      .selectFrom('audit_log')
      .select(['id', 'log_type', 'action', 'actor_id', 'target_type', 'target_id', 'created_at'])
      .where('log_type', 'in', ['admin', 'moderation'])
      .orderBy('id', 'desc')
      .limit(8)
      .execute();
    const actors = await this.users.summaries(actions.map((r) => r.actor_id ?? 0));

    return {
      stats: { total, pendingApproval, pendingEmail, today, week, online, activeBans, warnings7d, failedJobs, pendingRequests },
      topics,
      recentActions: actions.map((r) => ({
        id: r.id,
        type: r.log_type,
        action: r.action,
        actor: r.actor_id ? (actors.get(r.actor_id) ?? null) : null,
        targetType: r.target_type,
        targetId: r.target_id,
        createdAt: r.created_at,
      })),
      forum: { topics: Number(totals?.topics ?? 0), posts: Number(totals?.posts ?? 0), postsToday, pendingPosts },
      latestMembers: latest.map((r) => summaries.get(r.id)!).filter(Boolean),
      registrations: buckets,
      posts,
      system: this.systemInfo(),
    };
  }

  private systemInfo() {
    return this.system_.brief();
  }

  @Get('system')
  @AdminEndpoint('admin.maintenance')
  system(@CurrentViewer() v: RequestViewer) {
    return this.system_.full(v.locale);
  }

  @Get('settings')
  @AdminEndpoint('admin.settings')
  getSettings() {
    const values = this.settings.all();
    return {
      sections: SETTING_SECTIONS,
      definitions: SETTING_KEYS.filter((k) => !SETTINGS[k].hidden).map((key) => {
        const d = SETTINGS[key];
        return {
          key,
          section: d.section,
          label: d.label,
          description: d.description ?? null,
          input: d.input,
          options: d.options ?? null,
          default: d.default,
          value: values[key],
        };
      }),
    };
  }

  @Put('settings')
  @AdminEndpoint('admin.settings')
  async putSettings(@Body(new ZodPipe(z.record(z.string(), z.unknown()))) body: Record<string, unknown>, @CurrentViewer() v: RequestViewer) {
    const changed = await this.settings.update(body, v.user!.id);
    if (changed.length) {
      await this.audit.log({ type: 'admin', action: 'settings.update', actorId: v.user!.id, ip: v.ip, data: { keys: changed } });
    }
    return { changed };
  }

  @Get('logs')
  @AdminEndpoint('admin.logs.view')
  async logs(@Query() query: unknown) {
    const q = parse(logQuerySchema, query);
    let base = this.db.q.selectFrom('audit_log');
    if (q.type !== 'all') base = base.where('log_type', '=', q.type);
    if (q.action) base = base.where('action', 'like', `${q.action.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    if (q.actorId) base = base.where('actor_id', '=', q.actorId);
    if (q.targetId) base = base.where('target_id', '=', q.targetId);
    const [rows, total] = await Promise.all([
      base.selectAll().orderBy('id', 'desc').limit(q.perPage).offset((q.page - 1) * q.perPage).execute(),
      base.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst(),
    ]);
    const people = await this.users.summaries(rows.flatMap((r) => [r.actor_id ?? 0, r.target_type === 'user' ? (r.target_id ?? 0) : 0]));
    return {
      items: rows.map((r) => ({
        id: r.id,
        type: r.log_type,
        action: r.action,
        actor: r.actor_id ? (people.get(r.actor_id) ?? null) : null,
        targetType: r.target_type,
        targetId: r.target_id,
        target: r.target_type === 'user' && r.target_id ? (people.get(r.target_id) ?? null) : null,
        ip: r.ip,
        data: fromJson<Record<string, unknown> | null>(r.data_json, null),
        createdAt: r.created_at,
      })),
      total: Number(total?.n ?? 0),
      page: q.page,
      perPage: q.perPage,
    };
  }

  @Put('maintenance/page')
  @AdminEndpoint('admin.maintenance')
  async saveMaintenancePage(@Body(new ZodPipe(maintenancePageInput)) body: MaintenancePageInput, @CurrentViewer() v: RequestViewer) {
    const { enabled, message, ...page } = body;
    const current = this.settings.get('general.maintenancePage');
    if ((page.html !== current.html || page.css !== current.css) && !(v.isAdmin || can(v, 'admin.customCode'))) {
      throw Errors.forbidden('Özel HTML/CSS için "Kod düzenleme" yetkisi gerekli.');
    }
    await this.settings.update({ 'general.maintenanceMode': enabled, 'general.maintenanceMessage': message, 'general.maintenancePage': page }, v.user!.id, { allowHidden: true });
    return { ok: true };
  }

  @Get('jobs')
  @AdminEndpoint('admin.maintenance')
  async jobStats() {
    const stats = await this.jobs.stats();
    const failed = await this.db.q
      .selectFrom('jobs')
      .select(['id', 'type', 'attempts', 'last_error', 'finished_at', 'created_at'])
      .where('status', '=', 'failed')
      .orderBy('id', 'desc')
      .limit(50)
      .execute();
    return { ...stats, failed };
  }

  @Post('jobs/run-tasks')
  @HttpCode(200)
  @AdminEndpoint('admin.maintenance')
  async runTasks(@CurrentViewer() v: RequestViewer) {
    const ran = await this.jobs.runDueTasks(true);
    const processed = await this.jobs.drain(200);
    await this.audit.log({ type: 'admin', action: 'maintenance.run_tasks', actorId: v.user!.id, ip: v.ip, data: { ran, processed } });
    return { ran, processed };
  }

  @Post('jobs/retry-failed')
  @HttpCode(200)
  @AdminEndpoint('admin.maintenance')
  async retryFailed() {
    const r = await this.db.q
      .updateTable('jobs')
      .set({ status: 'pending', attempts: 0, run_at: this.clock.now(), finished_at: null })
      .where('status', '=', 'failed')
      .executeTakeFirst();
    return { retried: Number(r.numUpdatedRows) };
  }

  @Post('mail/test')
  @HttpCode(200)
  @AdminEndpoint('admin.settings')
  async testMail(@Body(new ZodPipe(z.object({ to: z.email('Geçerli bir e-posta girin.') }))) body: { to: string }) {
    try {
      await this.mail.deliver({ to: body.to, ...MailTemplates.test(this.mail.context()) });
    } catch (err) {
      throw Errors.badRequest(`E-posta gönderilemedi: ${explainMailError(err).message}`);
    }
    return { ok: true, driver: this.mail.driver() };
  }

  @Get('mail/transport')
  @AdminEndpoint('admin.settings')
  mailTransport() {
    return this.mail.adminTransport();
  }

  @Put('mail/transport')
  @AdminEndpoint('admin.settings')
  async saveMailTransport(@Body(new ZodPipe(mailTransportInput)) body: MailTransportInput, @CurrentViewer() v: RequestViewer) {
    const r = await this.mail.saveTransport(body, v.user!.id);
    await this.audit.log({ type: 'admin', action: 'mail.transport', actorId: v.user!.id, ip: v.ip, data: { driver: body.driver, host: body.host, port: body.port } });
    return r;
  }

  @Post('mail/transport/verify')
  @HttpCode(200)
  @AdminEndpoint('admin.settings')
  verifyMailTransport(@Body(new ZodPipe(mailTransportInput)) body: MailTransportInput) {
    return this.mail.verify(body);
  }

  @Get('mail/templates')
  @AdminEndpoint('admin.settings')
  async mailTemplates(@CurrentViewer() v: RequestViewer) {
    return { items: await this.mail.adminTemplates(v.locale) };
  }

  @Put('mail/templates/:key')
  @AdminEndpoint('admin.settings')
  async saveMailTemplate(
    @Param('key', new ZodPipe(mailKeyParam)) key: MailTemplateKey,
    @Body(new ZodPipe(mailTemplateSchema)) body: z.output<typeof mailTemplateSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.mail.saveTemplate(key, body, v.user!.id);
    await this.audit.log({ type: 'admin', action: 'mail.template.update', actorId: v.user!.id, ip: v.ip, data: { key } });
    return { ok: true };
  }

  @Delete('mail/templates/:key')
  @AdminEndpoint('admin.settings')
  async resetMailTemplate(@Param('key', new ZodPipe(mailKeyParam)) key: MailTemplateKey, @CurrentViewer() v: RequestViewer) {
    await this.mail.resetTemplate(key);
    await this.audit.log({ type: 'admin', action: 'mail.template.reset', actorId: v.user!.id, ip: v.ip, data: { key } });
    return { ok: true };
  }

  @Post('mail/templates/:key/preview')
  @HttpCode(200)
  @AdminEndpoint('admin.settings')
  async previewMailTemplate(
    @Param('key', new ZodPipe(mailKeyParam)) key: MailTemplateKey,
    @Body(new ZodPipe(mailPreviewSchema)) body: z.output<typeof mailPreviewSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    const content = this.mail.preview(key, body.subject, body.body, v.user!.display_name);
    if (body.to) {
      try {
        await this.mail.deliver({ to: body.to, ...content });
      } catch (err) {
        throw Errors.badRequest(`E-posta gönderilemedi: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return content;
  }

  @Get('mail/outbox')
  @AdminEndpoint('admin.settings')
  outbox() {
    return { driver: this.mail.driver(), items: [...this.mail.outbox].reverse().map(({ html: _h, ...m }) => m) };
  }

  @Post('maintenance')
  @HttpCode(200)
  @AdminEndpoint('admin.maintenance')
  async runMaintenance(
    @Body(new ZodPipe(z.object({ task: z.enum(['clear_cache', 'recount_groups', 'recalc_post_groups', 'recount_notifications', 'cleanup_sessions', 'cleanup_notifications', 'cleanup_logs', 'optimize_db']) })))
    body: { task: string },
    @CurrentViewer() v: RequestViewer,
  ) {
    switch (body.task) {
      case 'clear_cache':
        this.cache.clearAll();
        for (const ns of ['settings', 'groups', 'permissions', 'policies', 'bans', 'achievements', 'profile_fields']) await this.cache.invalidate(ns);
        break;
      case 'recount_groups':
        await this.groups.recountMembers();
        break;
      case 'recalc_post_groups':
        await this.groups.recalcAllPostGroups();
        break;
      case 'recount_notifications': {
        const ids = await this.db.q.selectFrom('users').select('id').where('deleted_at', 'is', null).execute();
        for (const { id } of ids) await this.notifications.recount(id);
        break;
      }
      case 'cleanup_sessions':
        await this.db.q.deleteFrom('sessions').where('expires_at', '<', this.clock.now()).execute();
        break;
      case 'cleanup_notifications':
        await this.db.q.deleteFrom('notifications').where('read_at', 'is not', null).where('created_at', '<', this.clock.now() - 90 * DAY).execute();
        break;
      case 'cleanup_logs':
        await this.db.q.deleteFrom('audit_log').where('log_type', '!=', 'security').where('created_at', '<', this.clock.now() - 365 * DAY).execute();
        break;
      case 'optimize_db':
        if (this.config.db.driver === 'sqlite') {
          await sql`PRAGMA optimize`.execute(this.db.q);
          await sql`VACUUM`.execute(this.db.q);
        } else await sql`ANALYZE`.execute(this.db.q);
        break;
    }
    await this.audit.log({ type: 'admin', action: `maintenance.${body.task}`, actorId: v.user!.id, ip: v.ip });
    return { ok: true };
  }
}
