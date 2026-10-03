import { Global, Module, type Provider } from '@nestjs/common';
import { createDatabase } from '@forum/db';
import { CONFIG, loadConfig, type AppConfig } from './config/config.js';
import { Clock } from './common/clock.js';
import { DATABASE, Db } from './database/db.service.js';
import { CacheService } from './cache/cache.service.js';
import { SettingsService } from './settings/settings.service.js';
import { EventsService } from './events/events.service.js';
import { JobsService } from './jobs/jobs.service.js';
import { MailService } from './mail/mail.service.js';
import { StorageService } from './storage/storage.service.js';
import { CryptoService } from './security/crypto.service.js';
import { PasswordHasher } from './security/password-hasher.js';
import { RateLimitService } from './security/rate-limit.service.js';
import { AuditService } from './audit/audit.service.js';
import { GroupCacheService } from './groups/group-cache.service.js';
import { PermissionsService } from './permissions/permissions.service.js';
import { UsersService } from './users/users.service.js';
import { PoliciesService } from './policies/policies.service.js';
import { BansService } from './bans/bans.service.js';
import { ProfileFieldsService } from './profiles/profile-fields.service.js';
import { SessionService } from './auth/session.service.js';
import { TokensService } from './auth/tokens.service.js';
import { TwoFactorService } from './auth/two-factor.service.js';
import { ViewerService } from './auth/viewer.service.js';
import { TokenAuthService } from './auth/token-auth.service.js';
import { NotificationsService } from './notifications/notifications.service.js';
import { RealtimeService } from './realtime/realtime.service.js';
import { PresenceService } from './presence/presence.service.js';
import { I18nService } from './i18n/i18n.service.js';

const services = [
  Clock,
  Db,
  CacheService,
  SettingsService,
  I18nService,
  EventsService,
  JobsService,
  MailService,
  StorageService,
  CryptoService,
  PasswordHasher,
  RateLimitService,
  AuditService,
  GroupCacheService,
  PermissionsService,
  UsersService,
  PoliciesService,
  BansService,
  ProfileFieldsService,
  SessionService,
  TokensService,
  TwoFactorService,
  ViewerService,
  TokenAuthService,
  NotificationsService,
  PresenceService,
  RealtimeService,
];

@Global()
@Module({})
export class CoreModule {
  static forRoot(config: AppConfig = loadConfig()) {
    const providers: Provider[] = [
      { provide: CONFIG, useValue: config },
      {
        provide: DATABASE,
        useFactory: () =>
          createDatabase({
            driver: config.db.driver,
            sqlitePath: config.db.sqlitePath,
            sqliteDriver: config.db.sqliteDriver,
            sqliteJournalMode: config.db.sqliteJournal,
            postgresUrl: config.db.postgresUrl,
            postgresPoolSize: config.db.poolSize,
            log: config.db.log ? (sql, ms) => console.debug(`[sql ${ms.toFixed(1)}ms] ${sql}`) : undefined,
          }),
      },
      ...services,
    ];
    return {
      module: CoreModule,
      providers,
      exports: [CONFIG, DATABASE, ...services],
    };
  }
}
