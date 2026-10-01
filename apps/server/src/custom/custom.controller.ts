import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UploadedFile } from '@nestjs/common';
import { z } from 'zod';
import { customSettingsInput, idParam, pageInput, PAGE_SLUG, snippetInput } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AllowBeforeInstall, AdminEndpoint, RateLimit, RequireAuth } from '../common/decorators.js';
import { CurrentViewer, can, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { CustomService } from './custom.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { Errors } from '../common/errors.js';
import { ImageUpload, type UploadedImage } from '../common/upload.js';

const landingSchema = z.object({ id: z.number().int().positive().nullable() });
const builderPreviewSchema = z.object({ body: z.string().max(500_000) });

const slugParam = z.string().trim().toLowerCase().max(60).regex(PAGE_SLUG);

@Controller()
export class CustomController {
  constructor(
    private readonly custom: CustomService,
    private readonly settings: SettingsService,
  ) {}

  /** Ziyaretçiye göre özel kod paketi (parçacıklar, CSS, CSP ekleri). */
  @Get('custom')
  @AllowBeforeInstall()
  forViewer(@CurrentViewer() v: RequestViewer) {
    return this.custom.forViewer(v);
  }

  @Get('pages/:slug')
  page(@Param('slug', new ZodPipe(slugParam)) slug: string, @CurrentViewer() v: RequestViewer) {
    return this.custom.page(v, slug, can(v, 'admin.access') && (can(v, 'admin.pages.manage') || can(v, 'admin.customCode')));
  }

  /** UCP ve benzeri dış sistemler için kısa ömürlü imzalı kimlik belirteci. */
  @Post('me/integration-token')
  @HttpCode(200)
  @RequireAuth()
  @RateLimit({ limit: 30, windowMs: MINUTE, by: 'user' })
  token(@CurrentViewer() v: RequestViewer) {
    return this.custom.integrationToken(v);
  }

  // ---------- Özel kod ----------

  @Get('admin/custom')
  @AdminEndpoint('admin.customCode')
  admin() {
    return this.custom.admin();
  }

  @Put('admin/custom/settings')
  @AdminEndpoint('admin.customCode')
  async saveSettings(@Body(new ZodPipe(customSettingsInput)) body: z.output<typeof customSettingsInput>, @CurrentViewer() v: RequestViewer) {
    await this.custom.saveSettings(v, body);
    return { ok: true };
  }

  @Post('admin/custom/snippets')
  @HttpCode(201)
  @AdminEndpoint('admin.customCode')
  createSnippet(@Body(new ZodPipe(snippetInput)) body: z.output<typeof snippetInput>, @CurrentViewer() v: RequestViewer) {
    return this.custom.saveSnippet(v, null, body);
  }

  @Put('admin/custom/snippets/:id')
  @AdminEndpoint('admin.customCode')
  updateSnippet(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(snippetInput)) body: z.output<typeof snippetInput>, @CurrentViewer() v: RequestViewer) {
    return this.custom.saveSnippet(v, id, body);
  }

  @Delete('admin/custom/snippets/:id')
  @AdminEndpoint('admin.customCode')
  async deleteSnippet(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.custom.deleteSnippet(v, id);
    return { ok: true };
  }

  @Post('admin/custom/secret')
  @HttpCode(200)
  @AdminEndpoint('admin.customCode')
  rotateSecret(@CurrentViewer() v: RequestViewer) {
    return this.custom.rotateSecret(v);
  }

  @Delete('admin/custom/secret')
  @AdminEndpoint('admin.customCode')
  async removeSecret(@CurrentViewer() v: RequestViewer) {
    await this.custom.removeSecret(v);
    return { ok: true };
  }

  // ---------- Sayfalar ----------

  @Get('admin/pages')
  @AdminEndpoint('admin.pages.manage')
  async pages(@CurrentViewer() v: RequestViewer) {
    return { pages: await this.custom.adminPages(), canCode: can(v, 'admin.customCode'), landingSlug: this.settings.landing() || null };
  }

  /** Açılış sayfası seçimi (null = forum dizini ana sayfa olur) */
  @Put('admin/pages/landing')
  @AdminEndpoint('admin.pages.manage')
  async setLanding(@Body(new ZodPipe(landingSchema)) body: z.output<typeof landingSchema>, @CurrentViewer() v: RequestViewer) {
    await this.custom.setLanding(v, body.id);
    return { ok: true };
  }

  /** Sayfa oluşturucu canlı önizleme: kaydetmeden blokları çözümler */
  @Post('admin/pages/builder-preview')
  @HttpCode(200)
  @AdminEndpoint('admin.pages.manage')
  @RateLimit({ limit: 240, windowMs: MINUTE, by: 'user' })
  async builderPreview(@Body(new ZodPipe(builderPreviewSchema)) body: z.output<typeof builderPreviewSchema>, @CurrentViewer() v: RequestViewer) {
    return { blocks: await this.custom.previewBuilder(v, body.body, can(v, 'admin.customCode')) };
  }

  @Post('admin/pages/images')
  @HttpCode(200)
  @AdminEndpoint('admin.pages.manage')
  @ImageUpload(8 * 1024 * 1024)
  @RateLimit({ limit: 120, windowMs: 10 * MINUTE, by: 'user' })
  async pageImage(@UploadedFile() file: UploadedImage | undefined, @CurrentViewer() v: RequestViewer) {
    if (!file) throw Errors.field('file', 'Bir görsel seçin.');
    return this.custom.uploadImage(v, file);
  }

  @Get('admin/pages/:id')
  @AdminEndpoint('admin.pages.manage')
  async adminPage(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return { page: await this.custom.adminPage(id), canCode: can(v, 'admin.customCode'), landingSlug: this.settings.landing() || null };
  }

  @Post('admin/pages')
  @HttpCode(201)
  @AdminEndpoint('admin.pages.manage')
  createPage(@Body(new ZodPipe(pageInput)) body: z.output<typeof pageInput>, @CurrentViewer() v: RequestViewer) {
    return this.custom.savePage(v, null, body, can(v, 'admin.customCode'));
  }

  @Put('admin/pages/:id')
  @AdminEndpoint('admin.pages.manage')
  updatePage(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(pageInput)) body: z.output<typeof pageInput>, @CurrentViewer() v: RequestViewer) {
    return this.custom.savePage(v, id, body, can(v, 'admin.customCode'));
  }

  @Delete('admin/pages/:id')
  @AdminEndpoint('admin.pages.manage')
  async deletePage(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.custom.deletePage(v, id, can(v, 'admin.customCode'));
    return { ok: true };
  }
}
