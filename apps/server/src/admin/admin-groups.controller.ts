import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UploadedFile } from '@nestjs/common';
import { z } from 'zod';
import { GLOBAL_PERMISSIONS, PERMISSION_CATEGORIES, idParam, pagination } from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { AdminEndpoint } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { ImageUpload, type UploadedImage } from '../common/upload.js';
import { GroupsService } from '../groups/groups.service.js';
import { addMemberSchema, groupInputSchema, handleRequestSchema, moderatorsSchema } from '../groups/groups.schemas.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { Errors } from '../common/errors.js';

const permissionValuesSchema = z.object({
  values: z.record(z.string(), z.union([z.literal(0), z.literal(1), z.literal(-1)])),
});
const copySchema = z.object({ fromGroupId: z.number().int().positive() });

@Controller('admin')
export class AdminGroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly cache: GroupCacheService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  @Get('groups')
  @AdminEndpoint('admin.groups.manage')
  async list() {
    const all = await this.cache.all();
    return all.map((g) => this.groups.toDto(g));
  }

  @Get('groups/:id')
  @AdminEndpoint('admin.groups.manage')
  async get(@Param('id', new ZodPipe(idParam)) id: number) {
    const g = await this.groups.require(id);
    const moderatorIds = await this.groups.moderatorIds(id);
    const mods = await this.users.summaries(moderatorIds);
    return {
      ...this.groups.toDto(g),
      moderators: moderatorIds.map((uid) => mods.get(uid)).filter(Boolean),
      requests: await this.groups.pendingRequests(id),
    };
  }

  @Post('groups')
  @HttpCode(201)
  @AdminEndpoint('admin.groups.manage')
  async create(@Body(new ZodPipe(groupInputSchema)) body: z.output<typeof groupInputSchema>, @CurrentViewer() v: RequestViewer) {
    const id = await this.groups.create(body);
    await this.audit.log({ type: 'admin', action: 'group.create', actorId: v.user!.id, targetType: 'group', targetId: id, ip: v.ip, data: { name: body.name } });
    return { id };
  }

  @Put('groups/:id')
  @AdminEndpoint('admin.groups.manage')
  async update(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(groupInputSchema)) body: z.output<typeof groupInputSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.groups.update(id, body);
    await this.audit.log({ type: 'admin', action: 'group.update', actorId: v.user!.id, targetType: 'group', targetId: id, ip: v.ip, data: body });
    return { ok: true };
  }

  @Delete('groups/:id')
  @AdminEndpoint('admin.groups.manage')
  async delete(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    const g = await this.groups.require(id);
    await this.groups.delete(id);
    await this.audit.log({ type: 'admin', action: 'group.delete', actorId: v.user!.id, targetType: 'group', targetId: id, ip: v.ip, data: { name: g.name } });
    return { ok: true };
  }

  @Post('groups/:id/icon')
  @HttpCode(200)
  @ImageUpload(1024 * 1024)
  @AdminEndpoint('admin.groups.manage')
  async icon(@Param('id', new ZodPipe(idParam)) id: number, @UploadedFile() file: UploadedImage | undefined) {
    await this.groups.setIcon(id, file?.buffer ?? null);
    return { iconUrl: (await this.cache.get(id))?.iconUrl ?? null };
  }

  @Delete('groups/:id/icon')
  @AdminEndpoint('admin.groups.manage')
  async removeIcon(@Param('id', new ZodPipe(idParam)) id: number) {
    await this.groups.setIcon(id, null);
    return { ok: true };
  }

  @Put('groups/:id/moderators')
  @AdminEndpoint('admin.groups.manage')
  async moderators(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(moderatorsSchema)) body: z.output<typeof moderatorsSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.groups.setModerators(id, body.userIds);
    await this.audit.log({ type: 'admin', action: 'group.moderators', actorId: v.user!.id, targetType: 'group', targetId: id, ip: v.ip, data: body });
    return { ok: true };
  }

  @Get('groups/:id/members')
  @AdminEndpoint('admin.groups.manage')
  async members(@Param('id', new ZodPipe(idParam)) id: number, @Query() query: unknown) {
    const { page, perPage } = parse(pagination, query);
    return this.groups.members(id, page, perPage);
  }

  @Post('groups/:id/members')
  @HttpCode(200)
  @AdminEndpoint('admin.groups.manage')
  async addMember(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(addMemberSchema)) body: z.output<typeof addMemberSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.groups.addByManager(v, id, body.userId, body.asPrimary, body.expiresAt);
    await this.audit.log({ type: 'admin', action: 'group.member_add', actorId: v.user!.id, targetType: 'user', targetId: body.userId, ip: v.ip, data: { groupId: id, ...body } });
    return { ok: true };
  }

  @Delete('groups/:id/members/:userId')
  @AdminEndpoint('admin.groups.manage')
  async removeMember(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Param('userId', new ZodPipe(idParam)) userId: number,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.groups.removeByManager(v, id, userId);
    await this.audit.log({ type: 'admin', action: 'group.member_remove', actorId: v.user!.id, targetType: 'user', targetId: userId, ip: v.ip, data: { groupId: id } });
    return { ok: true };
  }

  @Get('group-requests')
  @AdminEndpoint('admin.groups.manage')
  async requests() {
    return this.groups.allPendingRequests();
  }

  @Post('group-requests/:id')
  @HttpCode(200)
  @AdminEndpoint('admin.groups.manage')
  async handle(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(handleRequestSchema)) body: z.output<typeof handleRequestSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.groups.handleRequest(v, id, body.approve, body.response);
    return { ok: true };
  }

  // ----- Yetki matrisi -----

  @Get('permissions')
  @AdminEndpoint('admin.permissions.manage')
  async matrix() {
    const groups = await this.cache.all();
    const table = await this.permissions.table();
    return {
      categories: PERMISSION_CATEGORIES.filter((c) => GLOBAL_PERMISSIONS.some((p) => p.category === c.key)),
      permissions: GLOBAL_PERMISSIONS.map((p) => ({
        key: p.key,
        scope: p.scope,
        category: p.category,
        label: p.label,
        description: p.description ?? null,
        guestGrantable: p.guestGrantable,
        dangerous: !!p.dangerous,
      })),
      groups: groups.map((g) => ({
        ...this.groups.toDto(g),
        editable: g.system_key !== 'admin' && !g.parent_id,
        inheritsFrom: g.parent_id,
      })),
      values: Object.fromEntries(groups.map((g) => [g.id, Object.fromEntries(table.get(g.id) ?? [])])),
    };
  }

  @Put('permissions/:groupId')
  @AdminEndpoint('admin.permissions.manage')
  async setPermissions(
    @Param('groupId', new ZodPipe(idParam)) groupId: number,
    @Body(new ZodPipe(permissionValuesSchema)) body: z.output<typeof permissionValuesSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.permissions.setGroupPermissions(groupId, body.values);
    await this.audit.log({ type: 'admin', action: 'permissions.update', actorId: v.user!.id, targetType: 'group', targetId: groupId, ip: v.ip, data: body.values });
    return { ok: true };
  }

  @Post('permissions/:groupId/copy')
  @HttpCode(200)
  @AdminEndpoint('admin.permissions.manage')
  async copy(
    @Param('groupId', new ZodPipe(idParam)) groupId: number,
    @Body(new ZodPipe(copySchema)) body: z.output<typeof copySchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    const target = await this.groups.require(groupId);
    if (target.system_key === 'admin' || target.parent_id) {
      throw Errors.badRequest('Bu grubun yetkileri kopyalanarak değiştirilemez.');
    }
    await this.permissions.copyPermissions(body.fromGroupId, groupId);
    await this.audit.log({ type: 'admin', action: 'permissions.copy', actorId: v.user!.id, targetType: 'group', targetId: groupId, ip: v.ip, data: body });
    return { ok: true };
  }
}
