import { All, Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { EXTENSION_ID, extensionStarterQuery, extensionInstallInput, extensionNpmInput, extensionToggleInput, extensionUninstallInput, idParam } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint, AllowBeforeInstall, RateLimit, RequireAuth } from '../common/decorators.js';
import { PostsService } from '../forum/posts.service.js';
import { ForumAccessService } from '../forum/forum-access.service.js';
import { Db } from '../database/db.service.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { ExtensionsService } from './extensions.service.js';
import { MAX_PACKAGE_BYTES } from './package.js';

const extId = z.string().regex(EXTENSION_ID);
const pageKey = z.string().regex(/^[a-z0-9-]{1,40}$/);
const settingsBody = z.record(z.string().max(60), z.unknown());

function flatQuery(q: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (q && typeof q === 'object')
    for (const [k, v] of Object.entries(q as Record<string, unknown>)) {
      const val = Array.isArray(v) ? v[0] : v;
      if (typeof val === 'string' && k.length <= 100) out[k] = val.slice(0, 2000);
    }
  return out;
}

function sendZip(res: Response, filename: string, zip: Buffer): void {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(zip.length));
  res.end(zip);
}

const postIds = z.object({ posts: z.string().max(2000).default('') });

@Controller()
export class ExtensionsController {
  constructor(
    private readonly extensions: ExtensionsService,
    private readonly posts: PostsService,
    private readonly access: ForumAccessService,
    private readonly db: Db,
  ) {}

  @Get('extensions/routes')
  @AllowBeforeInstall()
  routes() {
    return this.extensions.overrides();
  }

  @Get('extensions/topic/:id')
  async topic(@Param('id', new ZodPipe(idParam)) id: number, @Query(new ZodPipe(postIds)) q: z.output<typeof postIds>, @CurrentViewer() v: RequestViewer) {
    const topic = await this.posts.requireTopic(id);
    const access = await this.access.require(v, topic.board_id);
    await this.posts.assertTopicVisible(v, access, topic);
    const ids = q.posts
      .split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 100);
    const rows = ids.length ? await this.db.q.selectFrom('posts').select(['id', 'user_id']).where('topic_id', '=', id).where('id', 'in', ids).execute() : [];
    return this.extensions.topicSlots(v, topic, rows);
  }

  @Get('extensions/board/:id')
  async board(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.access.require(v, id);
    const board = await this.db.q.selectFrom('boards').select(['id', 'name', 'slug']).where('id', '=', id).executeTakeFirst();
    if (!board) throw Errors.notFound('Bölüm bulunamadı.');
    return { boardTop: await this.extensions.boardSlots(v, board) };
  }

  @Get('extensions/account')
  @RequireAuth()
  accountMenu(@CurrentViewer() v: RequestViewer) {
    return this.extensions.accountMenu(v);
  }

  @Get('extensions/account/:id/:key')
  @RequireAuth()
  accountPage(@Param('id', new ZodPipe(extId)) id: string, @Param('key', new ZodPipe(pageKey)) key: string, @Query() query: unknown, @CurrentViewer() v: RequestViewer) {
    return this.extensions.renderAccountPage(v, id, key, flatQuery(query));
  }

  @Get('extensions/client')
  client(@CurrentViewer() v: RequestViewer) {
    return this.extensions.clientBundle(v);
  }

  @Get('extensions/profile/:userId')
  profile(@Param('userId', new ZodPipe(idParam)) userId: number, @CurrentViewer() v: RequestViewer) {
    return this.extensions.profileSlots(v, userId);
  }

  @All(['ext/:id', 'ext/:id/*rest'])
  async dispatch(@Param('id', new ZodPipe(extId)) id: string, @Req() req: Request, @Res() res: Response, @CurrentViewer() v: RequestViewer) {
    const rest = String((req.params as Record<string, unknown>).rest ?? '')
      .split(',')
      .join('/');
    await this.extensions.dispatch(id, rest, req, res, v);
  }
}

@Controller('admin/extensions')
export class AdminExtensionsController {
  constructor(private readonly extensions: ExtensionsService) {}

  @Get()
  @AdminEndpoint('admin.settings')
  overview() {
    return this.extensions.overview();
  }

  @Get('starter')
  @AdminEndpoint('admin.settings')
  starter(@Query(new ZodPipe(extensionStarterQuery)) q: z.output<typeof extensionStarterQuery>, @Res() res: Response) {
    sendZip(res, `${q.id}-baslangic.zip`, this.extensions.starterZip(q.id, q.name));
  }

  @Get('samples')
  @AdminEndpoint('admin.settings')
  samples() {
    return this.extensions.samples();
  }

  @Get('samples/:id/download')
  @AdminEndpoint('admin.settings')
  sampleDownload(@Param('id', new ZodPipe(extId)) id: string, @Res() res: Response) {
    sendZip(res, `${id}.zip`, this.extensions.sampleZip(id));
  }

  @Post('samples/:id/stage')
  @HttpCode(200)
  @AdminEndpoint('admin.extensions')
  sampleStage(@Param('id', new ZodPipe(extId)) id: string) {
    return this.extensions.stageSample(id);
  }

  @Post('upload')
  @HttpCode(200)
  @AdminEndpoint('admin.extensions')
  @RateLimit({ limit: 20, windowMs: 10 * MINUTE, by: 'user' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_PACKAGE_BYTES, files: 1, fields: 2 } }))
  upload(@UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file) throw Errors.field('file', 'Bir eklenti paketi (.zip / .tgz) seçin.');
    return this.extensions.stage(file.buffer, { kind: 'upload' });
  }

  @Post('npm')
  @HttpCode(200)
  @AdminEndpoint('admin.extensions')
  @RateLimit({ limit: 20, windowMs: 10 * MINUTE, by: 'user' })
  npm(@Body(new ZodPipe(extensionNpmInput)) body: z.output<typeof extensionNpmInput>) {
    return this.extensions.stageNpm(body.name, body.version);
  }

  @Post('install')
  @HttpCode(200)
  @AdminEndpoint('admin.extensions')
  install(@Body(new ZodPipe(extensionInstallInput)) body: z.output<typeof extensionInstallInput>, @CurrentViewer() v: RequestViewer) {
    return this.extensions.installStaged(body.token, body.enable, v.user!.id);
  }

  @Post('scan')
  @HttpCode(200)
  @AdminEndpoint('admin.extensions')
  async scan() {
    return { found: await this.extensions.scan() };
  }

  @Get(':id')
  @AdminEndpoint('admin.settings')
  detail(@Param('id', new ZodPipe(extId)) id: string) {
    return this.extensions.detail(id);
  }

  @Put(':id/enabled')
  @AdminEndpoint('admin.extensions')
  toggle(@Param('id', new ZodPipe(extId)) id: string, @Body(new ZodPipe(extensionToggleInput)) body: z.output<typeof extensionToggleInput>, @CurrentViewer() v: RequestViewer) {
    return this.extensions.setEnabled(id, body.enabled, v.user!.id);
  }

  @Post(':id/reload')
  @HttpCode(200)
  @AdminEndpoint('admin.extensions')
  reload(@Param('id', new ZodPipe(extId)) id: string) {
    return this.extensions.reload(id);
  }

  @Put(':id/settings')
  @AdminEndpoint('admin.settings')
  async settings(@Param('id', new ZodPipe(extId)) id: string, @Body(new ZodPipe(settingsBody)) body: Record<string, unknown>, @CurrentViewer() v: RequestViewer) {
    await this.extensions.saveSettings(id, body, v.user!.id);
    return this.extensions.detail(id);
  }

  @Post(':id/uninstall')
  @HttpCode(200)
  @AdminEndpoint('admin.extensions')
  async uninstall(@Param('id', new ZodPipe(extId)) id: string, @Body(new ZodPipe(extensionUninstallInput)) body: z.output<typeof extensionUninstallInput>, @CurrentViewer() v: RequestViewer) {
    await this.extensions.uninstall(id, body.deleteData, v.user!.id);
    return { ok: true };
  }

  @Get(':id/pages/:key')
  @AdminEndpoint()
  page(@Param('id', new ZodPipe(extId)) id: string, @Param('key', new ZodPipe(pageKey)) key: string, @Query() query: unknown, @CurrentViewer() v: RequestViewer) {
    return this.extensions.renderAdminPage(v, id, key, flatQuery(query));
  }
}
