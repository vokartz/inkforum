import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UploadedFile } from '@nestjs/common';
import { z } from 'zod';
import { idParam, pagination } from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { AdminEndpoint } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { ImageUpload, type UploadedImage } from '../common/upload.js';
import { AchievementsService, achievementInputSchema, categoryInputSchema, TIER_LABELS } from '../achievements/achievements.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Errors } from '../common/errors.js';
import { UsersService } from '../users/users.service.js';

const awardSchema = z.object({
  userId: z.number().int().positive(),
  reason: z.string().trim().max(500).nullable().default(null),
});

@Controller('admin/achievements')
export class AdminAchievementsController {
  constructor(
    private readonly achievements: AchievementsService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @AdminEndpoint('admin.achievements.manage')
  async list() {
    return {
      items: (await this.achievements.all()).map((a) => this.achievements.toDto(a)),
      categories: await this.achievements.categories(),
      criteriaTypes: this.achievements.criteriaTypes(),
      tiers: Object.entries(TIER_LABELS).map(([value, label]) => ({ value: Number(value), label })),
    };
  }

  @Post()
  @HttpCode(201)
  @AdminEndpoint('admin.achievements.manage')
  async create(@Body(new ZodPipe(achievementInputSchema)) body: z.output<typeof achievementInputSchema>, @CurrentViewer() v: RequestViewer) {
    const id = await this.achievements.create(body);
    await this.audit.log({ type: 'admin', action: 'achievement.create', actorId: v.user!.id, targetType: 'achievement', targetId: id, ip: v.ip, data: { key: body.key } });
    return { id };
  }

  @Put(':id')
  @AdminEndpoint('admin.achievements.manage')
  async update(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(achievementInputSchema)) body: z.output<typeof achievementInputSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.achievements.update(id, body);
    await this.audit.log({ type: 'admin', action: 'achievement.update', actorId: v.user!.id, targetType: 'achievement', targetId: id, ip: v.ip });
    return { ok: true };
  }

  @Delete(':id')
  @AdminEndpoint('admin.achievements.manage')
  async delete(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.achievements.delete(id);
    await this.audit.log({ type: 'admin', action: 'achievement.delete', actorId: v.user!.id, targetType: 'achievement', targetId: id, ip: v.ip });
    return { ok: true };
  }

  @Post(':id/icon')
  @HttpCode(200)
  @ImageUpload(2 * 1024 * 1024)
  @AdminEndpoint('admin.achievements.manage')
  async icon(@Param('id', new ZodPipe(idParam)) id: number, @UploadedFile() file: UploadedImage | undefined) {
    if (!file) throw Errors.field('file', 'Bir görsel seçin.');
    await this.achievements.setIcon(id, file.buffer);
    return { ok: true };
  }

  @Delete(':id/icon')
  @AdminEndpoint('admin.achievements.manage')
  async removeIcon(@Param('id', new ZodPipe(idParam)) id: number) {
    await this.achievements.setIcon(id, null);
    return { ok: true };
  }

  @Get(':id/holders')
  @AdminEndpoint('admin.achievements.manage')
  async holders(@Param('id', new ZodPipe(idParam)) id: number, @Query() query: unknown) {
    const { page, perPage } = parse(pagination, query);
    return this.achievements.holders(id, page, perPage);
  }

  @Post(':id/award')
  @HttpCode(200)
  @AdminEndpoint('admin.achievements.manage')
  async award(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(awardSchema)) body: z.output<typeof awardSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    if (!(await this.users.findById(body.userId))) throw Errors.notFound('Üye bulunamadı.');
    const awarded = await this.achievements.award(body.userId, id, 'manual', v.user!.id, body.reason);
    if (!awarded) throw Errors.conflict('Üye bu başarıya zaten sahip.');
    await this.audit.log({ type: 'admin', action: 'achievement.award', actorId: v.user!.id, targetType: 'user', targetId: body.userId, ip: v.ip, data: { achievementId: id, reason: body.reason } });
    return { ok: true };
  }

  @Delete(':id/holders/:userId')
  @AdminEndpoint('admin.achievements.manage')
  async revoke(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Param('userId', new ZodPipe(idParam)) userId: number,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.achievements.revoke(userId, id);
    await this.audit.log({ type: 'admin', action: 'achievement.revoke', actorId: v.user!.id, targetType: 'user', targetId: userId, ip: v.ip, data: { achievementId: id } });
    return { ok: true };
  }

  @Post(':id/backfill')
  @HttpCode(200)
  @AdminEndpoint('admin.achievements.manage')
  async backfill(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.achievements.startBackfill(id);
    await this.audit.log({ type: 'admin', action: 'achievement.backfill', actorId: v.user!.id, targetType: 'achievement', targetId: id, ip: v.ip });
    return { ok: true };
  }

  // ----- Kategoriler -----

  @Post('categories')
  @HttpCode(201)
  @AdminEndpoint('admin.achievements.manage')
  async createCategory(@Body(new ZodPipe(categoryInputSchema)) body: z.output<typeof categoryInputSchema>) {
    return { id: await this.achievements.saveCategory(null, body) };
  }

  @Put('categories/:id')
  @AdminEndpoint('admin.achievements.manage')
  async updateCategory(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(categoryInputSchema)) body: z.output<typeof categoryInputSchema>) {
    await this.achievements.saveCategory(id, body);
    return { ok: true };
  }

  @Delete('categories/:id')
  @AdminEndpoint('admin.achievements.manage')
  async deleteCategory(@Param('id', new ZodPipe(idParam)) id: number) {
    await this.achievements.deleteCategory(id);
    return { ok: true };
  }
}
