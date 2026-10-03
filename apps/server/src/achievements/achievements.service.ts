import { Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock, DAY } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { StorageService } from '../storage/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EventsService, type AppEventName } from '../events/events.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { UsersService } from '../users/users.service.js';
import { CacheService } from '../cache/cache.service.js';
import { bool, fromJson, toJson } from '../database/json.js';
import { CRITERIA, CRITERIA_MAP } from './criteria.js';

const NS = 'achievements';
const EVAL_JOB = 'achievements.evaluate';
const BACKFILL_JOB = 'achievements.backfill';
const BATCH = 500;

export const TIER_LABELS: Record<number, string> = { 1: 'Bronz', 2: 'Gümüş', 3: 'Altın', 4: 'Platin', 5: 'Elmas' };

export const achievementInputSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,49}$/, 'Anahtar küçük harf, rakam ve tire içerebilir.'),
  categoryId: z.number().int().positive().nullable().default(null),
  name: z.string().trim().min(1, 'Ad gerekli.').max(80),
  description: z.string().trim().max(500).default(''),
  tier: z.number().int().min(1).max(5).default(1),
  seriesKey: z.string().trim().max(50).nullable().default(null),
  points: z.number().int().min(0).max(100_000).default(10),
  isHidden: z.boolean().default(false),
  isActive: z.boolean().default(true),
  criteriaType: z.string().nullable().default(null),
  criteria: z.record(z.string(), z.unknown()).default({}),
  sortOrder: z.number().int().default(0),
});
export type AchievementInput = z.infer<typeof achievementInputSchema>;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Ad gerekli.').max(60),
  description: z.string().trim().max(300).default(''),
  sortOrder: z.number().int().default(0),
});

type CachedAchievement = Row<'achievements'> & { iconUrl: string | null };

export interface AchievementDto {
  id: number;
  key: string;
  categoryId: number | null;
  name: string;
  description: string;
  iconUrl: string | null;
  tier: number;
  tierLabel: string;
  seriesKey: string | null;
  points: number;
  isHidden: boolean;
  isActive: boolean;
  criteriaType: string | null;
  criteria: Record<string, unknown>;
  awardedCount: number;
  sortOrder: number;
}

@Injectable()
export class AchievementsService implements OnModuleInit {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsService,
    private readonly jobs: JobsService,
    private readonly users: UsersService,
    private readonly cache: CacheService,
  ) {}

  onModuleInit(): void {
    const triggers = new Set<AppEventName>();
    for (const c of CRITERIA) for (const t of c.triggers) if (t !== 'daily') triggers.add(t);
    for (const t of triggers) {
      this.events.on(t, (payload: { userId: number }) => this.jobs.enqueue(EVAL_JOB, { userId: payload.userId, trigger: t }));
    }
    this.jobs.register<{ userId: number; trigger: string }>(EVAL_JOB, (p) => this.evaluateUser(p.userId, p.trigger).then(() => undefined));
    this.jobs.register<{ achievementId: number; afterId: number; source?: 'auto' | 'backfill' }>(BACKFILL_JOB, (p) =>
      this.backfillBatch(p.achievementId, p.afterId, p.source ?? 'backfill'),
    );
    this.jobs.schedule('achievements.daily', DAY, () => this.runDaily());
  }

  async all(): Promise<CachedAchievement[]> {
    return this.cache.wrap(NS, 'all', async () => {
      const rows = await this.db.q
        .selectFrom('achievements')
        .leftJoin('files', 'files.id', 'achievements.icon_file_id')
        .selectAll('achievements')
        .select('files.path as icon_path')
        .orderBy('achievements.sort_order')
        .orderBy('achievements.id')
        .execute();
      return rows.map(({ icon_path, ...a }) => ({ ...a, iconUrl: this.storage.publicUrl(icon_path ? { path: icon_path } : null) }));
    });
  }

  toDto(a: CachedAchievement): AchievementDto {
    return {
      id: a.id,
      key: a.key,
      categoryId: a.category_id,
      name: a.name,
      description: a.description,
      iconUrl: a.iconUrl,
      tier: a.tier,
      tierLabel: TIER_LABELS[a.tier] ?? String(a.tier),
      seriesKey: a.series_key,
      points: a.points,
      isHidden: bool(a.is_hidden),
      isActive: bool(a.is_active),
      criteriaType: a.criteria_type,
      criteria: fromJson<Record<string, unknown>>(a.criteria_json, {}),
      awardedCount: a.awarded_count,
      sortOrder: a.sort_order,
    };
  }

  async categories() {
    const rows = await this.db.q.selectFrom('achievement_categories').selectAll().orderBy('sort_order').orderBy('id').execute();
    return rows.map((c) => ({ id: c.id, name: c.name, description: c.description, sortOrder: c.sort_order }));
  }

  criteriaTypes() {
    return CRITERIA.map((c) => ({ type: c.type, label: c.label, description: c.description, fields: c.fields }));
  }

  async catalog(viewerUserId: number | null) {
    const all = (await this.all()).filter((a) => bool(a.is_active));
    const earned = viewerUserId ? await this.earnedMap(viewerUserId) : new Map<number, number>();
    const totalMembers = await this.db.q
      .selectFrom('users')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('status', '=', 'active')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    const members = Math.max(1, Number(totalMembers?.n ?? 1));
    const progress = viewerUserId ? await this.progressFor(viewerUserId, all.filter((a) => !earned.has(a.id))) : new Map();
    return {
      categories: await this.categories(),
      items: all.map((a) => {
        const dto = this.toDto(a);
        const hiddenForViewer = dto.isHidden && !earned.has(a.id);
        return {
          ...(hiddenForViewer
            ? { ...dto, name: 'Gizli başarı', description: 'Bu başarıyı kazanınca ayrıntılarını görebilirsiniz.', iconUrl: null, criteria: {}, criteriaType: null }
            : dto),
          earnedAt: earned.get(a.id) ?? null,
          rarity: Math.round((a.awarded_count / members) * 1000) / 10,
          progress: hiddenForViewer ? null : (progress.get(a.id) ?? null),
        };
      }),
    };
  }

  private async earnedMap(userId: number): Promise<Map<number, number>> {
    const rows = await this.db.q
      .selectFrom('user_achievements')
      .select(['achievement_id', 'awarded_at'])
      .where('user_id', '=', userId)
      .execute();
    return new Map(rows.map((r) => [r.achievement_id, r.awarded_at]));
  }

  private async progressFor(userId: number, list: CachedAchievement[]) {
    const out = new Map<number, { current: number; target: number }>();
    const ctx = { db: this.db.q, now: this.clock.now() };
    for (const a of list) {
      const c = a.criteria_type ? CRITERIA_MAP.get(a.criteria_type) : undefined;
      if (!c) continue;
      const cfg = c.schema.safeParse(fromJson(a.criteria_json, {}));
      if (!cfg.success) continue;
      const r = await c.evaluate(ctx, userId, cfg.data);
      if (r.target !== undefined && r.progress !== undefined) out.set(a.id, { current: r.progress, target: r.target });
    }
    return out;
  }

  async forUser(userId: number) {
    const rows = await this.db.q
      .selectFrom('user_achievements')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('awarded_at', 'desc')
      .execute();
    const map = new Map((await this.all()).map((a) => [a.id, a]));
    return rows
      .filter((r) => map.has(r.achievement_id))
      .map((r) => ({
        ...this.toDto(map.get(r.achievement_id)!),
        awardedAt: r.awarded_at,
        source: r.source,
        reason: r.reason,
        isFeatured: bool(r.is_featured),
      }));
  }

  async setFeatured(userId: number, achievementIds: number[]): Promise<void> {
    const max = this.settings.get('achievements.featuredMax');
    if (achievementIds.length > max) throw Errors.badRequest(`En fazla ${max} başarı öne çıkarılabilir.`);
    await this.db.tx(async () => {
      await this.db.q.updateTable('user_achievements').set({ is_featured: 0 }).where('user_id', '=', userId).execute();
      if (achievementIds.length) {
        await this.db.q
          .updateTable('user_achievements')
          .set({ is_featured: 1 })
          .where('user_id', '=', userId)
          .where('achievement_id', 'in', achievementIds)
          .execute();
      }
    });
  }

  async holders(achievementId: number, page: number, perPage: number) {
    const [rows, total] = await Promise.all([
      this.db.q
        .selectFrom('user_achievements')
        .selectAll()
        .where('achievement_id', '=', achievementId)
        .orderBy('awarded_at', 'desc')
        .limit(perPage)
        .offset((page - 1) * perPage)
        .execute(),
      this.db.q
        .selectFrom('user_achievements')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('achievement_id', '=', achievementId)
        .executeTakeFirst(),
    ]);
    const people = await this.users.summaries(rows.flatMap((r) => [r.user_id, r.awarded_by ?? 0]));
    return {
      items: rows.map((r) => ({
        user: people.get(r.user_id) ?? null,
        awardedAt: r.awarded_at,
        source: r.source,
        reason: r.reason,
        awardedBy: r.awarded_by ? (people.get(r.awarded_by) ?? null) : null,
      })),
      total: Number(total?.n ?? 0),
      page,
      perPage,
    };
  }

  async award(
    userId: number,
    achievementId: number,
    source: 'auto' | 'manual' | 'backfill',
    awardedBy: number | null = null,
    reason: string | null = null,
  ): Promise<boolean> {
    const a = (await this.all()).find((x) => x.id === achievementId);
    if (!a) throw Errors.notFound('Başarı bulunamadı.');
    return this.db.tx(async () => {
      const inserted = await this.db.q
        .insertInto('user_achievements')
        .values({ user_id: userId, achievement_id: achievementId, source, awarded_by: awardedBy, reason, awarded_at: this.clock.now() })
        .onConflict((oc) => oc.columns(['user_id', 'achievement_id']).doNothing())
        .executeTakeFirst();
      if (!Number(inserted.numInsertedOrUpdatedRows ?? 0)) return false;
      await this.db.q
        .updateTable('achievements')
        .set((eb) => ({ awarded_count: eb('awarded_count', '+', 1) }))
        .where('id', '=', achievementId)
        .execute();
      await this.db.q
        .updateTable('users')
        .set((eb) => ({ achievement_points: eb('achievement_points', '+', a.points) }))
        .where('id', '=', userId)
        .execute();
      await this.notifications.notify(
        userId,
        'achievement.awarded',
        { achievementId, name: a.name, tier: a.tier, points: a.points, iconUrl: a.iconUrl },
        awardedBy,
      );
      await this.cache.invalidate(NS);
      this.events.emit('achievement.awarded', { userId, achievementId });
      return true;
    });
  }

  async revoke(userId: number, achievementId: number): Promise<void> {
    const a = (await this.all()).find((x) => x.id === achievementId);
    if (!a) throw Errors.notFound('Başarı bulunamadı.');
    await this.db.tx(async () => {
      const r = await this.db.q
        .deleteFrom('user_achievements')
        .where('user_id', '=', userId)
        .where('achievement_id', '=', achievementId)
        .executeTakeFirst();
      if (!Number(r.numDeletedRows)) throw Errors.notFound('Üye bu başarıya sahip değil.');
      await this.db.q
        .updateTable('achievements')
        .set((eb) => ({ awarded_count: eb('awarded_count', '-', 1) }))
        .where('id', '=', achievementId)
        .execute();
      await this.db.q
        .updateTable('users')
        .set((eb) => ({ achievement_points: eb('achievement_points', '-', a.points) }))
        .where('id', '=', userId)
        .execute();
      await this.cache.invalidate(NS);
    });
  }

  async evaluateUser(userId: number, trigger: string | 'all'): Promise<number[]> {
    if (!this.settings.get('achievements.enabled')) return [];
    const user = await this.db.q.selectFrom('users').select(['id', 'status']).where('id', '=', userId).executeTakeFirst();
    if (!user || user.status !== 'active') return [];
    const earned = await this.earnedMap(userId);
    const ctx = { db: this.db.q, now: this.clock.now() };
    const awarded: number[] = [];
    for (const a of await this.all()) {
      if (!bool(a.is_active) || !a.criteria_type || earned.has(a.id)) continue;
      const c = CRITERIA_MAP.get(a.criteria_type);
      if (!c || (trigger !== 'all' && !c.triggers.includes(trigger as never))) continue;
      const cfg = c.schema.safeParse(fromJson(a.criteria_json, {}));
      if (!cfg.success) continue;
      if ((await c.evaluate(ctx, userId, cfg.data)).met && (await this.award(userId, a.id, 'auto'))) awarded.push(a.id);
    }
    return awarded;
  }

  async runDaily(): Promise<void> {
    if (!this.settings.get('achievements.enabled')) return;
    for (const a of await this.all()) {
      if (!bool(a.is_active) || !a.criteria_type) continue;
      const c = CRITERIA_MAP.get(a.criteria_type);
      if (c?.triggers.includes('daily')) await this.jobs.enqueue(BACKFILL_JOB, { achievementId: a.id, afterId: 0, source: 'auto' });
    }
  }

  async startBackfill(achievementId: number): Promise<void> {
    const a = (await this.all()).find((x) => x.id === achievementId);
    if (!a) throw Errors.notFound('Başarı bulunamadı.');
    if (!a.criteria_type) throw Errors.badRequest('Elle verilen başarılar için geriye dönük dağıtım yapılamaz.');
    await this.jobs.enqueue(BACKFILL_JOB, { achievementId, afterId: 0, source: 'backfill' });
  }

  private async backfillBatch(achievementId: number, afterId: number, source: 'auto' | 'backfill'): Promise<void> {
    const a = (await this.all()).find((x) => x.id === achievementId);
    if (!a || !bool(a.is_active) || !a.criteria_type) return;
    const c = CRITERIA_MAP.get(a.criteria_type);
    if (!c) return;
    const cfg = c.schema.safeParse(fromJson(a.criteria_json, {}));
    if (!cfg.success) return;
    const ctx = { db: this.db.q, now: this.clock.now() };

    let qualified: number[];
    let lastScanned: number;
    let more: boolean;
    if (c.qualifying) {
      qualified = await c.qualifying(ctx, cfg.data, afterId, BATCH);
      lastScanned = qualified[qualified.length - 1] ?? afterId;
      more = qualified.length >= BATCH;
    } else {
      const rows = await this.db.q
        .selectFrom('users')
        .select('id')
        .where('status', '=', 'active')
        .where('deleted_at', 'is', null)
        .where('id', '>', afterId)
        .orderBy('id')
        .limit(BATCH)
        .execute();
      qualified = [];
      for (const r of rows) if ((await c.evaluate(ctx, r.id, cfg.data)).met) qualified.push(r.id);
      lastScanned = rows[rows.length - 1]?.id ?? afterId;
      more = rows.length >= BATCH;
    }

    if (qualified.length) {
      const earned = new Set(
        (
          await this.db.q
            .selectFrom('user_achievements')
            .select('user_id')
            .where('achievement_id', '=', achievementId)
            .where('user_id', 'in', qualified)
            .execute()
        ).map((r) => r.user_id),
      );
      for (const userId of qualified) if (!earned.has(userId)) await this.award(userId, achievementId, source);
    }
    if (more) await this.jobs.enqueue(BACKFILL_JOB, { achievementId, afterId: lastScanned, source });
  }

  private validateCriteria(input: AchievementInput): string | null {
    if (!input.criteriaType) return null;
    const c = CRITERIA_MAP.get(input.criteriaType);
    if (!c) throw Errors.field('criteriaType', 'Bilinmeyen kriter türü.');
    const parsed = c.schema.safeParse(input.criteria);
    if (!parsed.success) throw Errors.field('criteria', 'Kriter ayarları geçersiz.');
    return toJson(parsed.data);
  }

  async create(input: AchievementInput): Promise<number> {
    const criteriaJson = this.validateCriteria(input);
    const exists = await this.db.q.selectFrom('achievements').select('id').where('key', '=', input.key).executeTakeFirst();
    if (exists) throw Errors.conflict('Bu anahtar kullanılıyor.', { key: 'Bu anahtar kullanılıyor.' });
    const now = this.clock.now();
    const row = await this.db.q
      .insertInto('achievements')
      .values({
        key: input.key,
        category_id: input.categoryId,
        name: input.name,
        description: input.description,
        tier: input.tier,
        series_key: input.seriesKey,
        points: input.points,
        is_hidden: input.isHidden,
        is_active: input.isActive,
        criteria_type: input.criteriaType,
        criteria_json: criteriaJson,
        sort_order: input.sortOrder,
        created_at: now,
        updated_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.cache.invalidate(NS);
    return row.id;
  }

  async update(id: number, input: AchievementInput): Promise<void> {
    const criteriaJson = this.validateCriteria(input);
    const existing = (await this.all()).find((a) => a.id === id);
    if (!existing) throw Errors.notFound('Başarı bulunamadı.');
    if (existing.key !== input.key) {
      const clash = await this.db.q.selectFrom('achievements').select('id').where('key', '=', input.key).executeTakeFirst();
      if (clash) throw Errors.conflict('Bu anahtar kullanılıyor.', { key: 'Bu anahtar kullanılıyor.' });
    }
    await this.db.tx(async () => {
      await this.db.q
        .updateTable('achievements')
        .set({
          key: input.key,
          category_id: input.categoryId,
          name: input.name,
          description: input.description,
          tier: input.tier,
          series_key: input.seriesKey,
          points: input.points,
          is_hidden: input.isHidden,
          is_active: input.isActive,
          criteria_type: input.criteriaType,
          criteria_json: criteriaJson,
          sort_order: input.sortOrder,
          updated_at: this.clock.now(),
        })
        .where('id', '=', id)
        .execute();
      const diff = input.points - existing.points;
      if (diff !== 0) {
        await this.db.q
          .updateTable('users')
          .set((eb) => ({ achievement_points: eb('achievement_points', '+', diff) }))
          .where((eb) =>
            eb.exists(
              eb
                .selectFrom('user_achievements')
                .select('user_achievements.user_id')
                .whereRef('user_achievements.user_id', '=', 'users.id')
                .where('user_achievements.achievement_id', '=', id),
            ),
          )
          .execute();
      }
      await this.cache.invalidate(NS);
    });
  }

  async delete(id: number): Promise<void> {
    const existing = (await this.all()).find((a) => a.id === id);
    if (!existing) throw Errors.notFound('Başarı bulunamadı.');
    await this.db.tx(async () => {
      await this.db.q
        .updateTable('users')
        .set((eb) => ({ achievement_points: eb('achievement_points', '-', existing.points) }))
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom('user_achievements')
              .select('user_achievements.user_id')
              .whereRef('user_achievements.user_id', '=', 'users.id')
              .where('user_achievements.achievement_id', '=', id),
          ),
        )
        .execute();
      await this.db.q.deleteFrom('user_achievements').where('achievement_id', '=', id).execute();
      await this.db.q.deleteFrom('achievements').where('id', '=', id).execute();
      await this.storage.delete(existing.icon_file_id);
      await this.cache.invalidate(NS);
    });
  }

  async setIcon(id: number, file: Buffer | null): Promise<void> {
    const existing = (await this.all()).find((a) => a.id === id);
    if (!existing) throw Errors.notFound('Başarı bulunamadı.');
    await this.db.tx(async () => {
      let fileId: number | null = null;
      if (file) {
        const saved = await this.storage.saveImage(file, {
          purpose: 'achievement_icon',
          ownerUserId: null,
          maxBytes: 512 * 1024,
          maxDimension: 1024,
          resizeTo: 256,
          allowGif: true,
        });
        fileId = saved.id;
      }
      await this.db.q.updateTable('achievements').set({ icon_file_id: fileId, updated_at: this.clock.now() }).where('id', '=', id).execute();
      await this.storage.delete(existing.icon_file_id);
      await this.cache.invalidate(NS);
    });
  }

  async saveCategory(id: number | null, input: z.infer<typeof categoryInputSchema>): Promise<number> {
    if (id) {
      await this.db.q
        .updateTable('achievement_categories')
        .set({ name: input.name, description: input.description, sort_order: input.sortOrder })
        .where('id', '=', id)
        .execute();
      return id;
    }
    const row = await this.db.q
      .insertInto('achievement_categories')
      .values({ name: input.name, description: input.description, sort_order: input.sortOrder, created_at: this.clock.now() })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async deleteCategory(id: number): Promise<void> {
    await this.db.tx(async () => {
      await this.db.q.updateTable('achievements').set({ category_id: null }).where('category_id', '=', id).execute();
      await this.db.q.deleteFrom('achievement_categories').where('id', '=', id).execute();
      await this.cache.invalidate(NS);
    });
  }
}
