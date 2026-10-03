import { Body, Controller, Get, HttpCode, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { wafConfigInput, type WafConfigInput } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint, AllowBeforeInstall, AllowIncomplete, RateLimit } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { WafService } from './waf.service.js';

const verifySchema = z.object({
  kind: z.enum(['pow', 'captcha']),
  c: z.string().max(64).optional(),
  n: z.string().max(16).optional(),
  exp: z.number().int().optional(),
  sig: z.string().max(128).optional(),
  token: z.string().max(4096).optional(),
});
const unblockSchema = z.object({ ip: z.string().trim().max(64) });

@Controller()
export class WafController {
  constructor(
    private readonly waf: WafService,
    private readonly audit: AuditService,
  ) {}

  @Post('waf/verify')
  @HttpCode(200)
  @AllowIncomplete()
  @AllowBeforeInstall()
  @RateLimit({ limit: 30, windowMs: MINUTE })
  async verify(@Body(new ZodPipe(verifySchema)) body: z.output<typeof verifySchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ctx = this.waf.context(req, async () => false);
    const ok =
      body.kind === 'pow'
        ? this.waf.verifyPow(ctx.ua, { c: body.c ?? '', n: body.n ?? '', exp: body.exp ?? 0, sig: body.sig ?? '' })
        : await this.waf.verifyCaptcha(body.token ?? '', ctx.ip);
    if (!ok) throw Errors.forbidden('Doğrulama başarısız.');
    this.waf.setClearance(res, ctx.ua);
    this.waf.markPassed(ctx);
    return { ok: true };
  }

  @Get('waf/gate')
  @AllowIncomplete()
  @AllowBeforeInstall()
  async gate(@Query('path') path: string | undefined, @Req() req: Request, @CurrentViewer() v: RequestViewer) {
    if (!this.waf.active()) return { action: 'allow' };
    const url = String(path ?? '/').slice(0, 2000);
    const ctx = { ...this.waf.context(req, async () => !!v.user), method: 'GET', url, path: url.split('?')[0] ?? '/' };
    const d = await this.waf.evaluate(ctx);
    if (d.action === 'allow') return { action: 'allow' };
    const page = d.action === 'block' ? this.waf.blockPage(d.reason, d.status, ctx.locale) : this.waf.challengePage(ctx.ua, url, ctx.ip, ctx.locale);
    return { action: d.action, status: d.action === 'block' ? d.status : 403, html: page.html, csp: this.waf.csp(page.nonce) };
  }

  @Get('admin/waf')
  @AdminEndpoint('admin.settings')
  admin() {
    return this.waf.admin();
  }

  @Put('admin/waf')
  @AdminEndpoint('admin.settings')
  async save(@Body(new ZodPipe(wafConfigInput)) body: WafConfigInput, @CurrentViewer() v: RequestViewer) {
    await this.waf.save(body, v.user!.id);
    await this.audit.log({ type: 'security', action: 'waf.update', actorId: v.user!.id, ip: v.ip, data: { enabled: body.enabled, mode: body.mode, captcha: body.captcha } });
    return this.waf.admin();
  }

  @Post('admin/waf/unblock')
  @HttpCode(200)
  @AdminEndpoint('admin.settings')
  async unblock(@Body(new ZodPipe(unblockSchema)) body: z.output<typeof unblockSchema>, @CurrentViewer() v: RequestViewer) {
    this.waf.unblock(body.ip);
    await this.audit.log({ type: 'security', action: 'waf.unblock', actorId: v.user!.id, ip: v.ip, data: { ip: body.ip } });
    return { ok: true };
  }

  @Get('admin/waf/preview')
  @AdminEndpoint('admin.settings')
  preview(@Req() req: Request, @Res() res: Response) {
    const ctx = this.waf.context(req, async () => false);
    const p = this.waf.challengePage(ctx.ua, '/', ctx.ip, ctx.locale);
    res.setHeader('Content-Security-Policy', this.waf.csp(p.nonce));
    res.type('html').send(p.html);
  }
}
