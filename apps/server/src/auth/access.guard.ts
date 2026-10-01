import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCode, type PluginKey } from '@forum/shared';
import { CONFIG, type AppConfig } from '../config/config.js';
import { Errors } from '../common/errors.js';
import { Clock } from '../common/clock.js';
import { requestOrigin, requestSource } from '../common/origin.js';
import {
  META_ALLOW_INCOMPLETE,
  META_AUTH,
  META_ELEVATION,
  META_PERMISSIONS,
  META_NO_ORIGIN,
  META_RATE_LIMIT,
  META_PLUGIN,
  META_PRE_INSTALL,
  type RateLimitOptions,
} from '../common/decorators.js';
import { can } from '../common/request-context.js';
import { ViewerService } from './viewer.service.js';
import { requiredScope } from './token-auth.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { RateLimitService } from '../security/rate-limit.service.js';
import { InstallService } from '../install/install.service.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Tek bir global guard, sırasıyla:
 *  1. Kimlik bağlamı (oturum → kullanıcı → yetkiler)
 *  2. CSRF (Origin/Referer = APP_URL, değiştiren isteklerde)
 *  3. Hız sınırı
 *  4. Bakım modu, erişim yasağı
 *  5. Uyum (şifre değişimi, politika onayı, 2FA kurulumu)
 *  6. Giriş / yetki / yeniden doğrulama
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly viewers: ViewerService,
    private readonly settings: SettingsService,
    private readonly rateLimit: RateLimitService,
    private readonly clock: Clock,
    private readonly install: InstallService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private meta<T>(key: string, ctx: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    // İlk kurulum bitmeden yalnızca sihirbazın ihtiyaç duyduğu uç noktalar açık
    if (!this.install.installed && this.meta<boolean>(META_PRE_INSTALL, ctx) !== true) {
      throw Errors.code(ErrorCode.INSTALL_REQUIRED, 'InkForum henüz kurulmadı. Kurulum sihirbazını tamamlayın.', 503);
    }
    const viewer = (req.viewer ??= await this.viewers.fromRequest(req));

    // Kapalı eklentinin uç noktaları yokmuş gibi davranır
    const plugin = this.meta<PluginKey>(META_PLUGIN, ctx);
    if (plugin && !this.settings.plugin(plugin)) throw Errors.notFound('Bu özellik kapalı.');

    // 1b. Bearer belirteci: geçersizse reddet, izin kapsamını denetle.
    if (viewer.tokenError) throw Errors.code(ErrorCode.UNAUTHENTICATED, 'Geçersiz ya da süresi dolmuş erişim belirteci.', 401);
    if (viewer.token) {
      const scope = requiredScope(req.method, req.path);
      if (scope === 'deny') throw Errors.forbidden('Bu uç nokta erişim belirteciyle kullanılamaz.');
      if (!viewer.token.scopes.has(scope)) throw Errors.forbidden(`Bu erişim belirtecinin "${scope}" izni yok.`);
    }

    // 2. CSRF (belirteçli isteklerde çerez kullanılmadığı için gerekmez)
    if (MUTATING.has(req.method) && !viewer.token && this.meta<boolean>(META_NO_ORIGIN, ctx) !== true) this.checkOrigin(req);

    // 3. Hız sınırı
    const rl = this.meta<RateLimitOptions>(META_RATE_LIMIT, ctx);
    if (rl) {
      const who = rl.by === 'user' && viewer.user ? `u${viewer.user.id}` : `ip${viewer.ip ?? '?'}`;
      this.rateLimit.hit(`${ctx.getClass().name}.${ctx.getHandler().name}:${who}`, rl.limit, rl.windowMs);
    }

    const allowIncomplete = this.meta<boolean>(META_ALLOW_INCOMPLETE, ctx) === true;

    // 4. Bakım modu ve erişim yasağı
    if (!allowIncomplete) {
      if (this.settings.get('general.maintenanceMode') && !viewer.isAdmin) {
        throw Errors.code(ErrorCode.MAINTENANCE, this.settings.get('general.maintenanceMessage'), 503);
      }
      if (!viewer.isAdmin) {
        const ban = await this.viewers.ban(viewer);
        if (ban?.cannotAccess) {
          throw Errors.code(ErrorCode.BANNED, ban.reason ?? 'Foruma erişiminiz engellenmiş.', 403, {
            expiresAt: ban.expiresAt,
          });
        }
      }
    }

    // 5. Uyum (makine istemcileri — belirteçli istekler — için uygulanmaz)
    if (viewer.user && !allowIncomplete && !viewer.token) {
      const c = await this.viewers.compliance(viewer);
      if (c.mustChangePassword) {
        throw Errors.code(ErrorCode.PASSWORD_CHANGE_REQUIRED, 'Devam etmeden önce şifrenizi değiştirmelisiniz.', 403);
      }
      if (c.pendingPolicies.length) {
        throw Errors.code(ErrorCode.POLICY_ACCEPTANCE_REQUIRED, 'Devam etmeden önce güncellenen metinleri onaylamalısınız.', 403, {
          policies: c.pendingPolicies.map((p) => p.key),
        });
      }
      if (c.twoFactorSetupRequired) {
        throw Errors.code(ErrorCode.TWO_FACTOR_SETUP_REQUIRED, 'Grubunuz iki adımlı doğrulama kullanmanızı gerektiriyor.', 403);
      }
    }

    // 6. Giriş / yetki / yeniden doğrulama
    const requireAuth = this.meta<boolean>(META_AUTH, ctx) === true;
    const perms = this.meta<string[]>(META_PERMISSIONS, ctx) ?? [];
    const requireElevation = this.meta<boolean>(META_ELEVATION, ctx) === true;

    if ((requireAuth || requireElevation) && !viewer.user) throw Errors.unauthenticated();
    for (const p of perms) {
      if (!can(viewer, p)) throw viewer.user ? Errors.forbidden() : Errors.unauthenticated();
    }
    if (requireElevation) {
      // `admin` izinli API anahtarları yeniden doğrulama yerine geçer; OAuth belirteçleri yönetime giremez.
      if (viewer.token) {
        if (viewer.token.kind === 'apikey' && viewer.token.scopes.has('admin')) return true;
        throw Errors.forbidden('Yönetim uç noktaları yalnızca "admin" izinli API anahtarlarıyla kullanılabilir.');
      }
      const until = viewer.session?.elevated_until ?? 0;
      if (until <= this.clock.now()) {
        throw Errors.code(ErrorCode.ELEVATION_REQUIRED, 'Bu işlem için şifrenizi yeniden girmeniz gerekiyor.', 403);
      }
    }
    return true;
  }

  private checkOrigin(req: Request): void {
    const source = requestSource(req);
    // Kurulumdan önce adres henüz bilinmiyorsa (APP_URL otomatik) istek, geldiği sunucuyla aynı kaynaktan olmalı
    const expected = this.config.appUrlPending ? requestOrigin(source, req.headers.host) : this.config.appOrigin;
    if (!source || source !== expected) {
      throw Errors.code(ErrorCode.BAD_ORIGIN, 'İstek kaynağı doğrulanamadı. Sayfayı yenileyip tekrar deneyin.', 403);
    }
  }
}
