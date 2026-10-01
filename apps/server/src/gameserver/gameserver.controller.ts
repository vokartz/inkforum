import { Body, Controller, Get, Put } from '@nestjs/common';
import { z } from 'zod';
import { gameServersInput } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint, Plugin } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { GameServerService } from './gameserver.service.js';

@Controller()
@Plugin('gameserver')
export class GameServerController {
  constructor(private readonly servers: GameServerService) {}

  @Get('gameservers')
  async list() {
    return { items: await this.servers.statuses() };
  }

  @Get('admin/gameservers')
  @AdminEndpoint('admin.settings')
  admin() {
    return { servers: this.servers.servers() };
  }

  @Put('admin/gameservers')
  @AdminEndpoint('admin.settings')
  async save(
    @Body(new ZodPipe(gameServersInput)) body: z.output<typeof gameServersInput>,
    @CurrentViewer() v: RequestViewer,
  ) {
    await this.servers.save(body.servers, v.user!.id);
    return { items: await this.servers.statuses() };
  }
}
