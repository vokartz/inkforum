import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  applicationDecisionInput,
  applicationFormInput,
  applicationNoteInput,
  applicationSubmitInput,
  idParam,
  type ApplicationFormInput,
  type ApplicationSubmitInput,
} from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { AdminEndpoint, Plugin, RateLimit, RequireAuth } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { ApplicationsService } from './applications.service.js';

const slugParam = z.string().trim().toLowerCase().max(60).regex(/^[a-z0-9-]+$/);
const reviewQuery = z.object({
  status: z.string().max(20).optional(),
  form: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

@Controller()
@Plugin('applications')
export class ApplicationsController {
  constructor(private readonly apps: ApplicationsService) {}

  // ---------- Üye ----------

  @Get('applications')
  list(@CurrentViewer() v: RequestViewer) {
    return this.apps.list(v);
  }

  @Get('applications/mine')
  @RequireAuth()
  async mine(@CurrentViewer() v: RequestViewer) {
    return { items: await this.apps.mine(v) };
  }

  @Get('applications/review')
  @RequireAuth()
  review(@Query() query: unknown, @CurrentViewer() v: RequestViewer) {
    const q = parse(reviewQuery, query);
    return this.apps.reviewList(v, { status: q.status, formId: q.form, page: q.page });
  }

  @Get('applications/forms/:slug')
  form(@Param('slug', new ZodPipe(slugParam)) slug: string, @CurrentViewer() v: RequestViewer) {
    return this.apps.view(v, slug);
  }

  @Post('applications/forms/:slug')
  @HttpCode(201)
  @RequireAuth()
  @RateLimit({ limit: 10, windowMs: 10 * MINUTE, by: 'user' })
  submit(@Param('slug', new ZodPipe(slugParam)) slug: string, @Body(new ZodPipe(applicationSubmitInput)) body: ApplicationSubmitInput, @CurrentViewer() v: RequestViewer) {
    return this.apps.submit(v, slug, body.answers);
  }

  @Get('applications/:id')
  @RequireAuth()
  detail(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.apps.detail(v, id);
  }

  @Post('applications/:id/withdraw')
  @HttpCode(200)
  @RequireAuth()
  async withdraw(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.apps.withdraw(v, id);
    return { ok: true };
  }

  @Post('applications/:id/notes')
  @HttpCode(201)
  @RequireAuth()
  @RateLimit({ limit: 30, windowMs: 10 * MINUTE, by: 'user' })
  async note(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(applicationNoteInput)) body: z.output<typeof applicationNoteInput>, @CurrentViewer() v: RequestViewer) {
    await this.apps.note(v, id, body.body, body.internal);
    return { ok: true };
  }

  @Post('applications/:id/claim')
  @HttpCode(200)
  @RequireAuth()
  async claim(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.apps.claim(v, id);
    return { ok: true };
  }

  @Post('applications/:id/decide')
  @HttpCode(200)
  @RequireAuth()
  async decide(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(applicationDecisionInput)) body: z.output<typeof applicationDecisionInput>, @CurrentViewer() v: RequestViewer) {
    await this.apps.decide(v, id, body.decision, body.reason);
    return { ok: true };
  }

  // ---------- Yönetim ----------

  @Get('admin/application-forms')
  @AdminEndpoint('admin.applications')
  async adminList() {
    return { items: await this.apps.adminList() };
  }

  @Post('admin/application-forms')
  @HttpCode(201)
  @AdminEndpoint('admin.applications')
  create(@Body(new ZodPipe(applicationFormInput)) body: ApplicationFormInput, @CurrentViewer() v: RequestViewer) {
    return this.apps.save(v, null, body);
  }

  @Put('admin/application-forms/:id')
  @AdminEndpoint('admin.applications')
  update(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(applicationFormInput)) body: ApplicationFormInput, @CurrentViewer() v: RequestViewer) {
    return this.apps.save(v, id, body);
  }

  @Delete('admin/application-forms/:id')
  @AdminEndpoint('admin.applications')
  async remove(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.apps.remove(v, id);
    return { ok: true };
  }
}
