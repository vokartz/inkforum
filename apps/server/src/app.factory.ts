import 'reflect-metadata';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { WafService } from './security/waf.service.js';
import { ViewerService } from './auth/viewer.service.js';
import { ExtensionsService } from './extensions/extensions.service.js';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/config.js';
import { ForumLogger } from './common/logger.js';
import { EMOJI_DIR } from './common/emoji.js';
import { startInternalBridge, type BridgeRequest, type BridgeResponse } from './internal-bridge.js';

type Handler = (req: Request, res: Response, next: NextFunction) => void;

declare global {
  var __FORUM_API_INJECT__: ((opts: BridgeRequest) => Promise<BridgeResponse>) | undefined;
}

const API_OR_UPLOADS = /^\/(api|uploads|emoji|ext-assets)(\/|$)/;

export async function createApp(config: AppConfig, opts: { mountWeb?: boolean } = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    bodyParser: false,
    bufferLogs: !config.isTest,
    logger: config.isTest ? ['error', 'warn'] : new ForumLogger(),
  });
  const server = app.getHttpAdapter().getInstance() as express.Express;
  server.set('trust proxy', config.trustProxy);
  server.disable('x-powered-by');
  server.set('case sensitive routing', true);
  server.set('strict routing', false);

  const waf = app.get(WafService);
  const viewers = app.get(ViewerService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    waf
      .middleware(req, res, next, async () => {
        req.viewer ??= await viewers.fromRequest(req);
        return !!req.viewer.user;
      })
      .catch(next);
  });

  app.use(
    '/api',
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
    express.json({ limit: '1mb' }),
    express.urlencoded({ extended: false, limit: '1mb' }),
    (_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.use(
    '/uploads',
    express.static(config.uploadsDir, {
      immutable: true,
      maxAge: '365d',
      index: false,
      dotfiles: 'deny',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
      },
    }),
  );
  app.use('/emoji', express.static(EMOJI_DIR, { immutable: true, maxAge: '365d', index: false, dotfiles: 'deny', fallthrough: false }));
  const extensions = app.get(ExtensionsService);
  app.use('/ext-assets', (req: Request, res: Response, next: NextFunction) => {
    const m = /^\/([a-z][a-z0-9-]{1,39})\/(.+)$/.exec(req.path);
    let file = '';
    try {
      file = m ? decodeURIComponent(m[2]!) : '';
    } catch {
    }
    const path = m && file ? extensions.assetPath(m[1]!, file) : null;
    if (!path) return void res.status(404).end();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.sendFile(path, { dotfiles: 'deny' }, (err) => err && next(err));
  });
  app.setGlobalPrefix('api');

  if (opts.mountWeb && config.webBuildDir) {
    if (config.appUrlMode === 'env') process.env.ORIGIN ??= config.appOrigin;
    else process.env.PROTOCOL_HEADER ??= 'x-forwarded-proto';
    process.env.BODY_SIZE_LIMIT ??= '1M';
    const mod = (await import(pathToFileURL(join(config.webBuildDir, 'handler.js')).href)) as { handler: Handler };
    app.use((req: Request, res: Response, next: NextFunction) =>
      API_OR_UPLOADS.test(req.path) ? next() : mod.handler(req, res, next),
    );
    const bridge = await startInternalBridge(server);
    globalThis.__FORUM_API_INJECT__ = bridge.inject;
    app.getHttpServer().on('close', () => void bridge.close());
  }

  app.enableShutdownHooks();
  return app;
}
