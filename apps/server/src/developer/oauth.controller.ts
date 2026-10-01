import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodPipe, parse } from '../common/validation.js';
import { RateLimit, RequireAuth, SkipOriginCheck } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { OAuthError, OAuthService, type AuthorizeParams } from './oauth.service.js';

const authorizeQuery = z.object({
  client_id: z.string().max(100),
  redirect_uri: z.string().max(500),
  response_type: z.string().max(20).default('code'),
  scope: z.string().max(200).default(''),
  state: z.string().max(500).optional(),
  code_challenge: z.string().max(200).optional(),
  code_challenge_method: z.string().max(10).optional(),
});
const decideBody = authorizeQuery.extend({ approve: z.boolean() });

const toParams = (q: z.output<typeof authorizeQuery>): AuthorizeParams => ({
  clientId: q.client_id,
  redirectUri: q.redirect_uri,
  responseType: q.response_type,
  scope: q.scope,
  state: q.state ?? null,
  codeChallenge: q.code_challenge ?? null,
  codeChallengeMethod: q.code_challenge_method ?? null,
});

/** OAuth 2.0 sağlayıcı uç noktaları (Authorization Code + PKCE, yenileme belirteci). */
@Controller()
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Get('oauth/metadata')
  metadata() {
    return this.oauth.metadata();
  }

  /** Onay ekranı için uygulama ve izin bilgisi. */
  @Get('oauth/authorize')
  @RequireAuth()
  info(@Query() q: unknown, @CurrentViewer() v: RequestViewer) {
    return this.oauth.authorizeInfo(v, toParams(parse(authorizeQuery, q)));
  }

  /** Üyenin kararı: uygulamanın yönlendirme adresi (kod ya da hata ile) döner. */
  @Post('oauth/authorize')
  @HttpCode(200)
  @RequireAuth()
  @RateLimit({ limit: 30, windowMs: MINUTE, by: 'user' })
  decide(@Body(new ZodPipe(decideBody)) body: z.output<typeof decideBody>, @CurrentViewer() v: RequestViewer) {
    return this.oauth.decide(v, toParams(body), body.approve);
  }

  @Post('oauth/token')
  @SkipOriginCheck()
  @RateLimit({ limit: 60, windowMs: MINUTE })
  async token(@Body() body: Record<string, unknown>, @Headers('authorization') auth: string | undefined, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.status(200).json(await this.oauth.token(auth, body ?? {}));
    } catch (err) {
      if (err instanceof OAuthError) {
        if (err.status === 401) res.setHeader('WWW-Authenticate', 'Basic realm="oauth"');
        res.status(err.status).json({ error: err.error, error_description: err.description });
      } else throw err;
    }
  }

  @Post('oauth/revoke')
  @HttpCode(200)
  @SkipOriginCheck()
  @RateLimit({ limit: 60, windowMs: MINUTE })
  async revoke(@Body() body: Record<string, unknown>, @Headers('authorization') auth: string | undefined, @Res() res: Response) {
    try {
      await this.oauth.revoke(auth, body ?? {});
      res.status(200).json({});
    } catch (err) {
      if (err instanceof OAuthError) res.status(err.status).json({ error: err.error, error_description: err.description });
      else throw err;
    }
  }

  @Get('oauth/userinfo')
  @RequireAuth()
  userinfo(@CurrentViewer() v: RequestViewer) {
    return this.oauth.userinfo(v);
  }

  // ---------- Üyenin bağlı uygulamaları ----------

  @Get('me/apps')
  @RequireAuth()
  apps(@CurrentViewer() v: RequestViewer) {
    return this.oauth.userApps(v.user!.id);
  }

  @Delete('me/apps/:clientId')
  @RequireAuth()
  async revokeApp(@Param('clientId') clientId: string, @CurrentViewer() v: RequestViewer) {
    await this.oauth.revokeApp(v.user!.id, String(clientId).slice(0, 100));
    return { ok: true };
  }
}
