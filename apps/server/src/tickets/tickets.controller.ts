import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UploadedFile } from '@nestjs/common';
import { z } from 'zod';
import {
  idParam,
  ticketCategoryInput,
  ticketCreateInput,
  ticketReplyInput,
  ticketUpdateInput,
  type TicketCategoryInput,
  type TicketCreateInput,
  type TicketReplyInput,
  type TicketUpdateInput,
} from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { AdminEndpoint, Plugin, RateLimit, RequireAuth } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { TicketsService } from './tickets.service.js';
import { Errors } from '../common/errors.js';
import { ImageUpload, type UploadedImage } from '../common/upload.js';

const deskQuery = z.object({
  status: z.string().max(20).optional(),
  category: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

@Controller()
@Plugin('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get('tickets/categories')
  @RequireAuth()
  categories() {
    return this.tickets.categories();
  }

  @Get('tickets')
  @RequireAuth()
  async mine(@CurrentViewer() v: RequestViewer) {
    return { items: await this.tickets.mine(v), counts: await this.tickets.counts(v) };
  }

  @Get('tickets/desk')
  @RequireAuth()
  desk(@Query() query: unknown, @CurrentViewer() v: RequestViewer) {
    const q = parse(deskQuery, query);
    return this.tickets.desk(v, { status: q.status, categoryId: q.category, page: q.page });
  }

  @Post('tickets')
  @HttpCode(201)
  @RequireAuth()
  @RateLimit({ limit: 10, windowMs: 10 * MINUTE, by: 'user' })
  create(@Body(new ZodPipe(ticketCreateInput)) body: TicketCreateInput, @CurrentViewer() v: RequestViewer) {
    return this.tickets.create(v, body);
  }

  @Post('tickets/images')
  @HttpCode(201)
  @RequireAuth()
  @ImageUpload(8 * 1024 * 1024)
  @RateLimit({ limit: 30, windowMs: 10 * MINUTE, by: 'user' })
  image(@UploadedFile() file: UploadedImage | undefined, @CurrentViewer() v: RequestViewer) {
    if (!file) throw Errors.field('file', 'Bir görsel seçin.');
    return this.tickets.uploadImage(v, file);
  }

  @Get('tickets/:id')
  @RequireAuth()
  detail(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.tickets.detail(v, id);
  }

  @Post('tickets/:id/messages')
  @HttpCode(201)
  @RequireAuth()
  @RateLimit({ limit: 30, windowMs: 10 * MINUTE, by: 'user' })
  async reply(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(ticketReplyInput)) body: TicketReplyInput, @CurrentViewer() v: RequestViewer) {
    await this.tickets.reply(v, id, body);
    return { ok: true };
  }

  @Patch('tickets/:id')
  @RequireAuth()
  async update(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(ticketUpdateInput)) body: TicketUpdateInput, @CurrentViewer() v: RequestViewer) {
    await this.tickets.update(v, id, body);
    return { ok: true };
  }

  @Get('admin/ticket-categories')
  @AdminEndpoint('admin.tickets')
  async adminCategories() {
    return { items: await this.tickets.adminCategories() };
  }

  @Get('admin/ticket-categories/handlers')
  @AdminEndpoint('admin.tickets')
  async handlers(@Query('groups') groups?: string) {
    const list = String(groups ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
    return { items: await this.tickets.handlerCandidates(list) };
  }

  @Post('admin/ticket-categories')
  @HttpCode(201)
  @AdminEndpoint('admin.tickets')
  async createCategory(@Body(new ZodPipe(ticketCategoryInput)) body: TicketCategoryInput, @CurrentViewer() v: RequestViewer) {
    await this.tickets.saveCategory(v, null, body);
    return { ok: true };
  }

  @Put('admin/ticket-categories/:id')
  @AdminEndpoint('admin.tickets')
  async updateCategory(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(ticketCategoryInput)) body: TicketCategoryInput, @CurrentViewer() v: RequestViewer) {
    await this.tickets.saveCategory(v, id, body);
    return { ok: true };
  }

  @Delete('admin/ticket-categories/:id')
  @AdminEndpoint('admin.tickets')
  async deleteCategory(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.tickets.deleteCategory(v, id);
    return { ok: true };
  }
}
