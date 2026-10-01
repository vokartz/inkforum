import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UploadedFile } from '@nestjs/common';
import { z } from 'zod';
import {
  boardInputSchema,
  boardModeratorsSchema,
  categoryInputSchema,
  reactionsAdminSchema,
  idParam,
  prefixInputSchema,
  profileInputSchema,
  reorderSchema,
} from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { ImageUpload, type UploadedImage } from '../common/upload.js';
import { Errors } from '../common/errors.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ReactionsService } from './reactions.service.js';
import { ForumAdminService } from './forum-admin.service.js';

const profileValuesSchema = z.object({
  groupId: z.number().int().positive(),
  values: z.record(z.string(), z.union([z.literal(0), z.literal(1), z.literal(-1)])),
});
const deleteBoardSchema = z.object({ moveTopicsTo: z.coerce.number().int().positive().optional() });

@Controller('admin/forum')
export class AdminForumController {
  constructor(
    private readonly admin: ForumAdminService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly reactions: ReactionsService,
  ) {}

  @Get()
  @AdminEndpoint('admin.forum.manage')
  async tree() {
    return { categories: await this.admin.tree(), profiles: await this.admin.profileList(), prefixes: await this.admin.prefixes() };
  }

  @Put('order')
  @AdminEndpoint('admin.forum.manage')
  async reorder(@Body(new ZodPipe(reorderSchema)) body: z.output<typeof reorderSchema>, @CurrentViewer() v: RequestViewer) {
    await this.admin.reorder(v, body);
    return { ok: true };
  }

  @Post('recount')
  @HttpCode(200)
  @AdminEndpoint('admin.forum.manage')
  async recount(@CurrentViewer() v: RequestViewer) {
    await this.admin.recountAll(v);
    return { ok: true };
  }

  // ----- Tepkiler -----

  @Get('reactions')
  @AdminEndpoint('admin.forum.manage')
  async reactionList() {
    return { items: await this.reactions.adminList() };
  }

  @Put('reactions')
  @AdminEndpoint('admin.forum.manage')
  async saveReactions(@Body(new ZodPipe(reactionsAdminSchema)) body: z.output<typeof reactionsAdminSchema>, @CurrentViewer() v: RequestViewer) {
    await this.reactions.save(v, body);
    return { ok: true };
  }

  // ----- Kategoriler -----

  @Post('categories')
  @HttpCode(201)
  @AdminEndpoint('admin.forum.manage')
  async createCategory(@Body(new ZodPipe(categoryInputSchema)) body: z.output<typeof categoryInputSchema>, @CurrentViewer() v: RequestViewer) {
    return { id: await this.admin.createCategory(v, body) };
  }

  @Put('categories/:id')
  @AdminEndpoint('admin.forum.manage')
  async updateCategory(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(categoryInputSchema)) body: z.output<typeof categoryInputSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.admin.updateCategory(v, id, body);
    return { ok: true };
  }

  @Post('categories/:id/background')
  @HttpCode(200)
  @AdminEndpoint('admin.forum.manage')
  @ImageUpload(4 * 1024 * 1024)
  async categoryBackground(@Param('id', new ZodPipe(idParam)) id: number, @UploadedFile() file: UploadedImage | undefined, @CurrentViewer() v: RequestViewer) {
    if (!file) throw Errors.field('file', 'Bir görsel seçin.');
    return this.admin.setCategoryBackground(v, id, file);
  }

  @Delete('categories/:id/background')
  @AdminEndpoint('admin.forum.manage')
  async removeCategoryBackground(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.admin.setCategoryBackground(v, id, null);
    return { ok: true };
  }

  @Delete('categories/:id')
  @AdminEndpoint('admin.forum.manage')
  async deleteCategory(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.admin.deleteCategory(v, id);
    return { ok: true };
  }

  // ----- Bölümler -----

  @Post('boards')
  @HttpCode(201)
  @AdminEndpoint('admin.forum.manage')
  async createBoard(@Body(new ZodPipe(boardInputSchema)) body: z.output<typeof boardInputSchema>, @CurrentViewer() v: RequestViewer) {
    return { id: await this.admin.createBoard(v, body) };
  }

  @Put('boards/:id')
  @AdminEndpoint('admin.forum.manage')
  async updateBoard(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(boardInputSchema)) body: z.output<typeof boardInputSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.admin.updateBoard(v, id, body);
    return { ok: true };
  }

  @Post('boards/:id/icon')
  @HttpCode(200)
  @AdminEndpoint('admin.forum.manage')
  @ImageUpload(2 * 1024 * 1024)
  async icon(@Param('id', new ZodPipe(idParam)) id: number, @UploadedFile() file: UploadedImage | undefined, @CurrentViewer() v: RequestViewer) {
    if (!file) throw Errors.field('file', 'Bir görsel seçin.');
    return this.admin.uploadIcon(v, id, file);
  }

  @Post('boards/:id/cover')
  @HttpCode(200)
  @AdminEndpoint('admin.forum.manage')
  @ImageUpload(6 * 1024 * 1024)
  async cover(@Param('id', new ZodPipe(idParam)) id: number, @UploadedFile() file: UploadedImage | undefined, @CurrentViewer() v: RequestViewer) {
    if (!file) throw Errors.field('file', 'Bir görsel seçin.');
    return this.admin.setBoardCover(v, id, file);
  }

  @Delete('boards/:id/cover')
  @AdminEndpoint('admin.forum.manage')
  async removeCover(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.admin.setBoardCover(v, id, null);
    return { ok: true };
  }

  @Put('boards/:id/moderators')
  @AdminEndpoint('admin.forum.manage')
  async moderators(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(boardModeratorsSchema)) body: z.output<typeof boardModeratorsSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.admin.setModerators(v, id, body.userIds, body.groupIds);
    return { ok: true };
  }

  @Delete('boards/:id')
  @AdminEndpoint('admin.forum.manage')
  async deleteBoard(@Param('id', new ZodPipe(idParam)) id: number, @Query(new ZodPipe(deleteBoardSchema)) q: z.output<typeof deleteBoardSchema>, @CurrentViewer() v: RequestViewer) {
    await this.admin.deleteBoard(v, id, q.moveTopicsTo ?? null);
    return { ok: true };
  }

  // ----- Önekler -----

  @Post('prefixes')
  @HttpCode(201)
  @AdminEndpoint('admin.forum.manage')
  async createPrefix(@Body(new ZodPipe(prefixInputSchema)) body: z.output<typeof prefixInputSchema>, @CurrentViewer() v: RequestViewer) {
    return { id: await this.admin.createPrefix(v, body) };
  }

  @Put('prefixes/:id')
  @AdminEndpoint('admin.forum.manage')
  async updatePrefix(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(prefixInputSchema)) body: z.output<typeof prefixInputSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.admin.updatePrefix(v, id, body);
    return { ok: true };
  }

  @Delete('prefixes/:id')
  @AdminEndpoint('admin.forum.manage')
  async deletePrefix(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.admin.deletePrefix(v, id);
    return { ok: true };
  }

  // ----- Yetki profilleri -----

  @Get('profiles')
  @AdminEndpoint('admin.permissions.manage')
  profiles() {
    return this.admin.profileList();
  }

  @Post('profiles')
  @HttpCode(201)
  @AdminEndpoint('admin.permissions.manage')
  async createProfile(@Body(new ZodPipe(profileInputSchema)) body: z.output<typeof profileInputSchema>, @CurrentViewer() v: RequestViewer) {
    const id = await this.permissions.createProfile(body);
    await this.audit.log({ type: 'admin', action: 'permissions.profile.create', actorId: v.user!.id, targetType: 'profile', targetId: id, ip: v.ip, data: { name: body.name } });
    return { id };
  }

  @Get('profiles/:id')
  @AdminEndpoint('admin.permissions.manage')
  profile(@Param('id', new ZodPipe(idParam)) id: number) {
    return this.admin.profileMatrix(id);
  }

  @Put('profiles/:id')
  @AdminEndpoint('admin.permissions.manage')
  async updateProfile(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(profileInputSchema)) body: z.output<typeof profileInputSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.permissions.updateProfile(id, body);
    await this.audit.log({ type: 'admin', action: 'permissions.profile.update', actorId: v.user!.id, targetType: 'profile', targetId: id, ip: v.ip, data: { name: body.name } });
    return { ok: true };
  }

  @Put('profiles/:id/values')
  @AdminEndpoint('admin.permissions.manage')
  async setValues(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(profileValuesSchema)) body: z.output<typeof profileValuesSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.permissions.setProfilePermissions(id, body.groupId, body.values);
    await this.audit.log({ type: 'admin', action: 'permissions.profile.values', actorId: v.user!.id, targetType: 'profile', targetId: id, ip: v.ip, data: body });
    return { ok: true };
  }

  @Delete('profiles/:id')
  @AdminEndpoint('admin.permissions.manage')
  async deleteProfile(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.permissions.deleteProfile(id);
    await this.audit.log({ type: 'admin', action: 'permissions.profile.delete', actorId: v.user!.id, targetType: 'profile', targetId: id, ip: v.ip });
    return { ok: true };
  }
}
