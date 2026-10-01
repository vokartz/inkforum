import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { installCodeInput, installInput, mailTransportInput, type InstallInput } from '@forum/shared';
import { z } from 'zod';
import { ZodPipe } from '../common/validation.js';
import { AllowBeforeInstall, AllowIncomplete, RateLimit } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { explainMailError, MailService } from '../mail/mail.service.js';
import { InstallService } from './install.service.js';

const mailTestInput = z.object({ code: z.string().trim().max(20), mail: mailTransportInput });

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

  /** Kurulum kodunu doğrular; doğruysa ortam denetimlerini döner */
  @Post('verify')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 5 * MINUTE })
  async verify(@Body(new ZodPipe(installCodeInput)) body: z.output<typeof installCodeInput>, @CurrentViewer() v: RequestViewer) {
    this.install.verifyCode(body.code);
    return this.install.environment(v.locale);
  }

  /** SMTP bağlantısını dener (kayıt yapmadan) */
  @Post('mail-test')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 5 * MINUTE })
  async mailTest(@Body(new ZodPipe(mailTestInput)) body: z.output<typeof mailTestInput>) {
    this.install.verifyCode(body.code);
    try {
      return await this.mail.verify(body.mail);
    } catch (err) {
      throw Errors.badRequest(explainMailError(err).message);
    }
  }

  @Post()
  @HttpCode(201)
  @RateLimit({ limit: 10, windowMs: 5 * MINUTE })
  complete(@Body(new ZodPipe(installInput)) body: InstallInput, @CurrentViewer() v: RequestViewer, @Res({ passthrough: true }) res: Response) {
    return this.install.complete(body, { ip: v.ip, userAgent: v.userAgent, locale: v.locale }, res);
  }
}
