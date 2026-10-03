import { Injectable } from '@nestjs/common';
import { canonicalEmail, canonicalName, emailDomain, type ViewerBan } from '@forum/shared';
import type { BanTriggerType, Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { CacheService } from '../cache/cache.service.js';
import { EventsService } from '../events/events.service.js';
import { Clock, MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { bool } from '../database/json.js';
import { ipToHex, parseIpPattern } from './ip.js';

export type BanContext = 'access' | 'login' | 'register' | 'post';

export interface BanSubject {
  userId?: number | null;
  ip?: string | null;
  email?: string | null;
  username?: string | null;
}

export interface BanMatch {
  banId: number;
  triggerId: number;
  reason: string | null;
  expiresAt: number | null;
  cannotAccess: boolean;
  cannotLogin: boolean;
  cannotRegister: boolean;
  cannotPost: boolean;
}

interface CompiledTrigger {
  id: number;
  ban: Row<'bans'>;
}

interface Matcher {
  builtAt: number;
  ipRanges: Array<{ low: string; high: string; t: CompiledTrigger }>;
  emails: Map<string, CompiledTrigger[]>;
  emailPatterns: Array<{ re: RegExp; t: CompiledTrigger }>;
  domains: Array<{ domain: string; wildcard: boolean; t: CompiledTrigger }>;
  usernames: Map<string, CompiledTrigger[]>;
  usernamePatterns: Array<{ re: RegExp; t: CompiledTrigger }>;
  users: Map<number, CompiledTrigger[]>;
}

export const BANS_NS = 'bans';

export interface TriggerInput {
  type: BanTriggerType;
  value: string;
}

export interface BanInput {
  name: string;
  reasonPublic: string | null;
  notesPrivate: string | null;
  cannotAccess: boolean;
  cannotLogin: boolean;
  cannotRegister: boolean;
  cannotPost: boolean;
  expiresAt: number | null;
  triggers: TriggerInput[];
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

@Injectable()
export class BansService {
  private readonly hitThrottle = new Map<string, number>();

  constructor(
    private readonly db: Db,
    private readonly cache: CacheService,
    private readonly clock: Clock,
    private readonly events: EventsService,
  ) {}

  private async matcher(): Promise<Matcher> {
    return this.cache.wrap(
      BANS_NS,
      'matcher',
      async () => {
        const now = this.clock.now();
        const bans = await this.db.q
          .selectFrom('bans')
          .selectAll()
          .where('lifted_at', 'is', null)
          .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]))
          .execute();
        const banMap = new Map(bans.map((b) => [b.id, b]));
        const triggers = bans.length
          ? await this.db.q.selectFrom('ban_triggers').selectAll().where('ban_id', 'in', [...banMap.keys()]).execute()
          : [];
        const m: Matcher = {
          builtAt: now,
          ipRanges: [],
          emails: new Map(),
          emailPatterns: [],
          domains: [],
          usernames: new Map(),
          usernamePatterns: [],
          users: new Map(),
        };
        const push = <K>(map: Map<K, CompiledTrigger[]>, key: K, t: CompiledTrigger) => {
          const list = map.get(key) ?? [];
          list.push(t);
          map.set(key, list);
        };
        for (const tr of triggers) {
          const t: CompiledTrigger = { id: tr.id, ban: banMap.get(tr.ban_id)! };
          switch (tr.type) {
            case 'ip':
            case 'ip_range':
              if (tr.ip_low && tr.ip_high) m.ipRanges.push({ low: tr.ip_low, high: tr.ip_high, t });
              break;
            case 'email':
              if (tr.value.includes('*')) m.emailPatterns.push({ re: wildcardToRegex(tr.value), t });
              else push(m.emails, tr.value, t);
              break;
            case 'email_domain': {
              const wildcard = tr.value.startsWith('*.');
              m.domains.push({ domain: wildcard ? tr.value.slice(2) : tr.value, wildcard, t });
              break;
            }
            case 'username':
              if (tr.value.includes('*')) m.usernamePatterns.push({ re: wildcardToRegex(tr.value), t });
              else push(m.usernames, tr.value, t);
              break;
            case 'user':
              if (tr.user_id) push(m.users, tr.user_id, t);
              break;
          }
        }
        return m;
      },
      MINUTE,
    );
  }

  private applies(ban: Row<'bans'>, context: BanContext, now: number): boolean {
    if (ban.lifted_at || (ban.expires_at && ban.expires_at <= now)) return false;
    if (bool(ban.cannot_access)) return true;
    switch (context) {
      case 'access':
        return false;
      case 'login':
        return bool(ban.cannot_login);
      case 'register':
        return bool(ban.cannot_register);
      case 'post':
        return bool(ban.cannot_post);
    }
  }

  async check(context: BanContext, subject: BanSubject): Promise<BanMatch | null> {
    const all = await this.matchAll(subject);
    const now = this.clock.now();
    const hit = all.find((t) => this.applies(t.ban, context, now));
    if (!hit) return null;
    await this.logHit(hit, context, subject);
    return this.toMatch(hit);
  }

  async activeFor(subject: BanSubject): Promise<ViewerBan | null> {
    const all = await this.matchAll(subject);
    const now = this.clock.now();
    const active = all.filter((t) => !t.ban.lifted_at && (!t.ban.expires_at || t.ban.expires_at > now));
    if (!active.length) return null;
    const first = active[0]!.ban;
    return {
      reason: first.reason_public,
      expiresAt: active.some((t) => !t.ban.expires_at) ? null : Math.max(...active.map((t) => t.ban.expires_at ?? 0)),
      cannotPost: active.some((t) => bool(t.ban.cannot_post) || bool(t.ban.cannot_access)),
      cannotAccess: active.some((t) => bool(t.ban.cannot_access)),
    };
  }

  private async matchAll(subject: BanSubject): Promise<CompiledTrigger[]> {
    const m = await this.matcher();
    const out: CompiledTrigger[] = [];
    if (subject.userId) out.push(...(m.users.get(subject.userId) ?? []));
    if (subject.ip) {
      const hex = ipToHex(subject.ip);
      if (hex) for (const r of m.ipRanges) if (hex >= r.low && hex <= r.high) out.push(r.t);
    }
    if (subject.email) {
      const email = canonicalEmail(subject.email);
      out.push(...(m.emails.get(email) ?? []));
      for (const p of m.emailPatterns) if (p.re.test(email)) out.push(p.t);
      const domain = emailDomain(email);
      for (const d of m.domains) {
        if (domain === d.domain || (d.wildcard && domain.endsWith(`.${d.domain}`))) out.push(d.t);
      }
    }
    if (subject.username) {
      const name = canonicalName(subject.username);
      out.push(...(m.usernames.get(name) ?? []));
      for (const p of m.usernamePatterns) if (p.re.test(name)) out.push(p.t);
    }
    return out;
  }

  private toMatch(t: CompiledTrigger): BanMatch {
    return {
      banId: t.ban.id,
      triggerId: t.id,
      reason: t.ban.reason_public,
      expiresAt: t.ban.expires_at,
      cannotAccess: bool(t.ban.cannot_access),
      cannotLogin: bool(t.ban.cannot_login),
      cannotRegister: bool(t.ban.cannot_register),
      cannotPost: bool(t.ban.cannot_post),
    };
  }

  private async logHit(t: CompiledTrigger, context: BanContext, subject: BanSubject): Promise<void> {
    const now = this.clock.now();
    const key = `${t.id}:${context}:${subject.ip ?? ''}:${subject.userId ?? ''}`;
    if ((this.hitThrottle.get(key) ?? 0) > now - MINUTE) return;
    this.hitThrottle.set(key, now);
    if (this.hitThrottle.size > 10_000) this.hitThrottle.clear();
    await this.db.q
      .insertInto('ban_log')
      .values({
        ban_id: t.ban.id,
        trigger_id: t.id,
        user_id: subject.userId ?? null,
        ip: subject.ip ?? null,
        email: subject.email ?? null,
        context,
        created_at: now,
      })
      .execute();
    await this.db.q
      .updateTable('ban_triggers')
      .set((eb) => ({ hits: eb('hits', '+', 1), last_hit_at: now }))
      .where('id', '=', t.id)
      .execute();
  }

  normalizeTrigger(input: TriggerInput): { type: BanTriggerType; value: string; ip_low: string | null; ip_high: string | null; user_id: number | null } {
    const raw = input.value.trim();
    switch (input.type) {
      case 'ip':
      case 'ip_range': {
        const range = parseIpPattern(raw);
        if (!range) throw Errors.badRequest(`Geçersiz IP veya aralık: ${raw}`);
        const type = range.low === range.high ? 'ip' : 'ip_range';
        return { type, value: raw, ip_low: range.low, ip_high: range.high, user_id: null };
      }
      case 'email': {
        const value = raw.includes('*') ? raw.toLowerCase() : canonicalEmail(raw);
        if (!value.includes('@')) throw Errors.badRequest(`Geçersiz e-posta deseni: ${raw}`);
        return { type: 'email', value, ip_low: null, ip_high: null, user_id: null };
      }
      case 'email_domain': {
        const value = raw.replace(/^@/, '').toLowerCase();
        if (!/^(\*\.)?[a-z0-9.-]+\.[a-z0-9-]+$/i.test(value) && !/^(\*\.)?xn--/.test(value)) {
          throw Errors.badRequest(`Geçersiz alan adı: ${raw}`);
        }
        return { type: 'email_domain', value, ip_low: null, ip_high: null, user_id: null };
      }
      case 'username':
        return { type: 'username', value: canonicalName(raw), ip_low: null, ip_high: null, user_id: null };
      case 'user': {
        const id = Number(raw);
        if (!Number.isInteger(id) || id <= 0) throw Errors.badRequest('Geçersiz üye.');
        return { type: 'user', value: String(id), ip_low: null, ip_high: null, user_id: id };
      }
    }
  }

  async create(input: BanInput, actorId: number | null, source: 'manual' | 'warning' = 'manual', sourceRef: number | null = null): Promise<number> {
    if (!input.triggers.length) throw Errors.field('triggers', 'En az bir tetikleyici ekleyin.');
    if (!input.cannotAccess && !input.cannotLogin && !input.cannotRegister && !input.cannotPost) {
      throw Errors.field('restrictions', 'En az bir kısıtlama seçin.');
    }
    const triggers = input.triggers.map((t) => this.normalizeTrigger(t));
    const now = this.clock.now();
    return this.db.tx(async () => {
      const ban = await this.db.q
        .insertInto('bans')
        .values({
          name: input.name,
          reason_public: input.reasonPublic,
          notes_private: input.notesPrivate,
          cannot_access: input.cannotAccess,
          cannot_login: input.cannotLogin,
          cannot_register: input.cannotRegister,
          cannot_post: input.cannotPost,
          expires_at: input.expiresAt,
          source,
          source_ref: sourceRef,
          created_by: actorId,
          created_at: now,
          updated_at: now,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await this.db.q
        .insertInto('ban_triggers')
        .values(triggers.map((t) => ({ ...t, ban_id: ban.id, created_at: now })))
        .execute();
      await this.invalidate();
      for (const t of triggers) if (t.user_id) this.events.emit('user.banned', { userId: t.user_id, banId: ban.id });
      return ban.id;
    });
  }

  async update(id: number, input: BanInput): Promise<void> {
    const existing = await this.db.q.selectFrom('bans').select('id').where('id', '=', id).executeTakeFirst();
    if (!existing) throw Errors.notFound('Yasak bulunamadı.');
    if (!input.triggers.length) throw Errors.field('triggers', 'En az bir tetikleyici ekleyin.');
    const triggers = input.triggers.map((t) => this.normalizeTrigger(t));
    const now = this.clock.now();
    await this.db.tx(async () => {
      await this.db.q
        .updateTable('bans')
        .set({
          name: input.name,
          reason_public: input.reasonPublic,
          notes_private: input.notesPrivate,
          cannot_access: input.cannotAccess,
          cannot_login: input.cannotLogin,
          cannot_register: input.cannotRegister,
          cannot_post: input.cannotPost,
          expires_at: input.expiresAt,
          updated_at: now,
        })
        .where('id', '=', id)
        .execute();
      await this.db.q.deleteFrom('ban_triggers').where('ban_id', '=', id).execute();
      await this.db.q
        .insertInto('ban_triggers')
        .values(triggers.map((t) => ({ ...t, ban_id: id, created_at: now })))
        .execute();
      await this.invalidate();
    });
  }

  async lift(id: number, actorId: number | null): Promise<void> {
    await this.db.tx(async () => {
      const r = await this.db.q
        .updateTable('bans')
        .set({ lifted_at: this.clock.now(), lifted_by: actorId, updated_at: this.clock.now() })
        .where('id', '=', id)
        .where('lifted_at', 'is', null)
        .executeTakeFirst();
      if (Number(r.numUpdatedRows) === 0) throw Errors.notFound('Aktif yasak bulunamadı.');
      await this.invalidate();
    });
  }

  async delete(id: number): Promise<void> {
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('ban_log').where('ban_id', '=', id).execute();
      await this.db.q.deleteFrom('ban_triggers').where('ban_id', '=', id).execute();
      await this.db.q.deleteFrom('bans').where('id', '=', id).execute();
      await this.invalidate();
    });
  }

  async list(filter: 'active' | 'expired' | 'all') {
    const now = this.clock.now();
    let q = this.db.q.selectFrom('bans').selectAll().orderBy('created_at', 'desc');
    if (filter === 'active') {
      q = q.where('lifted_at', 'is', null).where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]));
    } else if (filter === 'expired') {
      q = q.where((eb) => eb.or([eb('lifted_at', 'is not', null), eb('expires_at', '<=', now)]));
    }
    const bans = await q.limit(500).execute();
    const triggers = bans.length
      ? await this.db.q.selectFrom('ban_triggers').selectAll().where('ban_id', 'in', bans.map((b) => b.id)).execute()
      : [];
    return bans.map((b) => this.toAdmin(b, triggers.filter((t) => t.ban_id === b.id), now));
  }

  async get(id: number) {
    const b = await this.db.q.selectFrom('bans').selectAll().where('id', '=', id).executeTakeFirst();
    if (!b) throw Errors.notFound('Yasak bulunamadı.');
    const triggers = await this.db.q.selectFrom('ban_triggers').selectAll().where('ban_id', '=', id).execute();
    return this.toAdmin(b, triggers, this.clock.now());
  }

  private toAdmin(b: Row<'bans'>, triggers: Row<'ban_triggers'>[], now: number) {
    return {
      id: b.id,
      name: b.name,
      reasonPublic: b.reason_public,
      notesPrivate: b.notes_private,
      cannotAccess: bool(b.cannot_access),
      cannotLogin: bool(b.cannot_login),
      cannotRegister: bool(b.cannot_register),
      cannotPost: bool(b.cannot_post),
      expiresAt: b.expires_at,
      liftedAt: b.lifted_at,
      source: b.source,
      createdAt: b.created_at,
      isActive: !b.lifted_at && (!b.expires_at || b.expires_at > now),
      triggers: triggers.map((t) => ({
        id: t.id,
        type: t.type,
        value: t.value,
        userId: t.user_id,
        hits: t.hits,
        lastHitAt: t.last_hit_at,
      })),
    };
  }

  async log(page: number, perPage: number) {
    const rows = await this.db.q
      .selectFrom('ban_log')
      .innerJoin('bans', 'bans.id', 'ban_log.ban_id')
      .select([
        'ban_log.id',
        'ban_log.ban_id',
        'bans.name as ban_name',
        'ban_log.user_id',
        'ban_log.ip',
        'ban_log.email',
        'ban_log.context',
        'ban_log.created_at',
      ])
      .orderBy('ban_log.id', 'desc')
      .limit(perPage)
      .offset((page - 1) * perPage)
      .execute();
    const total = await this.db.q.selectFrom('ban_log').select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst();
    return { items: rows, total: Number(total?.n ?? 0), page, perPage };
  }

  async stats() {
    const now = this.clock.now();
    const DAY_MS = 86_400_000;
    const bans = await this.db.q.selectFrom('bans').select(['id', 'expires_at', 'lifted_at']).execute();
    const active = bans.filter((b) => !b.lifted_at && (!b.expires_at || b.expires_at > now));
    const count = async (since: number) =>
      Number((await this.db.q.selectFrom('ban_log').select((eb) => eb.fn.countAll<number>().as('n')).where('created_at', '>=', since).executeTakeFirst())?.n ?? 0);
    const byContext = await this.db.q
      .selectFrom('ban_log')
      .select(['context', (eb) => eb.fn.countAll<number>().as('n')])
      .where('created_at', '>=', now - 7 * DAY_MS)
      .groupBy('context')
      .execute();
    const top = await this.db.q
      .selectFrom('ban_triggers')
      .innerJoin('bans', 'bans.id', 'ban_triggers.ban_id')
      .select(['ban_triggers.id', 'ban_triggers.type', 'ban_triggers.value', 'ban_triggers.hits', 'ban_triggers.last_hit_at', 'bans.id as banId', 'bans.name'])
      .where('ban_triggers.hits', '>', 0)
      .orderBy('ban_triggers.hits', 'desc')
      .limit(5)
      .execute();
    return {
      active: active.length,
      permanent: active.filter((b) => !b.expires_at).length,
      expiringSoon: active.filter((b) => b.expires_at && b.expires_at - now < 7 * DAY_MS).length,
      blocked24h: await count(now - DAY_MS),
      blocked7d: await count(now - 7 * DAY_MS),
      byContext: Object.fromEntries(byContext.map((r) => [r.context, Number(r.n)])),
      topTriggers: top.map((t) => ({ id: t.id, type: t.type, value: t.value, hits: t.hits, lastHitAt: t.last_hit_at, banId: t.banId, banName: t.name })),
    };
  }

  async forUser(userId: number) {
    const triggerRows = await this.db.q.selectFrom('ban_triggers').select('ban_id').where('user_id', '=', userId).execute();
    if (!triggerRows.length) return [];
    const ids = [...new Set(triggerRows.map((t) => t.ban_id))];
    const now = this.clock.now();
    const bans = await this.db.q.selectFrom('bans').selectAll().where('id', 'in', ids).orderBy('created_at', 'desc').execute();
    const triggers = await this.db.q.selectFrom('ban_triggers').selectAll().where('ban_id', 'in', ids).execute();
    return bans.map((b) => this.toAdmin(b, triggers.filter((t) => t.ban_id === b.id), now));
  }

  async invalidate(): Promise<void> {
    await this.cache.invalidate(BANS_NS);
  }
}
