import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { installUpdateInput, updateSettingsInput, type UpdateSettingsInput } from '@forum/shared';
import { z } from 'zod';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint, RateLimit, RequirePermission } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { UpdatesService } from './updates.service.js';

@Controller('admin/updates')
export class UpdatesController {
  constructor(private readonly updates: UpdatesService) {}

  @Get()
  @AdminEndpoint('admin.maintenance')
  async status(@CurrentViewer() v: RequestViewer, @Query('refresh') refresh?: string) {
    return { ...(await this.updates.status(refresh === '1', v.locale ?? 'tr')), hasPrevious: this.updates.hasPrevious() };
  }

  /** Yönetim menüsü rozeti (yeniden doğrulama gerektirmez) */
  @Get('summary')
  @RequirePermission('admin.access')
  summary() {
    return this.updates.summary();
  }

  @Put('settings')
  @AdminEndpoint('admin.maintenance')
  async saveSettings(@Body(new ZodPipe(updateSettingsInput)) body: UpdateSettingsInput, @CurrentViewer() v: RequestViewer) {
    await this.updates.saveSettings(body, v.user!.id);
    return { ok: true };
  }

  @Post('install')
  @HttpCode(202)
  @AdminEndpoint('admin.maintenance')
  @RateLimit({ limit: 5, windowMs: MINUTE, by: 'user' })
  install(@Body(new ZodPipe(installUpdateInput)) body: z.output<typeof installUpdateInput>, @CurrentViewer() v: RequestViewer) {
    return this.updates.install(body.version, v.user!.id);
  }

  @Post('rollback')
  @HttpCode(202)
  @AdminEndpoint('admin.maintenance')
  async rollback(@CurrentViewer() v: RequestViewer) {
    await this.updates.rollback(v.user!.id);
    return { ok: true };
  }
}
