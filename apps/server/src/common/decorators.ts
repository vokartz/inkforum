import { SetMetadata, applyDecorators } from '@nestjs/common';
import type { PermissionKey } from '@forum/shared';

export const META_AUTH = 'forum:auth';
export const META_PERMISSIONS = 'forum:permissions';
export const META_ALLOW_INCOMPLETE = 'forum:allowIncomplete';
export const META_ELEVATION = 'forum:elevation';
export const META_RATE_LIMIT = 'forum:rateLimit';

export const RequireAuth = () => SetMetadata(META_AUTH, true);

export const RequirePermission = (...permissions: PermissionKey[]) => SetMetadata(META_PERMISSIONS, permissions);

export const AllowIncomplete = () => SetMetadata(META_ALLOW_INCOMPLETE, true);

export const RequireElevation = () => SetMetadata(META_ELEVATION, true);

export const AdminEndpoint = (...permissions: PermissionKey[]) =>
  applyDecorators(RequirePermission('admin.access', ...permissions), RequireElevation());

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  by?: 'ip' | 'user';
}

export const RateLimit = (opts: RateLimitOptions) => SetMetadata(META_RATE_LIMIT, opts);

export const META_NO_ORIGIN = 'forum:noOrigin';

export const SkipOriginCheck = () => SetMetadata(META_NO_ORIGIN, true);

export const META_PLUGIN = 'forum:plugin';
export const Plugin = (key: import('@forum/shared').PluginKey) => SetMetadata(META_PLUGIN, key);

export const META_PRE_INSTALL = 'forum:preInstall';
export const AllowBeforeInstall = () => SetMetadata(META_PRE_INSTALL, true);
