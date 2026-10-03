import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UploadedFile } from '@nestjs/common';
import { z } from 'zod';
import { APPEARANCE_RESET_PARTS, BRANDING_ASSETS, NAV_BUILTINS, SETTINGS, SOCIAL_PLATFORMS, navTreeSchema, type BrandingAsset } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AllowBeforeInstall, AdminEndpoint } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { ImageUpload, type UploadedImage } from '../common/upload.js';
import { Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AppearanceService } from './appearance.service.js';
import { iconNode, searchIcons } from '../common/icons.js';
import { ExtensionsService } from '../extensions/extensions.service.js';

const assetParam = z.enum(Object.keys(BRANDING_ASSETS) as [BrandingAsset, ...BrandingAsset[]]);
const socialSchema = z.object({ links: SETTINGS['appearance.socialLinks'].schema });
const resetSchema = z.object({ parts: z.array(z.enum(APPEARANCE_RESET_PARTS)).max(APPEARANCE_RESET_PARTS.length).default([]) });
const footerSchema = z.object({ links: SETTINGS['appearance.footerLinks'].schema });

@Controller()
export class AppearanceController {
  constructor(
    private readonly appearance: AppearanceService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly extensions: ExtensionsService,
  ) {}

  @Get('nav')
  @AllowBeforeInstall()
  async nav(@CurrentViewer() v: RequestViewer) {
    const entries = await this.appearance.nav(v);
    const ext = this.extensions.navItems(v).map((n, i) => ({
      id: -(i + 1),
      label: n.label,
      href: n.url,
      icon: iconNode(n.icon, 'bold'),
      newTab: /^https?:\/\//.test(n.url),
      style: 'link' as const,
      children: [],
    }));
    return [...entries, ...ext];
  }

  @Get('admin/appearance')
  @AdminEndpoint('admin.settings')
  async get() {
    return {
      nav: await this.appearance.adminItems(),
      builtins: Object.entries(NAV_BUILTINS).map(([key, b]) => ({ key, ...b })),
      socialPlatforms: SOCIAL_PLATFORMS,
      socialLinks: this.settings.get('appearance.socialLinks'),
      footerLinks: this.settings.get('appearance.footerLinks'),
      assets: Object.fromEntries(Object.entries(BRANDING_ASSETS).map(([k, d]) => [k, { url: this.settings.get(d.setting as never), maxKb: d.maxKb, label: d.label }])),
    };
  }

  @Get('admin/icons')
  @AdminEndpoint()
  icons(@Query('q') q?: string, @Query('weight') weight?: string) {
    const w = weight === 'bold' || weight === 'fill' || weight === 'regular' ? weight : 'duotone';
    return searchIcons(String(q ?? '').slice(0, 60), 160, w);
  }

  @Put('admin/appearance/nav')
  @AdminEndpoint('admin.settings')
  async saveNav(@Body(new ZodPipe(navTreeSchema)) body: z.output<typeof navTreeSchema>, @CurrentViewer() v: RequestViewer) {
    await this.appearance.saveNav(v, body);
    return { ok: true };
  }

  @Put('admin/appearance/social')
  @AdminEndpoint('admin.settings')
  async saveSocial(@Body(new ZodPipe(socialSchema)) body: z.output<typeof socialSchema>, @CurrentViewer() v: RequestViewer) {
    const known = new Set<string>(SOCIAL_PLATFORMS.map((p) => p.key));
    const bad = body.links.findIndex((l) => !known.has(l.platform));
    if (bad !== -1) throw Errors.field(`links.${bad}`, 'Bilinmeyen platform.');
    await this.settings.update({ 'appearance.socialLinks': body.links }, v.user!.id, { allowHidden: true });
    await this.audit.log({ type: 'admin', action: 'appearance.social', actorId: v.user!.id, ip: v.ip });
    return { ok: true };
  }

  @Put('admin/appearance/footer')
  @AdminEndpoint('admin.settings')
  async saveFooter(@Body(new ZodPipe(footerSchema)) body: z.output<typeof footerSchema>, @CurrentViewer() v: RequestViewer) {
    await this.settings.update({ 'appearance.footerLinks': body.links }, v.user!.id, { allowHidden: true });
    await this.audit.log({ type: 'admin', action: 'appearance.footer', actorId: v.user!.id, ip: v.ip });
    return { ok: true };
  }

  @Post('admin/appearance/reset')
  @HttpCode(200)
  @AdminEndpoint('admin.settings')
  async reset(@Body(new ZodPipe(resetSchema)) body: z.output<typeof resetSchema>, @CurrentViewer() v: RequestViewer) {
    await this.appearance.reset(v, body.parts);
    return { ok: true };
  }

  @Post('admin/appearance/assets/:kind')
  @HttpCode(200)
  @AdminEndpoint('admin.settings')
  @ImageUpload(8 * 1024 * 1024)
  async upload(@Param('kind', new ZodPipe(assetParam)) kind: BrandingAsset, @UploadedFile() file: UploadedImage | undefined, @CurrentViewer() v: RequestViewer) {
    if (!file) throw Errors.field('file', 'Bir görsel seçin.');
    return this.appearance.uploadAsset(v, kind, file.buffer);
  }

  @Delete('admin/appearance/assets/:kind')
  @AdminEndpoint('admin.settings')
  async remove(@Param('kind', new ZodPipe(assetParam)) kind: BrandingAsset, @CurrentViewer() v: RequestViewer) {
    await this.appearance.removeAsset(v, kind);
    return { ok: true };
  }
}
