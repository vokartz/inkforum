import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { conversationInviteSchema, conversationReplySchema, idParam, newConversationSchema, type MeCounters } from '@forum/shared';
import { ZodPipe, parse } from '../common/validation.js';
import { RateLimit, RequireAuth } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { MessagesService } from './messages.service.js';

const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1) });
const detailQuery = z.object({ page: z.union([z.literal('last'), z.coerce.number().int().min(1)]).default('last') });

@Controller()
@RequireAuth()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('messages')
  list(@Query() q: unknown, @CurrentViewer() v: RequestViewer) {
    return this.messages.list(v, parse(pageQuery, q).page);
  }

  @Post('messages')
  @HttpCode(201)
  @RateLimit({ limit: 30, windowMs: 10 * MINUTE, by: 'user' })
  create(@Body(new ZodPipe(newConversationSchema)) body: z.output<typeof newConversationSchema>, @CurrentViewer() v: RequestViewer) {
    return this.messages.create(v, body);
  }

  @Get('messages/:id')
  detail(@Param('id', new ZodPipe(idParam)) id: number, @Query() q: unknown, @CurrentViewer() v: RequestViewer) {
    return this.messages.detail(v, id, parse(detailQuery, q).page);
  }

  @Post('messages/:id')
  @HttpCode(201)
  @RateLimit({ limit: 60, windowMs: MINUTE, by: 'user' })
  reply(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(conversationReplySchema)) body: z.output<typeof conversationReplySchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    return this.messages.reply(v, id, body.body);
  }

  @Post('messages/:id/invite')
  @HttpCode(200)
  async invite(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(conversationInviteSchema)) body: z.output<typeof conversationInviteSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.messages.invite(v, id, body.userIds);
    return { ok: true };
  }

  @Post('messages/:id/leave')
  @HttpCode(200)
  async leave(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.messages.leave(v, id);
    return { ok: true };
  }

  /** Üst çubuktaki sayaçlar (düzenli aralıkla sorgulanır). */
  @Get('me/counters')
  async counters(@CurrentViewer() v: RequestViewer): Promise<MeCounters> {
    return { notifications: v.user!.unread_notifications, messages: await this.messages.unreadCount(v.user!.id) };
  }
}
