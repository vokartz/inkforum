import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UploadedFile } from '@nestjs/common';
import { z } from 'zod';
import { idParam, wikiPageInput, wikiReorderInput, type WikiPageInput, type WikiReorderInput } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { Plugin, RateLimit, RequireAuth } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { ImageUpload, type UploadedImage } from '../common/upload.js';
import { WikiService } from './wiki.service.js';
import { searchIcons } from '../common/icons.js';

const pathQuery = z.string().trim().max(600).regex(/^[a-z0-9/-]*$/i, 'Geçersiz adres.');

@Controller('wiki')
@Plugin('wiki')
export class WikiController {
  constructor(private readonly wiki: WikiService) {}

  @Get()
  index(@CurrentViewer() v: RequestViewer) {
    return this.wiki.index(v);
  }

  /** Sayfa: ?path=kurallar/rol-kurallari */
  @Get('page')
  page(@Query('path', new ZodPipe(pathQuery)) path: string, @CurrentViewer() v: RequestViewer) {
    return this.wiki.page(v, path);
  }

  @Get('search')
  @RateLimit({ limit: 60, windowMs: MINUTE })
  async search(@Query('q') q: string | undefined, @CurrentViewer() v: RequestViewer) {
    return { items: await this.wiki.search(v, String(q ?? '').slice(0, 100)) };
  }

  /** Wiki düzenleyicileri için ikon arama (yönetici olmaları gerekmez) */
  @Get('icons')
  @RequireAuth()
  @RateLimit({ limit: 120, windowMs: MINUTE, by: 'user' })
  icons(@Query('q') q: string | undefined, @CurrentViewer() v: RequestViewer) {
    if (!this.wiki.canEdit(v)) throw Errors.forbidden('Wiki düzenleme yetkiniz yok.');
    return searchIcons(String(q ?? '').slice(0, 60), 160, 'duotone');
  }

  @Get('pages/:id/edit')
  @RequireAuth()
  forEdit(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.wiki.forEdit(v, id);
  }

  @Post('pages')
  @HttpCode(201)
  @RequireAuth()
  @RateLimit({ limit: 30, windowMs: 10 * MINUTE, by: 'user' })
  create(@Body(new ZodPipe(wikiPageInput)) body: WikiPageInput, @CurrentViewer() v: RequestViewer) {
    return this.wiki.save(v, null, body);
  }

  @Put('pages/:id')
  @RequireAuth()
  @RateLimit({ limit: 60, windowMs: 10 * MINUTE, by: 'user' })
  update(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(wikiPageInput)) body: WikiPageInput, @CurrentViewer() v: RequestViewer) {
    return this.wiki.save(v, id, body);
  }

  @Delete('pages/:id')
  @RequireAuth()
  async remove(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.wiki.remove(v, id);
    return { ok: true };
  }

  @Put('order')
  @RequireAuth()
  async reorder(@Body(new ZodPipe(wikiReorderInput)) body: WikiReorderInput, @CurrentViewer() v: RequestViewer) {
    await this.wiki.reorder(v, body);
    return { ok: true };
  }

  @Get('pages/:id/revisions')
  async revisions(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return { items: await this.wiki.revisions(v, id) };
  }

  @Get('pages/:id/revisions/:rev')
  revision(@Param('id', new ZodPipe(idParam)) id: number, @Param('rev', new ZodPipe(idParam)) rev: number, @CurrentViewer() v: RequestViewer) {
    return this.wiki.revision(v, id, rev);
  }

  @Post('images')
  @HttpCode(201)
  @RequireAuth()
  @ImageUpload(8 * 1024 * 1024)
  @RateLimit({ limit: 60, windowMs: 10 * MINUTE, by: 'user' })
  image(@UploadedFile() file: UploadedImage | undefined, @CurrentViewer() v: RequestViewer) {
    if (!file) throw Errors.field('file', 'Bir görsel seçin.');
    return this.wiki.uploadImage(v, file);
  }
}
