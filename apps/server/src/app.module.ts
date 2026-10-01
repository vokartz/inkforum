import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { CoreModule } from './core.module.js';
import { loadConfig, type AppConfig } from './config/config.js';
import { ApiExceptionFilter } from './common/exception.filter.js';
import { AccessGuard } from './auth/access.guard.js';
import { HealthController } from './health/health.controller.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { BootstrapService } from './bootstrap/bootstrap.service.js';
import { TestController } from './testing/test.controller.js';
import { GroupsService } from './groups/groups.service.js';
import { GroupsController } from './groups/groups.controller.js';
import { WarningsService } from './warnings/warnings.service.js';
import { WarningsController } from './warnings/warnings.controller.js';
import { AchievementsService } from './achievements/achievements.service.js';
import { ProfilesService } from './profiles/profiles.service.js';
import { MeController } from './profiles/me.controller.js';
import { UsersController } from './profiles/users.controller.js';
import { AdminUsersService } from './admin/admin-users.service.js';
import { AdminController } from './admin/admin.controller.js';
import { AdminUsersController } from './admin/admin-users.controller.js';
import { AdminGroupsController } from './admin/admin-groups.controller.js';
import { AdminContentController } from './admin/admin-content.controller.js';
import { AdminModerationController } from './admin/admin-moderation.controller.js';
import { AdminAchievementsController } from './admin/admin-achievements.controller.js';
import { ForumCacheService } from './forum/forum-cache.service.js';
import { ForumAccessService } from './forum/forum-access.service.js';
import { ForumCountersService } from './forum/forum-counters.service.js';
import { PostRenderService } from './forum/post-render.service.js';
import { PostsService } from './forum/posts.service.js';
import { ModerationService } from './forum/moderation.service.js';
import { TopicViewsService } from './forum/topic-views.service.js';
import { ForumService } from './forum/forum.service.js';
import { ForumAdminService } from './forum/forum-admin.service.js';
import { ForumSeedService } from './forum/forum-seed.service.js';
import { ForumController } from './forum/forum.controller.js';
import { ForumModController } from './forum/forum-mod.controller.js';
import { ModQueueController } from './forum/mod-queue.controller.js';
import { ModQueueService } from './forum/mod-queue.service.js';
import { AdminForumController } from './forum/admin-forum.controller.js';
import { AdminEmbedsController } from './forum/admin-embeds.controller.js';
import { AppearanceService } from './appearance/appearance.service.js';
import { AppearanceController } from './appearance/appearance.controller.js';
import { HomeService } from './home/home.service.js';
import { MessagesService } from './messages/messages.service.js';
import { MessagesController } from './messages/messages.controller.js';
import { RealtimeController } from './realtime/realtime.controller.js';
import { DiscordController } from './discord/discord.controller.js';
import { DiscordService } from './discord/discord.service.js';
import { ThemesController } from './themes/themes.controller.js';
import { ThemesService } from './themes/themes.service.js';
import { ReactionsService } from './forum/reactions.service.js';
import { HomeController } from './home/home.controller.js';
import { TopicExtrasService } from './forum/topic-extras.service.js';
import { EmojisService } from './forum/emojis.service.js';
import { OAuthService } from './developer/oauth.service.js';
import { WebhooksService } from './developer/webhooks.service.js';
import { SocialService } from './developer/social.service.js';
import { OAuthController } from './developer/oauth.controller.js';
import { SocialController } from './developer/social.controller.js';
import { DeveloperAdminController } from './developer/developer-admin.controller.js';
import { EmojisController } from './forum/emojis.controller.js';
import { TopicExtrasController } from './forum/topic-extras.controller.js';
import { CustomService } from './custom/custom.service.js';
import { BuilderService } from './custom/builder.service.js';
import { PageRuntimeService } from './custom/page-runtime.service.js';
import { WikiService } from './wiki/wiki.service.js';
import { WikiController } from './wiki/wiki.controller.js';
import { ApplicationsService } from './applications/applications.service.js';
import { ApplicationsController } from './applications/applications.controller.js';
import { TicketsService } from './tickets/tickets.service.js';
import { TicketsController } from './tickets/tickets.controller.js';
import { PluginsController } from './plugins/plugins.controller.js';
import { WafService } from './security/waf.service.js';
import { WafController } from './security/waf.controller.js';
import { CaptchaController } from './security/captcha.controller.js';
import { CaptchaService } from './security/captcha.service.js';
import { CustomController } from './custom/custom.controller.js';
import { InstallService } from './install/install.service.js';
import { InstallController } from './install/install.controller.js';
import { BackupService } from './maintenance/backup.service.js';
import { BackupsController } from './maintenance/backups.controller.js';
import { SystemInfoService } from './maintenance/system-info.service.js';
import { SeoService } from './seo/seo.service.js';
import { SeoController } from './seo/seo.controller.js';
import { UpdatesService } from './updates/updates.service.js';
import { UpdatesController } from './updates/updates.controller.js';
import { ImportService } from './importer/import.service.js';
import { ImportController } from './importer/import.controller.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig = loadConfig()): DynamicModule {
    return {
      module: AppModule,
      imports: [CoreModule.forRoot(config)],
      controllers: [
        HealthController,
        InstallController,
        UpdatesController,
        BackupsController,
        ImportController,
        SeoController,
        AuthController,
        MeController,
        UsersController,
        GroupsController,
        WarningsController,
        AdminController,
        AdminUsersController,
        AdminGroupsController,
        AdminContentController,
        AdminModerationController,
        AdminAchievementsController,
        ForumController,
        ForumModController,
        ModQueueController,
        AdminForumController,
        AdminEmbedsController,
        AppearanceController,
        HomeController,
        MessagesController,
        RealtimeController,
        DiscordController,
        ThemesController,
        CustomController,
        WikiController,
        ApplicationsController,
        TicketsController,
        PluginsController,
        WafController,
        CaptchaController,
        TopicExtrasController,
        EmojisController,
        OAuthController,
        SocialController,
        DeveloperAdminController,
        ...(config.isTest ? [TestController] : []),
      ],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: AccessGuard },
        AuthService,
        GroupsService,
        WarningsService,
        AchievementsService,
        ProfilesService,
        AdminUsersService,
        ForumCacheService,
        ForumAccessService,
        ForumCountersService,
        PostRenderService,
        PostsService,
        ModerationService,
        ModQueueService,
        TopicViewsService,
        ForumService,
        ForumAdminService,
        ForumSeedService,
        AppearanceService,
        HomeService,
        MessagesService,
        DiscordService,
        ThemesService,
        CustomService,
        BuilderService,
        PageRuntimeService,
        WikiService,
        ApplicationsService,
        TicketsService,
        WafService,
        CaptchaService,
        TopicExtrasService,
        EmojisService,
        OAuthService,
        WebhooksService,
        SocialService,
        ReactionsService,
        InstallService,
        BackupService,
        ImportService,
        SystemInfoService,
        SeoService,
        UpdatesService,
        BootstrapService,
      ],
    };
  }
}
