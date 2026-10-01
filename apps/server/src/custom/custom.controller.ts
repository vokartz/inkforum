import { All, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, Res, UploadedFile } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { customSettingsInput, idParam, pageInput, pageTestInput, PAGE_SLUG, snippetInput, type PageServerResponse } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AllowBeforeInstall, AdminEndpoint, RateLimit, RequireAuth } from '../common/decorators.js';
import { CurrentViewer, can, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { CustomService } from './custom.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { Errors } from '../common/errors.js';
import { ImageUpload, type UploadedImage } from '../common/upload.js';
import { ViewerService } from '../auth/viewer.service.js';

const landingSchema = z.object({ id: z.number().int().positive().nullable() });

const slugParam = z.string().trim().toLowerCase().max(60).regex(PAGE_SLUG);
const routeQuery = z.object({ path: z.string().trim().min(1).max(300) });

/** Sorgu dizesini düz metin değerlere indirger (dizi parametrelerin ilki alınır) */
function flatQuery(q: unknown, skip: string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  if (q && typeof q === 'object')
    for (const [k, v] of Object.entries(q as Record<string, unknown>)) {
      if (skip.includes(k)) continue;
      const val = Array.isArray(v) ? v[0] : v;
      if (typeof val === 'string' && k.length <= 100) out[k] = val.slice(0, 2000);
    }
  return out;
}
const canManagePages = (v: RequestViewer) => can(v, 'admin.access') && (can(v, 'admin.pages.manage') || can(v, 'admin.customCode'));

@Controller()
export class CustomController {
  constructor(
    private readonly custom: CustomService,
    private readonly settings: SettingsService,
    private readonly viewers: ViewerService,
  ) {}

  /** Ziyaretçiye göre özel kod paketi (parçacıklar, CSS, CSP ekleri). */
  @Get('custom')
  @AllowBeforeInstall()
  forViewer(@CurrentViewer() v: RequestViewer) {
    return this.custom.forViewer(v);
  }

  @Get('pages/:slug')
  page(@Param('slug', new ZodPipe(slugParam)) slug: string, @Query() query: unknown, @CurrentViewer() v: RequestViewer) {
    return this.custom.page(v, slug, canManagePages(v), { query: flatQuery(query) });
  }

  /** Kök adresli sayfa (/ucp, /ucp/karakterler…): en uzun eşleşen sayfa */
  @Get('page-route')
  pageByRoute(@Query(new ZodPipe(routeQuery)) q: z.output<typeof routeQuery>, @Query() query: unknown, @CurrentViewer() v: RequestViewer) {
    return this.custom.pageByRoute(v, q.path, canManagePages(v), flatQuery(query, ['path']));
  }

  /** Sayfanın sunucu kodu API'si: /api/page-api/:slug/… (GET, POST, PUT, PATCH, DELETE) */
  @All(['page-api/:slug', 'page-api/:slug/*rest'])
  @RateLimit({ limit: 120, windowMs: MINUTE })
  async pageApi(@Param('slug', new ZodPipe(slugParam)) slug: string, @Req() req: Request, @Res() res: Response, @CurrentViewer() v: RequestViewer) {
    const rest = String((req.params as Record<string, unknown>).rest ?? '')
      .split(',')
      .join('/');
    const contentType = String(req.headers['content-type'] ?? '');
    const out = await this.custom.pageApi(v, slug, {
      method: req.method.toUpperCase(),
      path: `/${rest}`.replace(/\/+$/, '') || '/',
      query: flatQuery(req.query),
      body: req.body ?? null,
      headers: { 'content-type': contentType, accept: String(req.headers.accept ?? ''), referer: String(req.headers.referer ?? ''), 'user-agent': String(req.headers['user-agent'] ?? '') },
    });
    send(res, out);
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

  /** Sunucu kodunu dener (kaydetmeden de): yanıt, günlükler ve süre döner */
  @Post('admin/pages/:id/test')
  @HttpCode(200)
  @AdminEndpoint('admin.customCode')
  @RateLimit({ limit: 120, windowMs: MINUTE, by: 'user' })
  async testPage(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(pageTestInput)) body: z.output<typeof pageTestInput>, @CurrentViewer() v: RequestViewer) {
    return this.custom.testPage(v, id, body, await this.viewers.forUser(null, null, v.ip, v.userAgent));
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

/** Sunucu kodunun yanıtını HTTP yanıtına çevirir. HTML yanıtlar betik çalıştıramaz (CSP). */
function send(res: Response, out: PageServerResponse): void {
  if (out.type === 'redirect') return res.redirect(out.status, out.url);
  if (out.type === 'none') return void res.status(204).end();
  if (out.type === 'status') return void res.status(out.status).end();
  for (const [k, val] of Object.entries(out.headers)) res.setHeader(k, val);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (out.type === 'json') return void res.status(out.status).json(out.body);
  if (out.type === 'html') {
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src * data:; style-src 'unsafe-inline'; font-src *; form-action 'self'");
    if (!res.getHeader('content-type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
  } else if (!res.getHeader('content-type')) res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(out.status).send(out.body);
}
