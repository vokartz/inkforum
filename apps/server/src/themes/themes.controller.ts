import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { idParam, themeInput } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { ThemesService } from './themes.service.js';

const createSchema = z.object({
  name: z.string().trim().min(1, 'Tema adı gerekli.').max(60),
  preset: z.string().trim().max(40).nullable().default(null),
  copyOf: z.number().int().positive().nullable().default(null),
  /** İçe aktarılan tema (dışa aktarılan JSON) */
  data: themeInput.nullable().default(null),
});

/** Yönetim → Temalar (tema stüdyosu) */
@Controller('admin/themes')
export class ThemesController {
  constructor(private readonly themes: ThemesService) {}

  @Get()
  @AdminEndpoint('admin.settings')
  async list() {
    return { items: await this.themes.list() };
  }

  @Post()
  @HttpCode(201)
  @AdminEndpoint('admin.settings')
  create(
    @Body(new ZodPipe(createSchema)) body: z.output<typeof createSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    return this.themes.create(v, body);
  }

  @Get(':id')
  @AdminEndpoint('admin.settings')
  get(@Param('id', new ZodPipe(idParam)) id: number) {
    return this.themes.get(id);
  }

  @Put(':id')
  @AdminEndpoint('admin.settings')
  update(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(themeInput)) body: z.output<typeof themeInput>,
    @CurrentViewer() v: RequestViewer,
  ) {
    return this.themes.update(v, id, body);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @AdminEndpoint('admin.settings')
  async activate(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.themes.activate(v, id);
    return { ok: true };
  }

  @Post(':id/reset')
  @HttpCode(200)
  @AdminEndpoint('admin.settings')
  reset(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.themes.reset(v, id);
  }

  @Delete(':id')
  @AdminEndpoint('admin.settings')
  async remove(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.themes.remove(v, id);
    return { ok: true };
  }
}
