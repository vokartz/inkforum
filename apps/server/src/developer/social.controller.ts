import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { socialCompleteSchema, type SocialProvider } from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { AllowIncomplete, RateLimit, RequireAuth } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { SocialService } from './social.service.js';

const providerParam = z.enum(['discord', 'google', 'github']);
const startQuery = z.object({ mode: z.enum(['login', 'link']).default('login'), next: z.string().max(300).default('/') });

/** Sosyal giriş: sağlayıcıya yönlendirme, dönüş, şifresiz kayıt ve hesap bağlama. */
@Controller()
@AllowIncomplete()
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get('auth/social/providers')
  providers() {
    return this.social.enabled();
  }

  @Get('auth/social/:provider/start')
  @RateLimit({ limit: 30, windowMs: MINUTE })
  start(@Param('provider', new ZodPipe(providerParam)) p: SocialProvider, @Query() q: unknown, @CurrentViewer() v: RequestViewer, @Res() res: Response) {
    const { mode, next } = parse(startQuery, q);
    res.redirect(302, this.social.start(p, mode, next, v, res));
  }

  @Get('auth/social/:provider/callback')
  async callback(@Param('provider', new ZodPipe(providerParam)) p: SocialProvider, @Query() q: Record<string, unknown>, @Req() req: Request, @CurrentViewer() v: RequestViewer, @Res() res: Response) {
    res.redirect(302, await this.social.callback(p, q, req, res, v));
  }

  @Get('auth/social/pending')
  pending(@Req() req: Request) {
    return this.social.pending(req);
  }

  @Post('auth/social/complete')
  @HttpCode(201)
  @RateLimit({ limit: 10, windowMs: 10 * MINUTE })
  complete(@Body(new ZodPipe(socialCompleteSchema)) body: z.output<typeof socialCompleteSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentViewer() v: RequestViewer) {
    return this.social.complete(req, res, v, body);
  }

  @Get('me/identities')
  @RequireAuth()
  identities(@CurrentViewer() v: RequestViewer) {
    return this.social.identities(v.user!.id);
  }

  @Delete('me/identities/:provider')
  @RequireAuth()
  async unlink(@Param('provider', new ZodPipe(providerParam)) p: SocialProvider, @CurrentViewer() v: RequestViewer) {
    await this.social.unlink(v, p);
    return { ok: true };
  }
}
