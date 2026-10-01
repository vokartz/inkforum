import { Body, Controller, Get, Put } from '@nestjs/common';
import { captchaSettingsInput, type CaptchaSettingsInput } from '@forum/shared';
import { ZodPipe } from '../common/validation.js';
import { AdminEndpoint, AllowIncomplete, RateLimit } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { CaptchaService } from './captcha.service.js';

@Controller()
export class CaptchaController {
  constructor(private readonly captcha: CaptchaService) {}

  /** Yerleşik captcha sorusu (dış servis seçiliyse kullanılmaz) */
  @Get('auth/captcha')
  @AllowIncomplete()
  @RateLimit({ limit: 60, windowMs: 5 * MINUTE })
  challenge() {
    return this.captcha.challenge();
  }

  @Get('admin/captcha')
  @AdminEndpoint('admin.settings')
  view() {
    return this.captcha.adminView();
  }

  @Put('admin/captcha')
  @AdminEndpoint('admin.settings')
  async save(@Body(new ZodPipe(captchaSettingsInput)) body: CaptchaSettingsInput, @CurrentViewer() v: RequestViewer) {
    await this.captcha.save(body, v.user!.id);
    return this.captcha.adminView();
  }
}
