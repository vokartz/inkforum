import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { idParam } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { PoliciesService } from '../policies/policies.service.js';
import { ProfileFieldsService, profileFieldInputSchema } from '../profiles/profile-fields.service.js';
import { AuditService } from '../audit/audit.service.js';

const newPolicySchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{1,39}$/, 'Anahtar küçük harfle başlamalı; a-z, 0-9 ve - içerebilir.'),
  isRequired: z.boolean().default(true),
  showOnRegister: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  title: z.string().trim().min(1, 'Başlık gerekli.').max(120),
  bodyMd: z.string().min(1, 'Metin gerekli.').max(200_000),
});

const policyPatchSchema = z.object({
  isRequired: z.boolean().optional(),
  showOnRegister: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const versionSchema = z.object({
  title: z.string().trim().min(1, 'Başlık gerekli.').max(120),
  bodyMd: z.string().min(1, 'Metin gerekli.').max(200_000),
  requiresReacceptance: z.boolean().default(false),
  changeNote: z.string().trim().max(500).nullable().default(null),
});

@Controller('admin')
export class AdminContentController {
  constructor(
    private readonly policies: PoliciesService,
    private readonly fields: ProfileFieldsService,
    private readonly audit: AuditService,
  ) {}

  // ----- Politikalar -----

  @Get('policies')
  @AdminEndpoint('admin.policies.manage')
  async policyList() {
    return this.policies.adminList();
  }

  @Post('policies')
  @HttpCode(201)
  @AdminEndpoint('admin.policies.manage')
  async createPolicy(@Body(new ZodPipe(newPolicySchema)) body: z.output<typeof newPolicySchema>, @CurrentViewer() v: RequestViewer) {
    const id = await this.policies.createPolicy(body);
    await this.audit.log({ type: 'admin', action: 'policy.create', actorId: v.user!.id, targetType: 'policy', targetId: id, ip: v.ip, data: { key: body.key } });
    return { id };
  }

  @Put('policies/:id')
  @AdminEndpoint('admin.policies.manage')
  async updatePolicy(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(policyPatchSchema)) body: z.output<typeof policyPatchSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.policies.updatePolicy(id, body);
    await this.audit.log({ type: 'admin', action: 'policy.update', actorId: v.user!.id, targetType: 'policy', targetId: id, ip: v.ip, data: body });
    return { ok: true };
  }

  @Post('policies/:id/versions')
  @HttpCode(201)
  @AdminEndpoint('admin.policies.manage')
  async createVersion(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(versionSchema)) body: z.output<typeof versionSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    return { id: await this.policies.createVersion(id, body, v.user!.id) };
  }

  @Get('policy-versions/:id')
  @AdminEndpoint('admin.policies.manage')
  async version(@Param('id', new ZodPipe(idParam)) id: number) {
    return this.policies.adminVersion(id);
  }

  @Put('policy-versions/:id')
  @AdminEndpoint('admin.policies.manage')
  async updateVersion(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(versionSchema)) body: z.output<typeof versionSchema>) {
    await this.policies.updateDraft(id, body);
    return { ok: true };
  }

  @Delete('policy-versions/:id')
  @AdminEndpoint('admin.policies.manage')
  async deleteVersion(@Param('id', new ZodPipe(idParam)) id: number) {
    await this.policies.deleteDraft(id);
    return { ok: true };
  }

  @Post('policy-versions/:id/publish')
  @HttpCode(200)
  @AdminEndpoint('admin.policies.manage')
  async publish(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    const result = await this.policies.publish(id);
    await this.audit.log({ type: 'admin', action: 'policy.publish', actorId: v.user!.id, targetType: 'policy_version', targetId: id, ip: v.ip, data: result });
    return result;
  }


  // ----- Özel profil alanları -----

  @Get('profile-fields')
  @AdminEndpoint('admin.profileFields.manage')
  async fieldList() {
    return this.fields.all();
  }

  @Post('profile-fields')
  @HttpCode(201)
  @AdminEndpoint('admin.profileFields.manage')
  async createField(@Body(new ZodPipe(profileFieldInputSchema)) body: z.output<typeof profileFieldInputSchema>, @CurrentViewer() v: RequestViewer) {
    const id = await this.fields.create(body);
    await this.audit.log({ type: 'admin', action: 'profile_field.create', actorId: v.user!.id, targetType: 'profile_field', targetId: id, ip: v.ip, data: { key: body.key } });
    return { id };
  }

  @Put('profile-fields/:id')
  @AdminEndpoint('admin.profileFields.manage')
  async updateField(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(profileFieldInputSchema)) body: z.output<typeof profileFieldInputSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.fields.update(id, body);
    await this.audit.log({ type: 'admin', action: 'profile_field.update', actorId: v.user!.id, targetType: 'profile_field', targetId: id, ip: v.ip });
    return { ok: true };
  }

  @Delete('profile-fields/:id')
  @AdminEndpoint('admin.profileFields.manage')
  async deleteField(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.fields.delete(id);
    await this.audit.log({ type: 'admin', action: 'profile_field.delete', actorId: v.user!.id, targetType: 'profile_field', targetId: id, ip: v.ip });
    return { ok: true };
  }
}
