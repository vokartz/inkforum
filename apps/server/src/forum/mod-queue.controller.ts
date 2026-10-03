import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/validation.js';
import { RequireAuth } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { ModQueueService } from './mod-queue.service.js';

const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1) });

@Controller('mod/queue')
@RequireAuth()
export class ModQueueController {
  constructor(private readonly queue: ModQueueService) {}

  @Get()
  list(@Query(new ZodPipe(pageQuery)) q: z.output<typeof pageQuery>, @CurrentViewer() v: RequestViewer) {
    return this.queue.list(v, q.page);
  }

  @Get('count')
  async count(@CurrentViewer() v: RequestViewer) {
    return { count: await this.queue.count(v) };
  }
}
