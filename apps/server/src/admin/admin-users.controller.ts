import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UploadedFile } from '@nestjs/common';
import { z } from 'zod';
import { idParam } from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { AdminEndpoint } from '../common/decorators.js';
import { CurrentViewer, can, type RequestViewer } from '../common/request-context.js';
import { Errors } from '../common/errors.js';
import { ImageUpload, type UploadedImage } from '../common/upload.js';
import { AdminUsersService, adminUserListSchema, adminUserUpdateSchema } from './admin-users.service.js';
import { GroupsService } from '../groups/groups.service.js';
import { userGroupsSchema } from '../groups/groups.schemas.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { displayNameChangeSchema, profileUpdateSchema, signatureSchema, usernameChangeSchema } from '../profiles/profiles.schemas.js';
import { SessionService } from '../auth/session.service.js';
import { TwoFactorService } from '../auth/two-factor.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BansService } from '../bans/bans.service.js';
import { AchievementsService } from '../achievements/achievements.service.js';
import { WarningsService } from '../warnings/warnings.service.js';

const rejectSchema = z.object({ reason: z.string().trim().max(500).nullable().default(null) });
const noteSchema = z.object({ body: z.string().trim().min(1, 'Not boş olamaz.').max(2000) });
const broadcastSchema = z.object({ message: z.string().trim().min(1).max(1000), groupId: z.number().int().positive().nullable().default(null) });

@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly admin: AdminUsersService,
    private readonly groups: GroupsService,
    private readonly profiles: ProfilesService,
    private readonly sessions: SessionService,
    private readonly twoFactor: TwoFactorService,
    private readonly audit: AuditService,
    private readonly bans: BansService,
    private readonly achievements: AchievementsService,
    private readonly warnings: WarningsService,
  ) {}

  @Get()
  @AdminEndpoint('admin.users.view')
  async list(@Query() query: unknown, @CurrentViewer() v: RequestViewer) {
    return { ...(await this.admin.list(v, parse(adminUserListSchema, query))), counts: await this.admin.counts() };
  }

  @Post('broadcast')
  @HttpCode(200)
  @AdminEndpoint('admin.users.edit')
  async broadcast(@Body(new ZodPipe(broadcastSchema)) body: z.output<typeof broadcastSchema>, @CurrentViewer() v: RequestViewer) {
    const sent = await this.admin.notifyAll(v, body.message, body.groupId);
    await this.audit.log({ type: 'admin', action: 'notification.broadcast', actorId: v.user!.id, ip: v.ip, data: { sent, groupId: body.groupId } });
    return { sent };
  }

  @Get(':id')
  @AdminEndpoint('admin.users.view')
  async detail(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    const [detail, profile, bans, achievements, warnings, twoFactor] = await Promise.all([
      this.admin.detail(v, id),
      this.profiles.editData(v, id),
      this.bans.forUser(id),
      this.achievements.forUser(id),
      can(v, 'mod.warnings.view') ? this.warnings.forUser(id, true) : Promise.resolve(null),
      this.twoFactor.isEnabled(id),
    ]);
    return { ...detail, profile, bans, achievements, warnings, twoFactorEnabled: twoFactor };
  }

  @Put(':id')
  @AdminEndpoint('admin.users.edit')
  async update(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(adminUserUpdateSchema)) body: z.output<typeof adminUserUpdateSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.admin.update(v, id, body);
    return { ok: true };
  }

  @Put(':id/profile')
  @AdminEndpoint('admin.users.edit')
  async updateProfile(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(profileUpdateSchema)) body: z.output<typeof profileUpdateSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    if (!can(v, 'profile.edit.any')) throw Errors.forbidden('Başka üyelerin profilini düzenleme yetkiniz yok.');
    await this.admin.assertNotProtectedTarget(v, id);
    await this.profiles.updateProfile(v, id, body);
    return { ok: true };
  }

  @Put(':id/signature')
  @AdminEndpoint('admin.users.edit')
  async updateSignature(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(signatureSchema)) body: z.output<typeof signatureSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    if (!can(v, 'profile.edit.any')) throw Errors.forbidden();
    await this.admin.assertNotProtectedTarget(v, id);
    await this.profiles.updateSignature(v, id, body.signature);
    return { ok: true };
  }

  @Post(':id/avatar')
  @HttpCode(200)
  @ImageUpload(10 * 1024 * 1024)
  @AdminEndpoint('admin.users.edit')
  async avatar(@Param('id', new ZodPipe(idParam)) id: number, @UploadedFile() file: UploadedImage | undefined, @CurrentViewer() v: RequestViewer) {
    if (!can(v, 'profile.edit.any')) throw Errors.forbidden();
    await this.admin.assertNotProtectedTarget(v, id);
    return { avatarUrl: await this.profiles.setAvatar(v, id, file?.buffer ?? null) };
  }

  @Delete(':id/avatar')
  @AdminEndpoint('admin.users.edit')
  async removeAvatar(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    if (!can(v, 'profile.edit.any')) throw Errors.forbidden();
    await this.admin.assertNotProtectedTarget(v, id);
    await this.profiles.setAvatar(v, id, null);
    return { ok: true };
  }

  @Post(':id/username')
  @HttpCode(200)
  @AdminEndpoint('admin.users.edit')
  async username(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(usernameChangeSchema)) body: z.output<typeof usernameChangeSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.admin.assertNotProtectedTarget(v, id);
    await this.profiles.changeUsername(v, id, body.username);
    return { ok: true };
  }

  @Post(':id/display-name')
  @HttpCode(200)
  @AdminEndpoint('admin.users.edit')
  async displayName(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(displayNameChangeSchema)) body: z.output<typeof displayNameChangeSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.admin.assertNotProtectedTarget(v, id);
    await this.profiles.changeDisplayName(v, id, body.displayName);
    return { ok: true };
  }

  @Put(':id/groups')
  @AdminEndpoint('admin.users.edit', 'admin.groups.manage')
  async setGroups(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(userGroupsSchema)) body: z.output<typeof userGroupsSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.groups.setUserGroups(v, id, body.primaryGroupId, body.primaryExpiresAt, body.additional);
    await this.audit.log({ type: 'admin', action: 'user.groups', actorId: v.user!.id, targetType: 'user', targetId: id, ip: v.ip, data: body });
    return { ok: true };
  }

  @Post(':id/approve')
  @HttpCode(200)
  @AdminEndpoint('admin.users.approve')
  async approve(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.admin.approve(v, id);
    return { ok: true };
  }

  @Post(':id/reject')
  @HttpCode(200)
  @AdminEndpoint('admin.users.approve')
  async reject(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(rejectSchema)) body: z.output<typeof rejectSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.admin.reject(v, id, body.reason);
    return { ok: true };
  }

  @Post(':id/resend-verification')
  @HttpCode(200)
  @AdminEndpoint('admin.users.approve')
  async resend(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.admin.resendVerification(v, id);
    return { ok: true };
  }

  @Delete(':id')
  @AdminEndpoint('admin.users.delete')
  async delete(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.admin.delete(v, id);
    return { ok: true };
  }

  @Post(':id/sessions/revoke')
  @HttpCode(200)
  @AdminEndpoint('admin.users.edit')
  async revokeSessions(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.admin.assertNotProtectedTarget(v, id);
    const count = await this.sessions.revokeAll(id);
    await this.audit.log({ type: 'admin', action: 'user.sessions_revoke', actorId: v.user!.id, targetType: 'user', targetId: id, ip: v.ip, data: { count } });
    return { revoked: count };
  }

  @Post(':id/2fa/disable')
  @HttpCode(200)
  @AdminEndpoint('admin.users.edit')
  async disable2fa(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.admin.assertNotProtectedTarget(v, id);
    await this.twoFactor.disable(id);
    await this.audit.log({ type: 'admin', action: 'user.2fa_disable', actorId: v.user!.id, targetType: 'user', targetId: id, ip: v.ip });
    return { ok: true };
  }

  @Get(':id/notes')
  @AdminEndpoint('mod.users.notes')
  async notes(@Param('id', new ZodPipe(idParam)) id: number) {
    return this.admin.notes(id);
  }

  @Post(':id/notes')
  @HttpCode(201)
  @AdminEndpoint('mod.users.notes')
  async addNote(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(noteSchema)) body: z.output<typeof noteSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.admin.addNote(v, id, body.body);
    return { ok: true };
  }

  @Delete(':id/notes/:noteId')
  @AdminEndpoint('mod.users.notes')
  async deleteNote(@Param('noteId', new ZodPipe(idParam)) noteId: number) {
    await this.admin.deleteNote(noteId);
    return { ok: true };
  }
}
