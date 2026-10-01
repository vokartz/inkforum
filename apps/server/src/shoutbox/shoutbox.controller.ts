import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { idParam, shoutboxSettingsInput, shoutInput } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint, Plugin, RateLimit, RequireAuth } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { SettingsService } from '../settings/settings.service.js';
import { ShoutboxService } from './shoutbox.service.js';

@Controller()
@Plugin('shoutbox')
export class ShoutboxController {
  constructor(
    private readonly shoutbox: ShoutboxService,
    private readonly settings: SettingsService,
  ) {}

  @Get('shoutbox')
  list(@CurrentViewer() v: RequestViewer) {
    return this.shoutbox.list(v);
  }

  @Post('shoutbox')
  @HttpCode(201)
  @RequireAuth()
  @RateLimit({ limit: 30, windowMs: MINUTE, by: 'user' })
  post(@Body(new ZodPipe(shoutInput)) body: z.output<typeof shoutInput>, @CurrentViewer() v: RequestViewer) {
    return this.shoutbox.post(v, body.body);
  }

  @Delete('shoutbox/:id')
  @RequireAuth()
  async remove(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.shoutbox.delete(v, id);
    return { ok: true };
  }

  @Get('admin/shoutbox')
  @AdminEndpoint('admin.settings')
  async admin() {
    return { settings: this.shoutbox.config(), stats: await this.shoutbox.stats() };
  }

  @Put('admin/shoutbox')
  @AdminEndpoint('admin.settings')
  async save(
    @Body(new ZodPipe(shoutboxSettingsInput)) body: z.output<typeof shoutboxSettingsInput>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.settings.update({ 'shoutbox.config': body }, v.user!.id, { allowHidden: true });
    return { ok: true };
  }

  @Post('admin/shoutbox/clear')
  @HttpCode(200)
  @AdminEndpoint('admin.settings')
  async clear(@CurrentViewer() v: RequestViewer) {
    return { removed: await this.shoutbox.clear(v) };
  }
}
