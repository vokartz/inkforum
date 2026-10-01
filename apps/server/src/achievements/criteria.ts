import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { DB } from '@forum/db';
import { DAY } from '../common/clock.js';
import type { AppEventName } from '../events/events.service.js';

export interface CriterionContext {
  db: Kysely<DB>;
  now: number;
}

export interface CriterionResult {
  met: boolean;
  progress?: number;
  target?: number;
}

export interface CriterionField {
  key: string;
  label: string;
  type: 'number' | 'group';
  min?: number;
}

export interface Criterion<C = any> {
  type: string;
  label: string;
  description: string;
  fields: CriterionField[];
  schema: z.ZodType<C>;
  /** Hangi olaylar bu kriteri yeniden değerlendirmeyi tetikler. `daily` = günlük görev. */
  triggers: Array<AppEventName | 'daily'>;
  evaluate(ctx: CriterionContext, userId: number, cfg: C): Promise<CriterionResult>;
  /** Toplu değerlendirme (geriye dönük dağıtım ve günlük görev) için verimli SQL yolu. */
  qualifying?(ctx: CriterionContext, cfg: C, afterId: number, limit: number): Promise<number[]>;
}

const activeUsers = (ctx: CriterionContext) =>
  ctx.db.selectFrom('users').where('users.deleted_at', 'is', null).where('users.status', '=', 'active');

const empty = z.object({}).default({});

export const CRITERIA: Criterion[] = [
  {
    type: 'membership_days',
    label: 'Üyelik süresi',
    description: 'Üye belirtilen gün kadar kayıtlı kaldığında verilir.',
    fields: [{ key: 'days', label: 'Gün', type: 'number', min: 1 }],
    schema: z.object({ days: z.number().int().min(1).max(36500) }),
    triggers: ['daily', 'user.activated'],
    async evaluate(ctx, userId, cfg) {
      const u = await ctx.db.selectFrom('users').select('registered_at').where('id', '=', userId).executeTakeFirst();
      const days = u ? Math.floor((ctx.now - u.registered_at) / DAY) : 0;
      return { met: days >= cfg.days, progress: Math.min(days, cfg.days), target: cfg.days };
    },
    async qualifying(ctx, cfg, afterId, limit) {
      const rows = await activeUsers(ctx)
        .select('users.id')
        .where('users.registered_at', '<=', ctx.now - cfg.days * DAY)
        .where('users.id', '>', afterId)
        .orderBy('users.id')
        .limit(limit)
        .execute();
      return rows.map((r) => r.id);
    },
  },
  {
    type: 'post_count',
    label: 'Mesaj sayısı',
    description: 'Üye belirtilen sayıda mesaja ulaştığında verilir.',
    fields: [{ key: 'count', label: 'Mesaj sayısı', type: 'number', min: 1 }],
    schema: z.object({ count: z.number().int().min(1).max(10_000_000) }),
    triggers: ['user.postCountChanged'],
    async evaluate(ctx, userId, cfg) {
      const u = await ctx.db.selectFrom('users').select('post_count').where('id', '=', userId).executeTakeFirst();
      const n = u?.post_count ?? 0;
      return { met: n >= cfg.count, progress: Math.min(n, cfg.count), target: cfg.count };
    },
    async qualifying(ctx, cfg, afterId, limit) {
      const rows = await activeUsers(ctx)
        .select('users.id')
        .where('users.post_count', '>=', cfg.count)
        .where('users.id', '>', afterId)
        .orderBy('users.id')
        .limit(limit)
        .execute();
      return rows.map((r) => r.id);
    },
  },
  {
    type: 'email_verified',
    label: 'E-posta doğrulandı',
    description: 'Üye e-posta adresini doğruladığında verilir.',
    fields: [],
    schema: empty,
    triggers: ['user.emailVerified', 'user.activated'],
    async evaluate(ctx, userId) {
      const u = await ctx.db.selectFrom('users').select('email_verified_at').where('id', '=', userId).executeTakeFirst();
      return { met: !!u?.email_verified_at };
    },
    async qualifying(ctx, _cfg, afterId, limit) {
      const rows = await activeUsers(ctx)
        .select('users.id')
        .where('users.email_verified_at', 'is not', null)
        .where('users.id', '>', afterId)
        .orderBy('users.id')
        .limit(limit)
        .execute();
      return rows.map((r) => r.id);
    },
  },
  {
    type: 'avatar_set',
    label: 'Avatar yüklendi',
    description: 'Üye profil fotoğrafı yüklediğinde verilir.',
    fields: [],
    schema: empty,
    triggers: ['user.avatarChanged'],
    async evaluate(ctx, userId) {
      const u = await ctx.db.selectFrom('users').select('avatar_file_id').where('id', '=', userId).executeTakeFirst();
      return { met: !!u?.avatar_file_id };
    },
    async qualifying(ctx, _cfg, afterId, limit) {
      const rows = await activeUsers(ctx)
        .select('users.id')
        .where('users.avatar_file_id', 'is not', null)
        .where('users.id', '>', afterId)
        .orderBy('users.id')
        .limit(limit)
        .execute();
      return rows.map((r) => r.id);
    },
  },
  {
    type: 'profile_completed',
    label: 'Profil tamamlandı',
    description: 'Avatar, hakkımda ve konum/web sitesi bilgileri dolu olduğunda verilir.',
    fields: [],
    schema: empty,
    triggers: ['user.profileUpdated', 'user.avatarChanged'],
    async evaluate(ctx, userId) {
      const r = await ctx.db
        .selectFrom('users')
        .innerJoin('user_profiles', 'user_profiles.user_id', 'users.id')
        .select(['users.avatar_file_id', 'user_profiles.bio', 'user_profiles.location', 'user_profiles.website_url'])
        .where('users.id', '=', userId)
        .executeTakeFirst();
      const steps = r ? [!!r.avatar_file_id, !!r.bio.trim(), !!(r.location.trim() || r.website_url.trim())] : [];
      const done = steps.filter(Boolean).length;
      return { met: done === 3, progress: done, target: 3 };
    },
    async qualifying(ctx, _cfg, afterId, limit) {
      const rows = await activeUsers(ctx)
        .innerJoin('user_profiles', 'user_profiles.user_id', 'users.id')
        .select('users.id')
        .where('users.avatar_file_id', 'is not', null)
        .where('user_profiles.bio', '!=', '')
        .where((eb) => eb.or([eb('user_profiles.location', '!=', ''), eb('user_profiles.website_url', '!=', '')]))
        .where('users.id', '>', afterId)
        .orderBy('users.id')
        .limit(limit)
        .execute();
      return rows.map((r) => r.id);
    },
  },
  {
    type: 'two_factor_enabled',
    label: 'İki adımlı doğrulama',
    description: 'Üye iki adımlı doğrulamayı etkinleştirdiğinde verilir.',
    fields: [],
    schema: empty,
    triggers: ['user.twoFactorChanged'],
    async evaluate(ctx, userId) {
      const r = await ctx.db.selectFrom('user_totp').select('enabled_at').where('user_id', '=', userId).executeTakeFirst();
      return { met: !!r?.enabled_at };
    },
    async qualifying(ctx, _cfg, afterId, limit) {
      const rows = await activeUsers(ctx)
        .innerJoin('user_totp', 'user_totp.user_id', 'users.id')
        .select('users.id')
        .where('user_totp.enabled_at', 'is not', null)
        .where('users.id', '>', afterId)
        .orderBy('users.id')
        .limit(limit)
        .execute();
      return rows.map((r) => r.id);
    },
  },
  {
    type: 'in_group',
    label: 'Grup üyeliği',
    description: 'Üye belirtilen grubun üyesi olduğunda verilir (ana, ek veya mesaj grubu).',
    fields: [{ key: 'groupId', label: 'Grup', type: 'group' }],
    schema: z.object({ groupId: z.number().int().positive() }),
    triggers: ['user.groupsChanged', 'daily'],
    async evaluate(ctx, userId, cfg) {
      const u = await ctx.db
        .selectFrom('users')
        .select(['primary_group_id', 'post_group_id'])
        .where('id', '=', userId)
        .executeTakeFirst();
      if (!u) return { met: false };
      if (u.primary_group_id === cfg.groupId || u.post_group_id === cfg.groupId) return { met: true };
      const m = await ctx.db
        .selectFrom('group_members')
        .select('user_id')
        .where('user_id', '=', userId)
        .where('group_id', '=', cfg.groupId)
        .executeTakeFirst();
      return { met: !!m };
    },
  },
  {
    type: 'achievement_points_total',
    label: 'Başarı puanı',
    description: 'Üyenin toplam başarı puanı belirtilen değere ulaştığında verilir.',
    fields: [{ key: 'points', label: 'Puan', type: 'number', min: 1 }],
    schema: z.object({ points: z.number().int().min(1).max(10_000_000) }),
    triggers: ['achievement.awarded'],
    async evaluate(ctx, userId, cfg) {
      const u = await ctx.db.selectFrom('users').select('achievement_points').where('id', '=', userId).executeTakeFirst();
      const n = u?.achievement_points ?? 0;
      return { met: n >= cfg.points, progress: Math.min(n, cfg.points), target: cfg.points };
    },
    async qualifying(ctx, cfg, afterId, limit) {
      const rows = await activeUsers(ctx)
        .select('users.id')
        .where('users.achievement_points', '>=', cfg.points)
        .where('users.id', '>', afterId)
        .orderBy('users.id')
        .limit(limit)
        .execute();
      return rows.map((r) => r.id);
    },
  },
];

export const CRITERIA_MAP = new Map(CRITERIA.map((c) => [c.type, c]));
