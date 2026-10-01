import { SetMetadata, applyDecorators } from '@nestjs/common';
import type { PermissionKey } from '@forum/shared';

export const META_AUTH = 'forum:auth';
export const META_PERMISSIONS = 'forum:permissions';
export const META_ALLOW_INCOMPLETE = 'forum:allowIncomplete';
export const META_ELEVATION = 'forum:elevation';
export const META_RATE_LIMIT = 'forum:rateLimit';

/** Giriş yapmış kullanıcı gerektirir. */
export const RequireAuth = () => SetMetadata(META_AUTH, true);

/** Belirtilen yetkilerin tümünü gerektirir (admin grubu her zaman geçer). */
export const RequirePermission = (...permissions: PermissionKey[]) => SetMetadata(META_PERMISSIONS, permissions);

/**
 * Uyum engellerine (politika onayı, zorunlu şifre değişimi, 2FA kurulumu),
 * bakım moduna ve erişim yasağına rağmen erişilebilir uç nokta.
 */
export const AllowIncomplete = () => SetMetadata(META_ALLOW_INCOMPLETE, true);

/** Son birkaç dakikada şifre/2FA ile yeniden doğrulama gerektirir (yönetim işlemleri). */
export const RequireElevation = () => SetMetadata(META_ELEVATION, true);

/** Yönetim paneli uç noktaları: `admin.access` + ek yetkiler + yeniden doğrulama. */
export const AdminEndpoint = (...permissions: PermissionKey[]) =>
  applyDecorators(RequirePermission('admin.access', ...permissions), RequireElevation());

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  /** Anahtar: ip (varsayılan) veya kullanıcı */
  by?: 'ip' | 'user';
}

/** Bellek içi basit hız sınırı. */
export const RateLimit = (opts: RateLimitOptions) => SetMetadata(META_RATE_LIMIT, opts);

export const META_NO_ORIGIN = 'forum:noOrigin';

/**
 * Origin/Referer (CSRF) denetimini atlar. Yalnızca çerez kullanmayan, istemci kimliğini kendisi
 * doğrulayan uç noktalar için (OAuth token / revoke).
 */
export const SkipOriginCheck = () => SetMetadata(META_NO_ORIGIN, true);

export const META_PLUGIN = 'forum:plugin';
/** Denetleyici bir eklentiye aitse: eklenti kapalıyken tüm uç noktaları 404 döner. */
export const Plugin = (key: import('@forum/shared').PluginKey) => SetMetadata(META_PLUGIN, key);

export const META_PRE_INSTALL = 'forum:preInstall';
/** Kurulum tamamlanmadan da erişilebilen uç nokta (kurulum sihirbazı, sağlık, oturum bilgisi). */
export const AllowBeforeInstall = () => SetMetadata(META_PRE_INSTALL, true);
