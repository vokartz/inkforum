import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { idParam, pagination, tokenSchema } from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { AllowIncomplete, RateLimit, RequirePermission } from '../common/decorators.js';
import { CurrentViewer, can, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { ProfilesService } from './profiles.service.js';
import { memberListSchema } from './profiles.schemas.js';
import { AchievementsService } from '../achievements/achievements.service.js';
import { PoliciesService } from '../policies/policies.service.js';
import { SettingsService } from '../settings/settings.service.js';

@Controller()
export class UsersController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly achievements: AchievementsService,
    private readonly policies: PoliciesService,
    private readonly settings: SettingsService,
  ) {}

  @Get('users/:id')
  @RequirePermission('profile.view')
  async profile(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.profiles.publicProfile(v, id);
  }

  @Get('users/:id/achievements')
  @RequirePermission('profile.view', 'achievements.view')
  async userAchievements(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    const profile = await this.profiles.publicProfile(v, id);
    if (!profile.achievements.total && v.user?.id !== id && !can(v, 'admin.users.view')) return [];
    return this.achievements.forUser(id);
  }

  @Get('members')
  @RequirePermission('members.list')
  async members(@Query() query: unknown, @CurrentViewer() v: RequestViewer) {
    return this.profiles.memberList(v, parse(memberListSchema, query));
  }

  @Get('online')
  @RequirePermission('online.view')
  async online(@CurrentViewer() v: RequestViewer) {
    return this.profiles.online(v);
  }

  @Get('birthdays')
  async birthdays() {
    return this.profiles.birthdaysToday();
  }

  @Get('achievements')
  @RequirePermission('achievements.view')
  async catalog(@CurrentViewer() v: RequestViewer) {
    if (!this.settings.get('achievements.enabled')) throw Errors.notFound('Başarı sistemi kapalı.');
    return this.achievements.catalog(v.user?.id ?? null);
  }

  @Get('achievements/:id/holders')
  @RequirePermission('achievements.view')
  async holders(@Param('id', new ZodPipe(idParam)) id: number, @Query() query: unknown) {
    const { page, perPage } = parse(pagination, query);
    const a = (await this.achievements.all()).find((x) => x.id === id);
    if (!a || a.is_hidden === 1 || a.is_active !== 1) throw Errors.notFound('Başarı bulunamadı.');
    return this.achievements.holders(id, page, perPage);
  }

  @Get('policies')
  @AllowIncomplete()
  async policyList(@CurrentViewer() v: RequestViewer) {
    return { items: await this.policies.list(v.locale) };
  }

  @Get('policies/:key')
  @AllowIncomplete()
  async policy(@Param('key') key: string, @CurrentViewer() v: RequestViewer) {
    return this.policies.getByKey(key, v.user?.id ?? null, v.locale);
  }


  @Post('auth/email-change/confirm')
  @HttpCode(200)
  @AllowIncomplete()
  @RateLimit({ limit: 20, windowMs: 10 * MINUTE })
  async confirmEmail(@Body(new ZodPipe(tokenSchema)) body: z.output<typeof tokenSchema>, @CurrentViewer() v: RequestViewer) {
    await this.profiles.confirmEmailChange(body.token, v.ip);
    return { ok: true };
  }
}
