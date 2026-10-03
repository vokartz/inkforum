import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { AllowIncomplete } from '../common/decorators.js';
import { Clock } from '../common/clock.js';
import { MailService } from '../mail/mail.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { Errors } from '../common/errors.js';

@Controller('_test')
@AllowIncomplete()
export class TestController {
  constructor(
    private readonly clock: Clock,
    private readonly mail: MailService,
    private readonly jobs: JobsService,
  ) {}

  @Get('mail/last')
  async lastMail(@Query('to') to: string) {
    await this.jobs.drain();
    const mail = this.mail.lastTo(to);
    if (!mail) throw Errors.notFound('E-posta yok.');
    const link = /https?:\/\/\S+/.exec(mail.text)?.[0] ?? null;
    return { ...mail, link };
  }

  @Post('clock/advance')
  @HttpCode(200)
  advance(@Body() body: { ms: number }) {
    this.clock.advance(Number(body.ms) || 0);
    return { now: this.clock.now() };
  }

  @Post('jobs/drain')
  @HttpCode(200)
  async drain() {
    const processed = await this.jobs.drain();
    const tasks = await this.jobs.runDueTasks(true);
    return { processed, tasks };
  }
}
