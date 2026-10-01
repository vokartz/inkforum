import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UploadedFile } from '@nestjs/common';
import { z } from 'zod';
import { emojiUpdateSchema, idParam } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { ImageUpload, type UploadedImage } from '../common/upload.js';
import { Errors } from '../common/errors.js';
import { EmojisService } from './emojis.service.js';

const uploadFields = z.object({ shortcode: z.string().max(40).optional(), category: z.string().max(40).optional() });

@Controller()
export class EmojisController {
  constructor(private readonly emojis: EmojisService) {}

  /** Etkin özel emojiler (seçici ve istemci önizlemesi için). */
  @Get('emojis')
  list() {
    return this.emojis.enabled();
  }

  @Get('admin/emojis')
  @AdminEndpoint('admin.forum.manage')
  async adminList() {
    return { items: await this.emojis.adminList() };
  }

  @Post('admin/emojis')
  @HttpCode(201)
  @AdminEndpoint('admin.forum.manage')
  @ImageUpload(512 * 1024)
  upload(@UploadedFile() file: UploadedImage | undefined, @Body(new ZodPipe(uploadFields)) body: z.output<typeof uploadFields>, @CurrentViewer() v: RequestViewer) {
    if (!file) throw Errors.field('file', 'Bir görsel seçin.');
    return this.emojis.upload(v, file, body);
  }

  @Put('admin/emojis/:id')
  @AdminEndpoint('admin.forum.manage')
  update(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(emojiUpdateSchema)) body: z.output<typeof emojiUpdateSchema>, @CurrentViewer() v: RequestViewer) {
    return this.emojis.update(v, id, body);
  }

  @Delete('admin/emojis/:id')
  @AdminEndpoint('admin.forum.manage')
  async remove(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.emojis.remove(v, id);
    return { ok: true };
  }
}
