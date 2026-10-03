import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { migrateToLatest, migrations, pendingMigrations } from '@forum/db';
import { BOARD_PERMISSIONS, GLOBAL_PERMISSIONS } from '@forum/shared';
import { CONFIG, type AppConfig } from '../config/config.js';
import { Db } from '../database/db.service.js';
import { Clock, DAY } from '../common/clock.js';
import { SettingsService } from '../settings/settings.service.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { PoliciesService } from '../policies/policies.service.js';
import { UsersService } from '../users/users.service.js';
import { PasswordHasher } from '../security/password-hasher.js';
import { toJson } from '../database/json.js';
import {
  DEFAULT_ACHIEVEMENTS,
  DEFAULT_ACHIEVEMENT_CATEGORIES,
  DEFAULT_PERMISSION_PROFILES,
  boardProfileDefaults,
  DEFAULT_POLICIES,
  DEFAULT_WARNING_ACTIONS,
  DEFAULT_WARNING_TEMPLATES,
  POST_GROUPS,
  SYSTEM_GROUPS,
  type DefaultGroup,
} from './defaults.js';
import { ForumSeedService } from '../forum/forum-seed.service.js';
import { AppearanceService } from '../appearance/appearance.service.js';
import { LEGACY_ICONS } from '../common/icons.js';
import { HomeService } from '../home/home.service.js';
import { ReactionsService } from '../forum/reactions.service.js';
import { InstallService } from '../install/install.service.js';
import { I18nService } from '../i18n/i18n.service.js';
import { BackupService } from '../maintenance/backup.service.js';

const SEEDED_KEY = 'seeded:v1';
const APPLIED_PERMISSIONS_KEY = 'permissions:applied_defaults';
const SEEDED_FORUM_KEY = 'seeded:forum:v1';
const SEEDED_NAV_KEY = 'seeded:nav:v1';
const PHOSPHOR_ICONS_KEY = 'migrated:icons:phosphor';
const SEEDED_HOME_KEY = 'seeded:home:v1';
const SEEDED_REACTIONS_KEY = 'seeded:reactions:v1';
const OLD_SEED_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#64748b'];

@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger('Bootstrap');

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly groups: GroupCacheService,
    private readonly permissions: PermissionsService,
    private readonly policies: PoliciesService,
    private readonly users: UsersService,
    private readonly hasher: PasswordHasher,
    private readonly forumSeed: ForumSeedService,
    private readonly appearance: AppearanceService,
    private readonly home: HomeService,
    private readonly reactions: ReactionsService,
    private readonly install: InstallService,
    private readonly i18n: I18nService,
    private readonly backups: BackupService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.db.migrateOnBoot) await this.migrate();
    await this.settings.reload();
    await this.reconcile();
  }

  async migrate(): Promise<void> {
    const pending = await pendingMigrations(this.db.q);
    if (pending.length && pending.length < Object.keys(migrations).length && this.backups.supported().ok) {
      try {
        const b = await this.backups.create('db', 'pre-migrate');
        this.logger.log(`Migration öncesi yedek: ${b.name} (${pending.join(', ')})`);
      } catch (err) {
        this.logger.warn(`Migration öncesi yedek alınamadı: ${String(err)}`);
      }
    }
    const { applied, error } = await migrateToLatest(this.db.q);
    if (error) {
      this.logger.error(`Migration hatası: ${String(error)}`);
      throw error;
    }
    if (applied.length) this.logger.log(`Uygulanan migration'lar: ${applied.join(', ')}`);
  }

  async reconcile(): Promise<void> {
    await this.ensureSystemGroups();
    const firstRun = !(await this.getState(SEEDED_KEY));
    if (firstRun) await this.seedInitialData();
    await this.applyPermissionDefaults();
    await this.install.init(await this.ensureAdmin());
    if (this.install.installed) await this.seedForum();
    if (!(await this.getState(SEEDED_NAV_KEY))) {
      await this.appearance.seedDefaults();
      await this.setState(SEEDED_NAV_KEY, String(this.clock.now()));
    }
    if (!(await this.getState(SEEDED_REACTIONS_KEY))) {
      await this.reactions.seedDefaults();
      await this.setState(SEEDED_REACTIONS_KEY, String(this.clock.now()));
    }
    if (!(await this.getState(SEEDED_HOME_KEY))) {
      await this.home.seedDefaults();
      await this.setState(SEEDED_HOME_KEY, String(this.clock.now()));
    }
    if (!(await this.getState(PHOSPHOR_ICONS_KEY))) {
      await this.migrateIconNames();
      await this.setState(PHOSPHOR_ICONS_KEY, String(this.clock.now()));
    }
  }

  private async migrateIconNames(): Promise<void> {
    for (const [from, to] of Object.entries(LEGACY_ICONS)) {
      if (from === to) continue;
      await this.db.q.updateTable('boards').set({ icon_name: to }).where('icon_name', '=', from).execute();
      await this.db.q.updateTable('nav_items').set({ icon: to }).where('icon', '=', from).execute();
    }
    await this.db.q.updateTable('boards').set({ icon_color: null }).where('icon_color', 'in', OLD_SEED_COLORS).execute();
  }

  private async getState(key: string): Promise<string | undefined> {
    const row = await this.db.q.selectFrom('system_state').select('value').where('key', '=', key).executeTakeFirst();
    return row?.value;
  }

  private async setState(key: string, value: string): Promise<void> {
    const now = this.clock.now();
    await this.db.q
      .insertInto('system_state')
      .values({ key, value, updated_at: now })
      .onConflict((oc) => oc.column('key').doUpdateSet({ value, updated_at: now }))
      .execute();
  }

  private async insertGroup(g: DefaultGroup): Promise<void> {
    const now = this.clock.now();
    await this.db.q
      .insertInto('member_groups')
      .values({
        system_key: g.systemKey,
        name: g.name,
        description: g.description,
        color: g.color,
        icon_count: g.iconCount,
        kind: g.kind,
        min_posts: g.minPosts,
        visibility: g.visibility,
        is_protected: g.isProtected,
        sort_order: g.sortOrder,
        created_at: now,
        updated_at: now,
      })
      .execute();
  }

  private async ensureSystemGroups(): Promise<void> {
    const existing = await this.db.q.selectFrom('member_groups').select('system_key').where('system_key', 'is not', null).execute();
    const keys = new Set(existing.map((r) => r.system_key));
    let created = false;
    for (const g of SYSTEM_GROUPS) {
      if (!keys.has(g.systemKey)) {
        await this.insertGroup(g);
        created = true;
      }
    }
    if (created) await this.groups.invalidate();
  }

  private async seedInitialData(): Promise<void> {
    this.logger.log('İlk kurulum verileri oluşturuluyor…');
    const now = this.clock.now();
    await this.db.tx(async () => {
      for (const g of POST_GROUPS) await this.insertGroup(g);
      await this.groups.invalidate();

      for (const p of DEFAULT_POLICIES) {
        const id = await this.policies.createPolicy(p);
        const version = await this.db.q.selectFrom('policy_versions').select('id').where('policy_id', '=', id).executeTakeFirstOrThrow();
        await this.policies.publish(version.id);
      }

      for (const [i, t] of DEFAULT_WARNING_TEMPLATES.entries()) {
        await this.db.q
          .insertInto('warning_templates')
          .values({
            title: t.title,
            reason_template: t.reasonTemplate,
            points: t.points,
            expiry_days: t.expiryDays,
            sort_order: i,
            created_at: now,
            updated_at: now,
          })
          .execute();
      }
      for (const [i, a] of DEFAULT_WARNING_ACTIONS.entries()) {
        await this.db.q
          .insertInto('warning_actions')
          .values({
            threshold_points: a.threshold,
            action: a.action,
            mode: a.mode,
            duration_ms: a.durationDays ? a.durationDays * DAY : null,
            sort_order: i,
            created_at: now,
            updated_at: now,
          })
          .execute();
      }

      const categoryIds = new Map<string, number>();
      for (const [i, c] of DEFAULT_ACHIEVEMENT_CATEGORIES.entries()) {
        const row = await this.db.q
          .insertInto('achievement_categories')
          .values({ name: c.name, description: c.description, sort_order: i, created_at: now })
          .returning('id')
          .executeTakeFirstOrThrow();
        categoryIds.set(c.key, row.id);
      }
      for (const [i, a] of DEFAULT_ACHIEVEMENTS.entries()) {
        await this.db.q
          .insertInto('achievements')
          .values({
            key: a.key,
            category_id: categoryIds.get(a.category) ?? null,
            name: a.name,
            description: a.description,
            tier: a.tier,
            points: a.points,
            is_hidden: a.hidden ?? false,
            criteria_type: a.criteriaType,
            criteria_json: a.criteria ? toJson(a.criteria) : null,
            sort_order: i,
            created_at: now,
            updated_at: now,
          })
          .execute();
      }

      await this.setState(SEEDED_KEY, String(now));
    });
  }

  private async ensurePermissionProfiles(): Promise<void> {
    const existing = await this.db.q.selectFrom('permission_profiles').select('key').where('key', 'is not', null).execute();
    const keys = new Set(existing.map((r) => r.key));
    let created = false;
    for (const p of DEFAULT_PERMISSION_PROFILES) {
      if (keys.has(p.key)) continue;
      await this.db.q
        .insertInto('permission_profiles')
        .values({ key: p.key, name: p.name, description: p.description, is_system: 1, created_at: this.clock.now() })
        .execute();
      created = true;
    }
    if (created) await this.permissions.invalidate();
  }

  private async applyPermissionDefaults(): Promise<void> {
    await this.ensurePermissionProfiles();
    const applied = new Set<string>(JSON.parse((await this.getState(APPLIED_PERMISSIONS_KEY)) ?? '[]') as string[]);
    const pendingGlobal = GLOBAL_PERMISSIONS.filter((p) => !applied.has(p.key));
    const profiles = (await this.permissions.profiles()).filter((p) => p.key && p.is_system);
    const pendingBoard = profiles.flatMap((profile) =>
      BOARD_PERMISSIONS.filter((p) => !applied.has(`${profile.key}/${p.key}`)).map((p) => ({ profile, p })),
    );
    if (!pendingGlobal.length && !pendingBoard.length) return;
    const groups = await this.groups.all();
    const bySystemKey = new Map(groups.filter((g) => g.system_key).map((g) => [g.system_key!, g.id]));
    await this.db.tx(async () => {
      for (const p of pendingGlobal) {
        for (const [systemKey, value] of Object.entries(p.defaults)) {
          const groupId = bySystemKey.get(systemKey);
          if (!groupId || value === undefined) continue;
          await this.db.q
            .insertInto('group_permissions')
            .values({ group_id: groupId, permission: p.key, value })
            .onConflict((oc) => oc.columns(['group_id', 'permission']).doNothing())
            .execute();
        }
        applied.add(p.key);
      }
      for (const { profile, p } of pendingBoard) {
        for (const [systemKey, value] of Object.entries(boardProfileDefaults(profile.key!, p.key, p.defaults))) {
          const groupId = bySystemKey.get(systemKey);
          if (!groupId || value === undefined) continue;
          await this.db.q
            .insertInto('permission_profile_entries')
            .values({ profile_id: profile.id, group_id: groupId, permission: p.key, value })
            .onConflict((oc) => oc.columns(['profile_id', 'group_id', 'permission']).doNothing())
            .execute();
        }
        applied.add(`${profile.key}/${p.key}`);
      }
      await this.setState(APPLIED_PERMISSIONS_KEY, JSON.stringify([...applied].sort()));
      await this.permissions.invalidate();
    });
    this.logger.log(`${pendingGlobal.length + pendingBoard.length} yetki varsayılanı uygulandı.`);
  }

  private async seedForum(): Promise<void> {
    if (await this.getState(SEEDED_FORUM_KEY)) return;
    const locale = this.i18n.defaultLocale();
    await this.forumSeed.seed((text) => this.i18n.t(locale, text));
    await this.setState(SEEDED_FORUM_KEY, String(this.clock.now()));
  }

  private async ensureAdmin(): Promise<boolean> {
    const adminGroup = await this.groups.bySystemKey('admin');
    const existing = await this.db.q
      .selectFrom('users')
      .select('users.id')
      .where('deleted_at', 'is', null)
      .where((eb) =>
        eb.or([
          eb('primary_group_id', '=', adminGroup.id),
          eb.exists(
            eb
              .selectFrom('group_members')
              .select('group_members.user_id')
              .whereRef('group_members.user_id', '=', 'users.id')
              .where('group_members.group_id', '=', adminGroup.id),
          ),
        ]),
      )
      .executeTakeFirst();
    if (existing) return true;

    const { username, email, password } = this.config.admin;
    if (!password) return false;

    const clash = await this.users.findByIdentifier(username);
    if (clash) {
      this.logger.warn(`"${username}" kullanıcısı var ama yönetici değil; varsayılan yönetici oluşturulmadı.`);
      return false;
    }

    const user = await this.users.create({
      username,
      displayName: username,
      email,
      passwordHash: await this.hasher.hash(password),
      status: 'active',
      emailVerifiedAt: this.clock.now(),
      ip: null,
      primaryGroupId: adminGroup.id,
      mustChangePassword: false,
    });
    await this.policies.acceptAllCurrent(user.id, null);
    await this.groups.invalidate();
    this.logger.log(`Yönetici oluşturuldu (ADMIN_PASSWORD): ${username}`);
    return true;
  }
}
