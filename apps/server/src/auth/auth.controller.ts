import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  acceptPoliciesSchema,
  changePasswordSchema,
  elevateSchema,
  forgotPasswordSchema,
  loginSchema,
  loginTwoFactorSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  tokenSchema,
} from '@forum/shared';
import { z } from 'zod';
import { ZodPipe } from '../common/validation.js';
import { AllowBeforeInstall, AllowIncomplete, RateLimit, RequireAuth } from '../common/decorators.js';
import { CurrentViewer, type RequestViewer } from '../common/request-context.js';
import { MINUTE } from '../common/clock.js';
import { AuthService } from './auth.service.js';
import { ViewerService } from './viewer.service.js';
import { PoliciesService } from '../policies/policies.service.js';
import { ProfileFieldsService } from '../profiles/profile-fields.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { CaptchaService } from '../security/captcha.service.js';

const client = (v: RequestViewer) => ({ ip: v.ip, userAgent: v.userAgent });

@Controller('auth')
@AllowIncomplete()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly viewers: ViewerService,
    private readonly policies: PoliciesService,
    private readonly profileFields: ProfileFieldsService,
    private readonly settings: SettingsService,
    private readonly captcha: CaptchaService,
  ) {}

  /** Mevcut kullanıcı + yetkiler + uyum bayrakları + herkese açık ayarlar. */
  @Get('me')
  @AllowBeforeInstall()
  async me(@CurrentViewer() viewer: RequestViewer) {
    return this.viewers.toDto(viewer);
  }

  /** Kayıt formu için gereken her şey. */
  @Get('register')
  async registerInfo(@CurrentViewer() viewer: RequestViewer) {
    const policies = await this.policies.forRegistration(viewer.locale);
    return {
      mode: this.settings.get('registration.mode'),
      minAge: this.settings.get('registration.minAge'),
      requireBirthdate: this.settings.get('registration.requireBirthdate'),
      usernameMinLength: this.settings.get('registration.usernameMinLength'),
      usernameMaxLength: this.settings.get('registration.usernameMaxLength'),
      passwordMinLength: this.settings.get('security.passwordMinLength'),
      passwordRequireMixed: this.settings.get('security.passwordRequireMixed'),
      policies: policies.map((p) => this.policies.toPublic(p)),
      customFields: (await this.profileFields.forRegistration()).map((f) => ({
        key: f.key,
        name: f.name,
        description: f.description,
        type: f.type,
        options: f.options,
        isRequired: f.isRequired,
        maxLength: f.maxLength,
      })),
    };
  }

  @Post('register')
  @RateLimit({ limit: 10, windowMs: 10 * MINUTE })
  async register(
    @Body(new ZodPipe(registerSchema)) body: z.output<typeof registerSchema>,
    @CurrentViewer() viewer: RequestViewer,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.captcha.verify('register', body.captcha, viewer.ip);
    return this.auth.register(body, client(viewer), res);
  }

  @Post('login')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 5 * MINUTE })
  async login(
    @Body(new ZodPipe(loginSchema)) body: z.output<typeof loginSchema>,
    @CurrentViewer() viewer: RequestViewer,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.captcha.verify('login', body.captcha, viewer.ip);
    return this.auth.login(body.identifier, body.password, body.remember, client(viewer), res);
  }

  @Post('login/2fa')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 5 * MINUTE })
  async loginTwoFactor(
    @Body(new ZodPipe(loginTwoFactorSchema)) body: z.output<typeof loginTwoFactorSchema>,
    @CurrentViewer() viewer: RequestViewer,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.loginTwoFactor(body.challenge, body.code, client(viewer), res);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentViewer() viewer: RequestViewer, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(viewer, res);
    return { ok: true };
  }

  @Post('verify-email')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 10 * MINUTE })
  async verifyEmail(
    @Body(new ZodPipe(tokenSchema)) body: z.output<typeof tokenSchema>,
    @CurrentViewer() viewer: RequestViewer,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.verifyEmail(body.token, client(viewer), res);
  }

  @Post('verify-email/resend')
  @HttpCode(200)
  @RateLimit({ limit: 5, windowMs: 10 * MINUTE })
  async resendVerification(
    @Body(new ZodPipe(resendVerificationSchema)) body: z.output<typeof resendVerificationSchema>,
    @CurrentViewer() viewer: RequestViewer,
  ) {
    await this.auth.resendVerification(body.email, client(viewer));
    return { ok: true };
  }

  @Post('password/forgot')
  @HttpCode(200)
  @RateLimit({ limit: 5, windowMs: 10 * MINUTE })
  async forgot(
    @Body(new ZodPipe(forgotPasswordSchema)) body: z.output<typeof forgotPasswordSchema>,
    @CurrentViewer() viewer: RequestViewer,
  ) {
    await this.captcha.verify('forgot', body.captcha, viewer.ip);
    await this.auth.forgotPassword(body.email, client(viewer));
    return { ok: true };
  }

  @Post('password/reset/check')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowMs: 10 * MINUTE })
  async checkReset(@Body(new ZodPipe(tokenSchema)) body: z.output<typeof tokenSchema>) {
    return { valid: await this.auth.checkResetToken(body.token) };
  }

  @Post('password/reset')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 10 * MINUTE })
  async reset(
    @Body(new ZodPipe(resetPasswordSchema)) body: z.output<typeof resetPasswordSchema>,
    @CurrentViewer() viewer: RequestViewer,
  ) {
    await this.auth.resetPassword(body.token, body.password, client(viewer));
    return { ok: true };
  }

  @Post('password/change')
  @HttpCode(200)
  @RequireAuth()
  @RateLimit({ limit: 10, windowMs: 10 * MINUTE, by: 'user' })
  async changePassword(
    @Body(new ZodPipe(changePasswordSchema)) body: z.output<typeof changePasswordSchema>,
    @CurrentViewer() viewer: RequestViewer,
  ) {
    await this.auth.changePassword(viewer, body.currentPassword, body.newPassword);
    return { ok: true };
  }

  @Post('elevate')
  @HttpCode(200)
  @RequireAuth()
  @RateLimit({ limit: 10, windowMs: 10 * MINUTE, by: 'user' })
  async elevate(@Body(new ZodPipe(elevateSchema)) body: z.output<typeof elevateSchema>, @CurrentViewer() viewer: RequestViewer) {
    const until = await this.auth.elevate(viewer, body.password, body.code);
    return { elevatedUntil: until };
  }

  @Post('policies/accept')
  @HttpCode(200)
  @RequireAuth()
  async acceptPolicies(
    @Body(new ZodPipe(acceptPoliciesSchema)) body: z.output<typeof acceptPoliciesSchema>,
    @CurrentViewer() viewer: RequestViewer,
  ) {
    await this.policies.accept(viewer.user!.id, body.policyVersionIds, viewer.ip, viewer.userAgent);
    return { ok: true };
  }
}
