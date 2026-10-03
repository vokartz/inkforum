import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { idParam, pagination } from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { AdminEndpoint, RequirePermission } from '../common/decorators.js';
import { CurrentViewer, can, type RequestViewer } from '../common/request-context.js';
import { Errors } from '../common/errors.js';
import { BansService } from '../bans/bans.service.js';
import { WarningsService } from '../warnings/warnings.service.js';
import { warningActionSchema, warningTemplateSchema } from '../warnings/warnings.schemas.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';

const banSchema = z
  .object({
    name: z.string().trim().min(1, 'Ad gerekli.').max(100),
    reasonPublic: z.string().trim().max(500).nullable().default(null),
    notesPrivate: z.string().trim().max(2000).nullable().default(null),
    cannotAccess: z.boolean().default(false),
    cannotLogin: z.boolean().default(false),
    cannotRegister: z.boolean().default(false),
    cannotPost: z.boolean().default(false),
    expiresAt: z.number().int().positive().nullable().default(null),
    triggers: z
      .array(
        z.object({
          type: z.enum(['ip', 'ip_range', 'email', 'email_domain', 'username', 'user']),
          value: z.string().trim().min(1, 'Değer gerekli.').max(200),
        }),
      )
      .max(100),
  });

const banListSchema = z.object({ filter: z.enum(['active', 'expired', 'all']).default('active') });

@Controller()
export class AdminModerationController {
  constructor(
    private readonly bans: BansService,
    private readonly warnings: WarningsService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly permissions: PermissionsService,
  ) {}

  private async assertBannable(v: RequestViewer, triggers: Array<{ type: string; value: string }>): Promise<void> {
    for (const t of triggers) {
      if (t.type !== 'user') continue;
      const target = await this.users.findById(Number(t.value));
      if (!target) continue;
      if (target.id === v.user!.id) throw Errors.badRequest('Kendinizi yasaklayamazsınız.');
      const perms = await this.permissions.forUser(target);
      if (perms.isAdmin && !v.isAdmin) throw Errors.forbidden('Yöneticileri yalnızca yöneticiler yasaklayabilir.');
      if ((perms.isAdmin || perms.permissions.has('admin.access')) && !can(v, 'admin.bans.manage')) throw Errors.forbidden('Yönetim ekibinden birini yasaklama yetkiniz yok.');
    }
  }

  @Get('admin/bans')
  @AdminEndpoint('admin.bans.manage')
  async list(@Query() query: unknown) {
    return this.bans.list(parse(banListSchema, query).filter);
  }

  @Get('admin/bans/stats')
  @AdminEndpoint('admin.bans.manage')
  stats() {
    return this.bans.stats();
  }

  @Get('admin/bans/log')
  @AdminEndpoint('admin.bans.manage')
  async log(@Query() query: unknown) {
    const { page, perPage } = parse(pagination, query);
    return this.bans.log(page, perPage);
  }

  @Get('admin/bans/:id')
  @AdminEndpoint('admin.bans.manage')
  async get(@Param('id', new ZodPipe(idParam)) id: number) {
    return this.bans.get(id);
  }

  @Post('mod/bans')
  @HttpCode(201)
  @RequirePermission('mod.users.ban')
  async create(@Body(new ZodPipe(banSchema)) body: z.output<typeof banSchema>, @CurrentViewer() v: RequestViewer) {
    if (!can(v, 'admin.bans.manage') && body.triggers.some((t) => t.type !== 'user')) {
      throw Errors.forbidden('Moderatörler yalnızca üye bazlı yasak oluşturabilir.');
    }
    await this.assertBannable(v, body.triggers);
    const id = await this.bans.create(body, v.user!.id);
    await this.audit.log({ type: 'moderation', action: 'ban.create', actorId: v.user!.id, targetType: 'ban', targetId: id, ip: v.ip, data: body });
    return { id };
  }

  @Put('admin/bans/:id')
  @AdminEndpoint('admin.bans.manage')
  async update(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(banSchema)) body: z.output<typeof banSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.assertBannable(v, body.triggers);
    await this.bans.update(id, body);
    await this.audit.log({ type: 'moderation', action: 'ban.update', actorId: v.user!.id, targetType: 'ban', targetId: id, ip: v.ip, data: body });
    return { ok: true };
  }

  @Post('mod/bans/:id/lift')
  @HttpCode(200)
  @RequirePermission('mod.users.ban')
  async lift(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    if (!can(v, 'admin.bans.manage')) {
      const ban = await this.bans.get(id);
      if (ban.triggers.some((t: { type: string }) => t.type !== 'user')) throw Errors.forbidden('Bu yasağı yalnızca yasak yöneticileri kaldırabilir.');
    }
    await this.bans.lift(id, v.user!.id);
    await this.audit.log({ type: 'moderation', action: 'ban.lift', actorId: v.user!.id, targetType: 'ban', targetId: id, ip: v.ip });
    return { ok: true };
  }

  @Delete('admin/bans/:id')
  @AdminEndpoint('admin.bans.manage')
  async delete(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.bans.delete(id);
    await this.audit.log({ type: 'moderation', action: 'ban.delete', actorId: v.user!.id, targetType: 'ban', targetId: id, ip: v.ip });
    return { ok: true };
  }

  @Get('admin/warnings/config')
  @AdminEndpoint('admin.warnings.manage')
  async config() {
    return { templates: await this.warnings.templates(), actions: await this.warnings.actions() };
  }

  @Post('admin/warnings/templates')
  @HttpCode(201)
  @AdminEndpoint('admin.warnings.manage')
  async createTemplate(@Body(new ZodPipe(warningTemplateSchema)) body: z.output<typeof warningTemplateSchema>) {
    return { id: await this.warnings.saveTemplate(null, body) };
  }

  @Put('admin/warnings/templates/:id')
  @AdminEndpoint('admin.warnings.manage')
  async updateTemplate(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(warningTemplateSchema)) body: z.output<typeof warningTemplateSchema>) {
    await this.warnings.saveTemplate(id, body);
    return { ok: true };
  }

  @Delete('admin/warnings/templates/:id')
  @AdminEndpoint('admin.warnings.manage')
  async deleteTemplate(@Param('id', new ZodPipe(idParam)) id: number) {
    await this.warnings.deleteTemplate(id);
    return { ok: true };
  }

  @Post('admin/warnings/actions')
  @HttpCode(201)
  @AdminEndpoint('admin.warnings.manage')
  async createAction(@Body(new ZodPipe(warningActionSchema)) body: z.output<typeof warningActionSchema>, @CurrentViewer() v: RequestViewer) {
    const id = await this.warnings.saveAction(null, body);
    await this.audit.log({ type: 'admin', action: 'warning_action.create', actorId: v.user!.id, ip: v.ip, data: body });
    return { id };
  }

  @Put('admin/warnings/actions/:id')
  @AdminEndpoint('admin.warnings.manage')
  async updateAction(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(warningActionSchema)) body: z.output<typeof warningActionSchema>) {
    await this.warnings.saveAction(id, body);
    return { ok: true };
  }

  @Delete('admin/warnings/actions/:id')
  @AdminEndpoint('admin.warnings.manage')
  async deleteAction(@Param('id', new ZodPipe(idParam)) id: number) {
    await this.warnings.deleteAction(id);
    return { ok: true };
  }
}
