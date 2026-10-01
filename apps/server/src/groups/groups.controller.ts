import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { idParam, pagination } from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { RequireAuth, RequirePermission } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { Errors } from '../common/errors.js';
import { GroupsService } from './groups.service.js';
import { addMemberSchema, handleRequestSchema, joinRequestSchema } from './groups.schemas.js';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  @RequirePermission('groups.view')
  async list(@CurrentViewer() viewer: RequestViewer) {
    return this.groups.listVisible(viewer);
  }

  @Get(':id')
  @RequirePermission('groups.view')
  async get(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() viewer: RequestViewer) {
    return this.groups.getVisible(viewer, id);
  }

  @Get(':id/members')
  @RequirePermission('groups.view')
  async members(@Param('id', new ZodPipe(idParam)) id: number, @Query() query: unknown, @CurrentViewer() viewer: RequestViewer) {
    await this.groups.getVisible(viewer, id);
    const { page, perPage } = parse(pagination, query);
    return this.groups.members(id, page, perPage);
  }

  @Post(':id/join')
  @HttpCode(200)
  @RequireAuth()
  async join(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(joinRequestSchema)) body: z.output<typeof joinRequestSchema>,
    @CurrentViewer() viewer: RequestViewer,
  ) {
    return this.groups.join(viewer, id, body.reason);
  }

  @Post(':id/leave')
  @HttpCode(200)
  @RequireAuth()
  async leave(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() viewer: RequestViewer) {
    await this.groups.leave(viewer, id);
    return { ok: true };
  }

  @Delete(':id/request')
  @RequireAuth()
  async cancelRequest(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() viewer: RequestViewer) {
    await this.groups.cancelRequest(viewer, id);
    return { ok: true };
  }

  // ----- Grup liderleri -----

  @Get(':id/requests')
  @RequireAuth()
  async requests(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() viewer: RequestViewer) {
    if (!(await this.groups.canManage(viewer, id))) throw Errors.forbidden();
    return this.groups.pendingRequests(id);
  }

  @Post('requests/:requestId')
  @HttpCode(200)
  @RequireAuth()
  async handleRequest(
    @Param('requestId', new ZodPipe(idParam)) requestId: number,
    @Body(new ZodPipe(handleRequestSchema)) body: z.output<typeof handleRequestSchema>,
    @CurrentViewer() viewer: RequestViewer,
  ) {
    await this.groups.handleRequest(viewer, requestId, body.approve, body.response);
    return { ok: true };
  }

  @Post(':id/members')
  @HttpCode(200)
  @RequireAuth()
  async addMember(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(addMemberSchema)) body: z.output<typeof addMemberSchema>,
    @CurrentViewer() viewer: RequestViewer,
  ) {
    await this.groups.addByManager(viewer, id, body.userId, body.asPrimary, body.expiresAt);
    return { ok: true };
  }

  @Delete(':id/members/:userId')
  @RequireAuth()
  async removeMember(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Param('userId', new ZodPipe(idParam)) userId: number,
    @CurrentViewer() viewer: RequestViewer,
  ) {
    await this.groups.removeByManager(viewer, id, userId);
    return { ok: true };
  }
}
