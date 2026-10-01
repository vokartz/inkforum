import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { adminTagSchema, idParam, pollInputSchema, pollVoteSchema, tagsInputSchema } from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { AdminEndpoint, RateLimit, RequireAuth } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { ForumService } from './forum.service.js';
import { PostsService } from './posts.service.js';
import { ForumAccessService } from './forum-access.service.js';
import { TopicExtrasService } from './topic-extras.service.js';

const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1) });
const suggestQuery = z.object({ q: z.string().max(40).default('') });
const adminTagsQuery = z.object({ q: z.string().max(40).default(''), page: z.coerce.number().int().min(1).default(1) });
const slugParam = z.string().trim().toLowerCase().max(60).regex(/^[a-z0-9-]+$/);
const subscriptionSchema = z.object({ on: z.boolean() });
const closeSchema = z.object({ closed: z.boolean() });
const topicTagsSchema = z.object({ tags: tagsInputSchema });

/** Etiketler, anketler, konu takibi ve görüntülenme kayıtları. */
@Controller()
export class TopicExtrasController {
  constructor(
    private readonly forum: ForumService,
    private readonly posts: PostsService,
    private readonly access: ForumAccessService,
    private readonly extras: TopicExtrasService,
  ) {}

  private async topicContext(v: RequestViewer, topicId: number) {
    const topic = await this.posts.requireTopic(topicId);
    const access = await this.access.require(v, topic.board_id);
    await this.posts.assertTopicVisible(v, access, topic);
    return { topic, access };
  }

  // ---------- Etiketler ----------

  @Get('tags')
  suggest(@Query() q: unknown) {
    return this.extras.suggest(parse(suggestQuery, q).q);
  }

  @Get('tags/:slug')
  tag(@Param('slug', new ZodPipe(slugParam)) slug: string, @Query() q: unknown, @CurrentViewer() v: RequestViewer) {
    return this.forum.tagPage(v, slug, parse(pageQuery, q).page);
  }

  @Get('admin/tags')
  @AdminEndpoint('admin.forum.manage')
  adminTags(@Query() q: unknown) {
    const { q: text, page } = parse(adminTagsQuery, q);
    return this.extras.adminTags(text, page);
  }

  @Post('admin/tags')
  @HttpCode(201)
  @AdminEndpoint('admin.forum.manage')
  createTag(@Body(new ZodPipe(adminTagSchema)) body: z.output<typeof adminTagSchema>, @CurrentViewer() v: RequestViewer) {
    return this.extras.saveTag(v, null, body);
  }

  @Put('admin/tags/:id')
  @AdminEndpoint('admin.forum.manage')
  updateTag(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(adminTagSchema)) body: z.output<typeof adminTagSchema>, @CurrentViewer() v: RequestViewer) {
    return this.extras.saveTag(v, id, body);
  }

  @Delete('admin/tags/:id')
  @AdminEndpoint('admin.forum.manage')
  async deleteTag(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.extras.deleteTag(v, id);
    return { ok: true };
  }

  /** Konu etiketlerini düzenle (konu sahibi ya da konu düzenleme yetkili moderatör). */
  @Put('topics/:id/tags')
  @RequireAuth()
  async setTags(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(topicTagsSchema)) body: z.output<typeof topicTagsSchema>, @CurrentViewer() v: RequestViewer) {
    const { topic, access } = await this.topicContext(v, id);
    const own = topic.user_id === v.user!.id && access.perms.has('post.edit.own') && !topic.is_locked;
    if (!own && !access.can.editTopic) throw Errors.forbidden('Bu konunun etiketlerini düzenleyemezsiniz.');
    const ids = await this.extras.resolveTags(v, access, body.tags);
    await this.extras.setTopicTags(id, ids);
    return (await this.extras.tagsFor([id])).get(id) ?? [];
  }

  // ---------- Takip ----------

  @Put('topics/:id/subscription')
  @RequireAuth()
  async subscribe(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(subscriptionSchema)) body: z.output<typeof subscriptionSchema>, @CurrentViewer() v: RequestViewer) {
    await this.topicContext(v, id);
    await this.extras.setSubscribed(v.user!.id, id, body.on);
    return { subscribed: body.on };
  }

  // ---------- Anket ----------

  @Post('topics/:id/poll')
  @HttpCode(201)
  @RequireAuth()
  async addPoll(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(pollInputSchema)) body: z.output<typeof pollInputSchema>, @CurrentViewer() v: RequestViewer) {
    const { topic, access } = await this.topicContext(v, id);
    await this.extras.addPoll(v, access, topic, body);
    return this.extras.pollView(v, access, topic);
  }

  @Delete('topics/:id/poll')
  @RequireAuth()
  async deletePoll(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    const { topic, access } = await this.topicContext(v, id);
    await this.extras.deletePoll(v, access, topic);
    return { ok: true };
  }

  @Post('topics/:id/poll/vote')
  @HttpCode(200)
  @RequireAuth()
  @RateLimit({ limit: 30, windowMs: MINUTE, by: 'user' })
  async vote(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(pollVoteSchema)) body: z.output<typeof pollVoteSchema>, @CurrentViewer() v: RequestViewer) {
    const { topic, access } = await this.topicContext(v, id);
    await this.extras.vote(v, access, topic, body.optionIds);
    return this.extras.pollView(v, access, topic);
  }

  @Delete('topics/:id/poll/vote')
  @RequireAuth()
  async unvote(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    const { topic, access } = await this.topicContext(v, id);
    await this.extras.unvote(v, topic);
    return this.extras.pollView(v, access, topic);
  }

  @Post('topics/:id/poll/close')
  @HttpCode(200)
  @RequireAuth()
  async close(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(closeSchema)) body: z.output<typeof closeSchema>, @CurrentViewer() v: RequestViewer) {
    const { topic, access } = await this.topicContext(v, id);
    await this.extras.setClosed(v, access, topic, body.closed);
    return this.extras.pollView(v, access, topic);
  }

  @Get('topics/:id/poll/voters')
  async voters(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    const { topic, access } = await this.topicContext(v, id);
    if (!v.user) throw Errors.unauthenticated();
    return this.extras.voters(id, v, access, topic);
  }


  @Get('topics/:id/related')
  related(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return this.forum.related(v, id);
  }
  // ---------- Görüntülenme kaydı ----------

  @Get('topics/:id/viewers')
  @RequireAuth()
  viewers(@Param('id', new ZodPipe(idParam)) id: number, @Query() q: unknown, @CurrentViewer() v: RequestViewer) {
    return this.forum.topicViewers(v, id, parse(pageQuery, q).page);
  }
}
