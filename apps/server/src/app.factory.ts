import 'reflect-metadata';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { WafService } from './security/waf.service.js';
import { ViewerService } from './auth/viewer.service.js';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/config.js';
import { ForumLogger } from './common/logger.js';
import { EMOJI_DIR } from './common/emoji.js';
import { startInternalBridge, type BridgeRequest, type BridgeResponse } from './internal-bridge.js';

type Handler = (req: Request, res: Response, next: NextFunction) => void;

declare global {
  // SvelteKit SSR'ın API'yi ağ kullanmadan (aynı process içinde) çağırması için.
  var __FORUM_API_INJECT__: ((opts: BridgeRequest) => Promise<BridgeResponse>) | undefined;
}

const API_OR_UPLOADS = /^\/(api|uploads|emoji)(\/|$)/;

export async function createApp(config: AppConfig, opts: { mountWeb?: boolean } = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    bodyParser: false,
    bufferLogs: !config.isTest,
    logger: config.isTest ? ['error', 'warn'] : new ForumLogger(),
  });
  const server = app.getHttpAdapter().getInstance() as express.Express;
  server.set('trust proxy', config.trustProxy);
  server.disable('x-powered-by');
  // Yollar harfe duyarlı: /api/Messages, /api/messages ile aynı uç noktaya gitmez
  server.set('case sensitive routing', true);
  server.set('strict routing', false);

  // Güvenlik duvarı: her istekten (sayfa, API, dosya) önce; kapalıyken hiçbir şey yapmaz
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
  // Twemoji görselleri (mesajlardaki emojiler, tepkiler, emoji seçici)
  app.use('/emoji', express.static(EMOJI_DIR, { immutable: true, maxAge: '365d', index: false, dotfiles: 'deny', fallthrough: false }));
  app.setGlobalPrefix('api');

  if (opts.mountWeb && config.webBuildDir) {
    // adapter-node ortam değişkenleri handler yüklenmeden önce ayarlanmalı.
    process.env.ORIGIN ??= config.appOrigin;
    process.env.BODY_SIZE_LIMIT ??= '1M';
    const mod = (await import(pathToFileURL(join(config.webBuildDir, 'handler.js')).href)) as { handler: Handler };
    // Nest rotaları init sırasında kaydedilir; bu ara katman init'ten önce eklendiği için API'den önce çalışır
    // ama /api ve /uploads isteklerini Nest'e bırakır.
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
