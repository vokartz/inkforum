import { Body, Controller, Get, HttpCode, Post, Put, UploadedFile } from '@nestjs/common';
import type { z } from 'zod';
import { homeLayoutSchema } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { ImageUpload, type UploadedImage } from '../common/upload.js';
import { Errors } from '../common/errors.js';
import { HomeService } from './home.service.js';

@Controller()
export class HomeController {
  constructor(private readonly home: HomeService) {}

  /** Ziyaretçiye göre ana sayfa blokları. */
  @Get('home')
  layout(@CurrentViewer() v: RequestViewer) {
    return this.home.layout(v);
  }

  @Get('admin/home')
  @AdminEndpoint('admin.settings')
  async list() {
    return { blocks: await this.home.adminList() };
  }

  @Put('admin/home')
  @AdminEndpoint('admin.settings')
  async save(@Body(new ZodPipe(homeLayoutSchema)) body: z.output<typeof homeLayoutSchema>, @CurrentViewer() v: RequestViewer) {
    await this.home.save(v, body);
    return { ok: true };
  }

  @Post('admin/home/images')
  @HttpCode(200)
  @AdminEndpoint('admin.settings')
  @ImageUpload(4 * 1024 * 1024)
  async image(@UploadedFile() file: UploadedImage | undefined, @CurrentViewer() v: RequestViewer) {
    if (!file) throw Errors.field('file', 'Bir görsel seçin.');
    return this.home.uploadImage(v, file);
  }
}
