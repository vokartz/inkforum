import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UploadedFile } from '@nestjs/common';
import { z } from 'zod';
import { LOCALES, idParam, pagination, twoFactorCodeSchema } from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { RateLimit, RequireAuth, RequirePermission } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { Errors } from '../common/errors.js';
import { MINUTE } from '../common/clock.js';
import { ImageUpload, type UploadedImage } from '../common/upload.js';
import { ProfilesService } from './profiles.service.js';
import {
  displayNameChangeSchema,
  emailChangeSchema,
  preferencesSchema,
  privacySchema,
  profileUpdateSchema,
  signatureSchema,
  usernameChangeSchema,
} from './profiles.schemas.js';
import { SessionService } from '../auth/session.service.js';
import { TwoFactorService } from '../auth/two-factor.service.js';
import { PasswordHasher } from '../security/password-hasher.js';
import { GroupsService } from '../groups/groups.service.js';
import { PoliciesService } from '../policies/policies.service.js';
import { WarningsService } from '../warnings/warnings.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AchievementsService } from '../achievements/achievements.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';

const passwordSchema = z.object({ password: z.string().min(1, 'Şifrenizi girin.').max(256) });
const disable2faSchema = z.object({ password: z.string().min(1, 'Şifrenizi girin.').max(256), code: twoFactorCodeSchema });
const confirm2faSchema = z.object({ code: twoFactorCodeSchema });
const primaryGroupSchema = z.object({ groupId: z.number().int().positive().nullable() });
const markReadSchema = z.object({ ids: z.union([z.literal('all'), z.array(z.number().int().positive()).max(200)]) });
const notificationPrefsSchema = z.record(z.string(), z.boolean());
const featuredSchema = z.object({ achievementIds: z.array(z.number().int().positive()).max(20) });

const languageSchema = z.object({ locale: z.union([z.literal(''), z.enum(LOCALES)]) });

@Controller('me')
@RequireAuth()
export class MeController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly sessions: SessionService,
    private readonly twoFactor: TwoFactorService,
    private readonly hasher: PasswordHasher,
    private readonly groups: GroupsService,
    private readonly policies: PoliciesService,
    private readonly warnings: WarningsService,
    private readonly notifications: NotificationsService,
    private readonly achievements: AchievementsService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  @Get('profile')
  async profile(@CurrentViewer() v: RequestViewer) {
    return this.profiles.editData(v, v.user!.id);
  }

  @Put('profile')
  async updateProfile(@Body(new ZodPipe(profileUpdateSchema)) body: z.output<typeof profileUpdateSchema>, @CurrentViewer() v: RequestViewer) {
    await this.profiles.updateProfile(v, v.user!.id, body);
    return { ok: true };
  }

  @Put('signature')
  async signature(@Body(new ZodPipe(signatureSchema)) body: z.output<typeof signatureSchema>, @CurrentViewer() v: RequestViewer) {
    await this.profiles.updateSignature(v, v.user!.id, body.signature);
    return { ok: true };
  }

  @Put('privacy')
  async privacy(@Body(new ZodPipe(privacySchema)) body: z.output<typeof privacySchema>, @CurrentViewer() v: RequestViewer) {
    await this.profiles.updatePrivacy(v.user!.id, body);
    return { ok: true };
  }

  @Put('preferences')
  async preferences(@Body(new ZodPipe(preferencesSchema)) body: z.output<typeof preferencesSchema>, @CurrentViewer() v: RequestViewer) {
    await this.profiles.updatePreferences(v.user!.id, body);
    return { ok: true };
  }

  @Put('language')
  async language(@Body(new ZodPipe(languageSchema)) body: z.output<typeof languageSchema>, @CurrentViewer() v: RequestViewer) {
    await this.users.update(v.user!.id, { locale: body.locale });
    return { ok: true };
  }

  @Post('avatar')
  @HttpCode(200)
  @ImageUpload(10 * 1024 * 1024)
  @RateLimit({ limit: 20, windowMs: 10 * MINUTE, by: 'user' })
  async uploadAvatar(@UploadedFile() file: UploadedImage | undefined, @CurrentViewer() v: RequestViewer) {
    if (!file) throw Errors.field('file', 'Bir görsel seçin.');
    return { avatarUrl: await this.profiles.setAvatar(v, v.user!.id, file.buffer) };
  }

  @Post('cover')
  @HttpCode(200)
  @ImageUpload(20 * 1024 * 1024)
  @RateLimit({ limit: 20, windowMs: 10 * MINUTE, by: 'user' })
  async uploadCover(@UploadedFile() file: UploadedImage | undefined, @CurrentViewer() v: RequestViewer) {
    if (!file) throw Errors.field('file', 'Bir görsel seçin.');
    return this.profiles.setCover(v, v.user!.id, file.buffer);
  }

  @Put('cover')
  async coverPosition(@Body(new ZodPipe(z.object({ offset: z.number().min(0).max(100) }))) body: { offset: number }, @CurrentViewer() v: RequestViewer) {
    await this.profiles.setCoverOffset(v, v.user!.id, body.offset);
    return { ok: true };
  }

  @Delete('cover')
  async deleteCover(@CurrentViewer() v: RequestViewer) {
    await this.profiles.setCover(v, v.user!.id, null);
    return { ok: true };
  }

  @Delete('avatar')
  async deleteAvatar(@CurrentViewer() v: RequestViewer) {
    await this.profiles.setAvatar(v, v.user!.id, null);
    return { ok: true };
  }

  @Post('username')
  @HttpCode(200)
  async username(@Body(new ZodPipe(usernameChangeSchema)) body: z.output<typeof usernameChangeSchema>, @CurrentViewer() v: RequestViewer) {
    await this.profiles.changeUsername(v, v.user!.id, body.username);
    return { ok: true };
  }

  @Post('display-name')
  @HttpCode(200)
  async displayName(
    @Body(new ZodPipe(displayNameChangeSchema)) body: z.output<typeof displayNameChangeSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.profiles.changeDisplayName(v, v.user!.id, body.displayName);
    return { ok: true };
  }

  @Post('email')
  @HttpCode(200)
  @RateLimit({ limit: 5, windowMs: 30 * MINUTE, by: 'user' })
  async email(@Body(new ZodPipe(emailChangeSchema)) body: z.output<typeof emailChangeSchema>, @CurrentViewer() v: RequestViewer) {
    await this.profiles.requestEmailChange(v, body.email, body.password);
    return { ok: true };
  }

  @Get('sessions')
  async sessionList(@CurrentViewer() v: RequestViewer) {
    return this.sessions.list(v.user!.id, v.session?.id ?? null);
  }

  @Delete('sessions/:id')
  async revokeSession(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    if (id === v.session?.id) throw Errors.badRequest('Mevcut oturumu kapatmak için çıkış yapın.');
    if (!(await this.sessions.revokeForUser(v.user!.id, id))) throw Errors.notFound('Oturum bulunamadı.');
    return { ok: true };
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  async revokeOthers(@CurrentViewer() v: RequestViewer) {
    const count = await this.sessions.revokeAll(v.user!.id, v.session?.id);
    await this.audit.log({ type: 'security', action: 'sessions.revoke_others', actorId: v.user!.id, targetType: 'user', targetId: v.user!.id, ip: v.ip, data: { count } });
    return { revoked: count };
  }

  @Get('2fa')
  async twoFactorStatus(@CurrentViewer() v: RequestViewer) {
    const enabled = await this.twoFactor.isEnabled(v.user!.id);
    return { enabled, remainingRecoveryCodes: enabled ? await this.twoFactor.remainingCodes(v.user!.id) : 0 };
  }

  @Post('2fa/setup')
  @HttpCode(200)
  async twoFactorSetup(@CurrentViewer() v: RequestViewer) {
    return this.twoFactor.beginSetup(v.user!.id, v.user!.username);
  }

  @Post('2fa/confirm')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 10 * MINUTE, by: 'user' })
  async twoFactorConfirm(@Body(new ZodPipe(confirm2faSchema)) body: z.output<typeof confirm2faSchema>, @CurrentViewer() v: RequestViewer) {
    const recoveryCodes = await this.twoFactor.confirmSetup(v.user!.id, body.code);
    await this.audit.log({ type: 'security', action: '2fa.enabled', actorId: v.user!.id, targetType: 'user', targetId: v.user!.id, ip: v.ip });
    return { recoveryCodes };
  }

  @Post('2fa/disable')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 10 * MINUTE, by: 'user' })
  async twoFactorDisable(@Body(new ZodPipe(disable2faSchema)) body: z.output<typeof disable2faSchema>, @CurrentViewer() v: RequestViewer) {
    if (!(await this.hasher.verify(v.user!.password_hash, body.password))) throw Errors.field('password', 'Şifre hatalı.');
    if (!(await this.twoFactor.verify(v.user!.id, body.code))) throw Errors.field('code', 'Doğrulama kodu hatalı.');
    await this.twoFactor.disable(v.user!.id);
    await this.audit.log({ type: 'security', action: '2fa.disabled', actorId: v.user!.id, targetType: 'user', targetId: v.user!.id, ip: v.ip });
    return { ok: true };
  }

  @Post('2fa/recovery-codes')
  @HttpCode(200)
  @RateLimit({ limit: 5, windowMs: 10 * MINUTE, by: 'user' })
  async regenerateCodes(@Body(new ZodPipe(passwordSchema)) body: z.output<typeof passwordSchema>, @CurrentViewer() v: RequestViewer) {
    if (!(await this.hasher.verify(v.user!.password_hash, body.password))) throw Errors.field('password', 'Şifre hatalı.');
    return { recoveryCodes: await this.twoFactor.regenerateCodes(v.user!.id) };
  }

  @Get('groups')
  async myGroups(@CurrentViewer() v: RequestViewer) {
    const memberships = await this.groups.userMemberships(v.user!.id);
    const all = await this.groups.listVisible(v);
    return {
      ...memberships,
      joinable: all.filter((g) => !g.isMember && g.kind === 'regular' && g.joinType !== 'closed' && !g.isProtected),
    };
  }

  @Post('groups/primary')
  @HttpCode(200)
  async setPrimary(@Body(new ZodPipe(primaryGroupSchema)) body: z.output<typeof primaryGroupSchema>, @CurrentViewer() v: RequestViewer) {
    await this.groups.setOwnPrimary(v, body.groupId);
    return { ok: true };
  }

  @Get('policies')
  async policyHistory(@CurrentViewer() v: RequestViewer) {
    return this.policies.history(v.user!.id, v.locale);
  }

  @Get('warnings')
  @RequirePermission('warnings.view.own')
  async myWarnings(@CurrentViewer() v: RequestViewer) {
    return { status: await this.warnings.status(v.user!.id), items: await this.warnings.forUser(v.user!.id, false) };
  }

  @Get('notifications')
  async notificationList(@Query() query: Record<string, unknown>, @CurrentViewer() v: RequestViewer) {
    const { page, perPage } = parse(pagination, query);
    return this.notifications.list(v.user!.id, page, perPage, query.unread === '1');
  }

  @Post('notifications/read')
  @HttpCode(200)
  async markRead(@Body(new ZodPipe(markReadSchema)) body: z.output<typeof markReadSchema>, @CurrentViewer() v: RequestViewer) {
    await this.notifications.markRead(v.user!.id, body.ids);
    return { ok: true };
  }

  @Delete('notifications/:id')
  async deleteNotification(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.notifications.delete(v.user!.id, id);
    return { ok: true };
  }

  @Get('notifications/preferences')
  async notificationPrefs(@CurrentViewer() v: RequestViewer) {
    return this.notifications.preferences(v.user!.id);
  }

  @Put('notifications/preferences')
  async setNotificationPrefs(@Body(new ZodPipe(notificationPrefsSchema)) body: Record<string, boolean>, @CurrentViewer() v: RequestViewer) {
    await this.notifications.setPreferences(v.user!.id, body);
    return { ok: true };
  }

  @Get('achievements')
  async myAchievements(@CurrentViewer() v: RequestViewer) {
    return this.achievements.forUser(v.user!.id);
  }

  @Put('achievements/featured')
  async setFeatured(@Body(new ZodPipe(featuredSchema)) body: z.output<typeof featuredSchema>, @CurrentViewer() v: RequestViewer) {
    await this.achievements.setFeatured(v.user!.id, body.achievementIds);
    return { ok: true };
  }
}
