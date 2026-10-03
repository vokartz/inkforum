import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequireAuth } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { RealtimeService } from './realtime.service.js';

@Controller()
@RequireAuth()
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  @Get('me/stream')
  stream(@CurrentViewer() v: RequestViewer, @Res() res: Response): void {
    this.realtime.subscribe(v.user!.id, res);
  }
}
