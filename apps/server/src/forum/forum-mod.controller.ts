import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { idParam, mergeTopicSchema, moveTopicSchema, topicTitleSchema } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { RequireAuth } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { ModerationService, type TopicFlag } from './moderation.service.js';

const flagSchema = z.enum(['pin', 'unpin', 'lock', 'unlock', 'feature', 'unfeature', 'hide', 'unhide']);
const memberSchema = z.object({ userId: z.number().int().positive() });
const editTopicSchema = z.object({
  title: topicTitleSchema.optional(),
  prefixId: z.number().int().positive().nullable().optional(),
});

/** Konu moderasyonu (yetkiler bölüm bazında serviste kontrol edilir). */
@Controller('mod/topics')
@RequireAuth()
export class ForumModController {
  constructor(private readonly mod: ModerationService) {}

  @Put(':id')
  async edit(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(editTopicSchema)) body: z.output<typeof editTopicSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.mod.edit(v, id, body);
    return { ok: true };
  }

  @Post(':id/move')
  @HttpCode(200)
  async move(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(moveTopicSchema)) body: z.output<typeof moveTopicSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.mod.move(v, id, body.boardId, body.leaveRedirect);
    return { ok: true };
  }

  @Post(':id/merge')
  @HttpCode(200)
  async merge(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Body(new ZodPipe(mergeTopicSchema)) body: z.output<typeof mergeTopicSchema>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.mod.merge(v, id, body.targetTopicId);
    return { ok: true, topicId: body.targetTopicId };
  }

  @Post(':id/approve')
  @HttpCode(200)
  async approve(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.mod.approve(v, id);
    return { ok: true };
  }

  @Post(':id/restore')
  @HttpCode(200)
  async restore(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.mod.restore(v, id);
    return { ok: true };
  }

  @Get(':id/members')
  async members(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    return { items: await this.mod.members(v, id) };
  }

  @Post(':id/members')
  @HttpCode(200)
  async addMember(@Param('id', new ZodPipe(idParam)) id: number, @Body(new ZodPipe(memberSchema)) body: z.output<typeof memberSchema>, @CurrentViewer() v: RequestViewer) {
    await this.mod.addMember(v, id, body.userId);
    return { items: await this.mod.members(v, id) };
  }

  @Delete(':id/members/:userId')
  async removeMember(@Param('id', new ZodPipe(idParam)) id: number, @Param('userId', new ZodPipe(idParam)) userId: number, @CurrentViewer() v: RequestViewer) {
    await this.mod.removeMember(v, id, userId);
    return { items: await this.mod.members(v, id) };
  }

  /** Genel bayrak uç noktası en sonda: ':id/move' gibi özel yolları gölgelemesin. */
  @Post(':id/:flag')
  @HttpCode(200)
  async flag(
    @Param('id', new ZodPipe(idParam)) id: number,
    @Param('flag', new ZodPipe(flagSchema)) flag: TopicFlag,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.mod.setFlag(v, id, flag);
    return { ok: true };
  }

  @Delete(':id')
  async remove(@Param('id', new ZodPipe(idParam)) id: number, @CurrentViewer() v: RequestViewer) {
    await this.mod.delete(v, id);
    return { ok: true };
  }
}
