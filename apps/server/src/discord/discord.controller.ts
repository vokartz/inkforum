import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { discordSettingsInput } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint, Plugin, RateLimit } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { DiscordService } from './discord.service.js';

@Controller()
@Plugin('discord')
export class DiscordController {
  constructor(private readonly discord: DiscordService) {}

  @Get('discord/widget')
  async widget() {
    return { widget: await this.discord.widget() };
  }

  @Get('admin/discord')
  @AdminEndpoint('admin.settings')
  admin() {
    return this.discord.adminView();
  }

  @Put('admin/discord')
  @AdminEndpoint('admin.settings')
  async save(
    @Body(new ZodPipe(discordSettingsInput)) body: z.output<typeof discordSettingsInput>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.discord.save(body, v.user!.id);
    return { ok: true, widget: await this.discord.widget() };
  }

  @Post('admin/discord/test')
  @HttpCode(200)
  @AdminEndpoint('admin.settings')
  @RateLimit({ limit: 5, windowMs: MINUTE, by: 'user' })
  async test() {
    await this.discord.test();
    return { ok: true };
  }
}
