import { Body, Controller, Get, Header, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint, AllowIncomplete, RateLimit } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { ogCardSchema, ogPreviewInput, type OgCard } from '@forum/shared';
import { SettingsService } from '../settings/settings.service.js';
import { MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { SeoService } from './seo.service.js';

const idPng = z
  .string()
  .regex(/^\d{1,12}(\.png)?$/)
  .transform((s) => Number(s.replace(/\.png$/, '')));
const pageParam = z.coerce.number().int().min(1).max(10_000);

/**
 * Arama motorları ve paylaşım: robots.txt, site haritası verisi, oEmbed, gömülü konu kartı verisi
 * ve paylaşım görselleri. Hepsi herkese açıktır ve yalnızca misafirin görebildiği içeriği döndürür.
 */
@Controller()
@AllowIncomplete()
export class SeoController {
  constructor(
    private readonly seo: SeoService,
    private readonly settings: SettingsService,
  ) {}

  @Get('seo/robots')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  robots() {
    return this.seo.robots();
  }

  @Get('seo/brand')
  brand() {
    return this.seo.brand();
  }

  @Get('seo/sitemap')
  @RateLimit({ limit: 30, windowMs: MINUTE })
  sitemapIndex() {
    return this.seo.sitemapIndex();
  }

  @Get('seo/sitemap/pages')
  @RateLimit({ limit: 30, windowMs: MINUTE })
  sitemapPages() {
    return this.seo.sitemapPages();
  }

  @Get('seo/sitemap/topics/:page')
  @RateLimit({ limit: 30, windowMs: MINUTE })
  sitemapTopics(@Param('page', new ZodPipe(pageParam)) page: number) {
    return this.seo.sitemapTopics(page);
  }

  /** https://oembed.com — ?url=https://site/t/12&format=json */
  @Get('oembed')
  @RateLimit({ limit: 120, windowMs: MINUTE })
  async oembed(@Query('url') url?: string, @Query('format') format?: string, @Query('maxwidth') maxwidth?: string, @Res({ passthrough: true }) res?: Response) {
    if (format && format !== 'json') {
      res?.status(501);
      return { error: 'Yalnızca JSON desteklenir.' };
    }
    const data = await this.seo.oembed(String(url ?? '').slice(0, 2000), Number(maxwidth) || undefined);
    if (!data) throw Errors.notFound('Gömülebilir içerik bulunamadı.');
    res?.setHeader('Access-Control-Allow-Origin', '*');
    res?.setHeader('Cache-Control', 'public, max-age=600');
    return data;
  }

  /** /embed/t/:id sayfasının verisi (WAF muaf: /api/embed/) */
  @Get('embed/topics/:id')
  async topicEmbed(@Param('id', new ZodPipe(idPng)) id: number, @Res({ passthrough: true }) res: Response) {
    const card = await this.seo.topicEmbed(id);
    if (!card) throw Errors.notFound('Konu bulunamadı ya da herkese açık değil.');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return card;
  }

  @Get('og/t/:id')
  @RateLimit({ limit: 60, windowMs: MINUTE })
  async topicImage(@Param('id', new ZodPipe(idPng)) id: number, @Res() res: Response) {
    const png = await this.seo.topicImage(id);
    this.sendImage(res, png);
  }

  @Get('og/page.png')
  @RateLimit({ limit: 60, windowMs: MINUTE })
  async pageImage(@Query('path') path: string | undefined, @Res() res: Response) {
    this.sendImage(res, await this.seo.pageImage(typeof path === 'string' ? path : '/'));
  }

  @Get('og/site.png')
  async siteImage(@Res() res: Response) {
    this.sendImage(res, await this.seo.siteImage());
  }

  // ----- Paylaşım kartı tasarımı (yönetim) -----

  @Put('admin/seo/og-card')
  @AdminEndpoint('admin.settings')
  async saveCard(@Body(new ZodPipe(ogCardSchema)) body: OgCard, @CurrentViewer() v: RequestViewer) {
    await this.settings.update({ 'seo.ogCard': body }, v.user!.id, { allowHidden: true });
    return { ok: true };
  }

  @Post('admin/seo/og-preview')
  @HttpCode(200)
  @AdminEndpoint('admin.settings')
  @RateLimit({ limit: 120, windowMs: MINUTE })
  async preview(@Body(new ZodPipe(ogPreviewInput)) body: z.output<typeof ogPreviewInput>, @Res() res: Response) {
    const img = await this.seo.previewImage(body.card, body.sample);
    res.setHeader('Content-Type', img.type);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
    res.end(img.data);
  }

  private sendImage(res: Response, png: Buffer | null): void {
    if (!png) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.redirect(302, this.seo.fallbackImage());
      return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.end(png);
  }
}
