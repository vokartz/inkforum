import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UploadedFile } from '@nestjs/common';
import { z } from 'zod';
import { createTopicSchema, editPostSchema, idParam, reactSchema, replySchema, searchQuerySchema, topicListQuery } from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { RateLimit, RequireAuth } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { ImageUpload, type UploadedImage } from '../common/upload.js';
import { Errors } from '../common/errors.js';
import { MINUTE } from '../common/clock.js';
import { SettingsService } from '../settings/settings.service.js';
import { StorageService } from '../storage/storage.service.js';
import { ForumService } from './forum.service.js';
import { PostsService } from './posts.service.js';
import { ForumAccessService } from './forum-access.service.js';
import { PostRenderService } from './post-render.service.js';
import { ReactionsService } from './reactions.service.js';
import { ProfilesService } from '../profiles/profiles.service.js';

const topicPageQuery = z.object({
  page: z.union([z.literal('last'), z.literal('unread'), z.coerce.number().int().min(1)]).default(1),
});
const deleteSchema = z.object({ reason: z.string().trim().max(200).optional().default('') });
const previewSchema = z.object({ bbcode: z.string().max(200_000), kind: z.enum(['post', 'short']).default('post') });

@Controller()
export class ForumController {
  constructor(
    private readonly forum: ForumService,
    private readonly posts: PostsService,
    private readonly access: ForumAccessService,
    private readonly render: PostRenderService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly reactions: ReactionsService,
    private readonly profiles: ProfilesService,
  ) {}

  @Get('forum')
  index(@CurrentViewer() v: RequestViewer) {
    return this.forum.index(v);
  }

  @Get('forum/recent')
  recent(@CurrentViewer() v: RequestViewer, @Query('limit') limit?: string) {
    // Kaç konu gösterileceği ana sayfa bloğunun ayarındadır.
    const n = Number(limit ?? 5);
    return this.forum.recent(v, Number.isFinite(n) ? Math.min(Math.max(0, n), 20) : 5);
  }

  @Post('forum/mark-read')
  @HttpCode(200)
  @RequireAuth()
  async markAllRead(@CurrentViewer() v: RequestViewer) {
    await this.forum.markRead(v, null);
    return { ok: true };
  }

  @Get('forum/unread')
  @RequireAuth()
  unread(@CurrentViewer() v: RequestViewer, @Query('page') page?: string) {
    return this.forum.unread(v, Math.max(1, Number(page) || 1));
  }

  @Get('search')
  @RateLimit({ limit: 60, windowMs: MINUTE })
  search(@Query() query: unknown, @CurrentViewer() v: RequestViewer) {
    return this.forum.search(v, parse(searchQuerySchema, query));
  }

  @Get('users/:id/topics')
  async userTopics(@Param('id', new ZodPipe(idParam)) id: number, @Query('page') page: string | undefined, @CurrentViewer() v: RequestViewer) {
    await this.profiles.assertProfileVisible(v, id);
    return this.forum.userTopics(v, id, Math.max(1, Number(page) || 1));
  }

  @Get('users/:id/posts')
  async userPosts(@Param('id', new ZodPipe(idParam)) id: number, @Query('page') page: string | undefined, @CurrentViewer() v: RequestViewer) {
    await this.profiles.assertProfileVisible(v, id);
    return this.forum.userPosts(v, id, Math.max(1, Number(page) || 1));
  }

  @Get('boards/:id')
  board(@Param('id', new ZodPipe(idParam)) id: number, @Query() query: unknown, @CurrentViewer() v: RequestViewer) {
    return this.forum.boardPage(v, id, parse(topicListQuery, query));
  }

  @Get('boards/:id/new')
  @RequireAuth()
  newTopic(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.forum.newTopicContext(v, id);
  }

  /** Bağlantı bölümü: tıklamayı sayar ve hedef adresi döner. */
  @Get('boards/:id/go')
  follow(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.forum.follow(v, id);
  }

  @Post('boards/:id/mark-read')
  @HttpCode(200)
  @RequireAuth()
  async markBoardRead(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.forum.markRead(v, id);
    return { ok: true };
  }

  @Post('boards/:id/topics')
  @HttpCode(201)
  @RequireAuth()
  @RateLimit({ limit: 10, windowMs: 10 * MINUTE, by: 'user' })
  createTopic(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(createTopicSchema)) body: z.output<typeof createTopicSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    return this.posts.createTopic(v, id, body);
  }

  @Get('topics/:id')
  topic(@Param('id', new ZodPipe(idParam)) id: number, @Query() query: unknown, @CurrentViewer() v: RequestViewer) {
    return this.forum.topicPage(v, id, parse(topicPageQuery, query).page);
  }

  @Post('topics/:id/posts')
  @HttpCode(201)
  @RequireAuth()
  @RateLimit({ limit: 30, windowMs: 10 * MINUTE, by: 'user' })
  async reply(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(replySchema)) body: z.output<typeof replySchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    const res = await this.posts.reply(v, id, body.body);
    return { ...res, location: await this.forum.locate(v, res.postId) };
  }

  /** Tepki ver (aynı tepki tekrar gönderilirse kaldırılır). */
  @Put('posts/:id/reaction')
  @RequireAuth()
  @RateLimit({ limit: 60, windowMs: MINUTE, by: 'user' })
  react(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(reactSchema)) body: z.output<typeof reactSchema>, @CurrentViewer() v: RequestViewer) {
    return this.reactions.react(v, id, body.reactionId);
  }

  @Delete('posts/:id/reaction')
  @RequireAuth()
  unreact(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.reactions.react(v, id, null);
  }

  @Get('posts/:id/reactions')
  reactionUsers(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.reactions.who(v, id);
  }

  @Get('posts/:id/locate')
  locate(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.forum.locate(v, id);
  }

  @Get('posts/:id/source')
  @RequireAuth()
  source(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.posts.source(v, id);
  }

  @Get('posts/:id/quote')
  quote(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.posts.quote(v, id);
  }

  @Put('posts/:id')
  @RequireAuth()
  edit(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(editPostSchema)) body: z.output<typeof editPostSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    return this.posts.edit(v, id, body);
  }

  @Delete('posts/:id')
  @RequireAuth()
  remove(@Param('id', new ZodPipe(idParam)) id: number, @Query() query: unknown, @CurrentViewer() v: RequestViewer) {
    return this.posts.delete(v, id, parse(deleteSchema, query).reason);
  }

  @Post('posts/:id/restore')
  @HttpCode(200)
  @RequireAuth()
  async restore(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.posts.restore(v, id);
    return { ok: true };
  }

  @Post('posts/:id/approve')
  @HttpCode(200)
  @RequireAuth()
  async approve(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.posts.approve(v, id);
    return { ok: true };
  }

  @Get('posts/:id/revisions')
  @RequireAuth()
  revisions(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.posts.revisions(v, id);
  }

  /** Editör önizlemesi. */
  @Post('bbcode/preview')
  @HttpCode(200)
  @RequireAuth()
  @RateLimit({ limit: 120, windowMs: MINUTE, by: 'user' })
  preview(@Body(new ZodPipe(previewSchema)) body: z.output<typeof previewSchema>) {
    return { html: body.kind === 'short' ? this.render.short(body.bbcode) : this.render.post(body.bbcode).html };
  }

  /** Mesaj görseli yükleme (editör). */
  @Post('forum/images')
  @HttpCode(201)
  @RequireAuth()
  @ImageUpload(20 * 1024 * 1024)
  @RateLimit({ limit: 60, windowMs: 10 * MINUTE, by: 'user' })
  async image(@UploadedFile() file: UploadedImage | undefined, @Query('board') boardQ: string | undefined, @CurrentViewer() v: RequestViewer) {
    if (!file) throw Errors.field('file', 'Bir görsel seçin.');
    const boardId = Number(boardQ);
    const access = Number.isInteger(boardId) && boardId > 0 ? await this.access.access(v, boardId) : null;
    if (!access?.can.images) throw Errors.forbidden('Bu bölümde görsel yükleme yetkiniz yok.');
    const reason = await this.posts.postingBlockReason(v);
    if (reason) throw Errors.forbidden(reason);
    const saved = await this.storage.saveImage(file.buffer, {
      purpose: 'post_image',
      ownerUserId: v.user!.id,
      maxBytes: this.settings.get('forum.imageMaxKb') * 1024,
      maxDimension: 8000,
    });
    return { url: this.storage.publicUrl(saved), width: saved.width, height: saved.height };
  }
}
