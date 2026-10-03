import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { idParam, pagination } from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { RequirePermission } from '../common/decorators.js';
import { CurrentViewer, can, type RequestViewer } from '../common/request-context.js';
import { WarningsService } from './warnings.service.js';
import { issueWarningSchema, revokeWarningSchema } from './warnings.schemas.js';

@Controller('mod')
export class WarningsController {
  constructor(private readonly warnings: WarningsService) {}

  @Get('warnings')
  @RequirePermission('mod.warnings.view')
  async recent(@Query() query: unknown) {
    const { page, perPage } = parse(pagination, query);
    return this.warnings.recent(page, perPage);
  }

  @Get('warning-templates')
  @RequirePermission('mod.warnings.issue')
  async templates() {
    return this.warnings.templates(true);
  }

  @Get('users/:id/warnings')
  @RequirePermission('mod.warnings.view')
  async userWarnings(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return {
      status: await this.warnings.status(id),
      items: await this.warnings.forUser(id, true),
      canIssue: can(v, 'mod.warnings.issue'),
      canRevoke: can(v, 'mod.warnings.revoke'),
    };
  }

  @Post('users/:id/warnings')
  @HttpCode(201)
  @RequirePermission('mod.warnings.issue')
  async issue(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(issueWarningSchema)) body: z.output<typeof issueWarningSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    return { id: await this.warnings.issue(v, id, body) };
  }

  @Post('warnings/:id/revoke')
  @HttpCode(200)
  @RequirePermission('mod.warnings.revoke')
  async revoke(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(revokeWarningSchema)) body: z.output<typeof revokeWarningSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.warnings.revoke(v, id, body.reason);
    return { ok: true };
  }
}
