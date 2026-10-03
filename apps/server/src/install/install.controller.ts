import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { installInput, mailTransportInput, type InstallInput } from '@forum/shared';
import { z } from 'zod';
import { ZodPipe } from '../common/validation.js';
import { AllowBeforeInstall, AllowIncomplete, RateLimit } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { requestOrigin, requestSource } from '../common/origin.js';
import { explainMailError, MailService } from '../mail/mail.service.js';
import { InstallService } from './install.service.js';

const mailTestInput = z.object({ mail: mailTransportInput });

const wizardOrigin = (req: Request) => requestOrigin(requestSource(req), req.headers.host);

@Controller('install')
@AllowBeforeInstall()
@AllowIncomplete()
export class InstallController {
  constructor(
    private readonly install: InstallService,
    private readonly mail: MailService,
  ) {}

  @Get('status')
  status() {
    return this.install.status();
  }

  @Get('environment')
  @RateLimit({ limit: 30, windowMs: 5 * MINUTE })
  environment(@CurrentViewer() v: RequestViewer, @Req() req: Request) {
    const host = req.headers.host;
    const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0]!.trim();
    return this.install.environment(v.locale, host ? requestOrigin(`${proto}://${host}`, host) : null);
  }

  @Post('mail-test')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 5 * MINUTE })
  async mailTest(@Body(new ZodPipe(mailTestInput)) body: z.output<typeof mailTestInput>) {
    this.install.assertOpen();
    try {
      return await this.mail.verify(body.mail);
    } catch (err) {
      throw Errors.badRequest(explainMailError(err).message);
    }
  }

  @Post()
  @HttpCode(201)
  @RateLimit({ limit: 10, windowMs: 5 * MINUTE })
  complete(@Body(new ZodPipe(installInput)) body: InstallInput, @CurrentViewer() v: RequestViewer, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.install.complete(body, { ip: v.ip, userAgent: v.userAgent, locale: v.locale, origin: wizardOrigin(req) }, res);
  }
}
