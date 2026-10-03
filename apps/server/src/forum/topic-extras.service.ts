import { Injectable } from '@nestjs/common';
import { tagSlug, type PollInput, type PollView, type PollVoter, type TaggingOptions, type TagSummary, type TopicTag } from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestViewer } from '../common/request-context.js';
import type { BoardAccess } from './forum-access.service.js';
import { UsersService } from '../users/users.service.js';

type TagRow = Row<'tags'>;
const toTag = (r: Pick<TagRow, 'id' | 'name' | 'slug' | 'color'>): TopicTag => ({ id: r.id, name: r.name, slug: r.slug, color: r.color });

@Injectable()
export class TopicExtrasService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  tagging(): TaggingOptions {
    return { enabled: this.settings.get('forum.tagsEnabled'), max: this.settings.get('forum.tagsMax'), allowNew: this.settings.get('forum.tagsAllowNew') };
  }

  async popularTags(limit = 12): Promise<TopicTag[]> {
    const rows = await this.db.q.selectFrom('tags').select(['id', 'name', 'slug', 'color']).where('topic_count', '>', 0).orderBy('is_official', 'desc').orderBy('topic_count', 'desc').limit(limit).execute();
    return rows.map(toTag);
  }

  async suggest(q: string, limit = 10): Promise<TagSummary[]> {
    const slug = tagSlug(q);
    let query = this.db.q.selectFrom('tags').selectAll();
    if (slug) query = query.where('slug', 'like', `${slug.replace(/[%_]/g, '')}%`);
    const rows = await query.orderBy('is_official', 'desc').orderBy('topic_count', 'desc').orderBy('name').limit(limit).execute();
    return rows.map((r) => ({ ...toTag(r), topicCount: r.topic_count, isOfficial: r.is_official === 1 }));
  }

  async bySlug(slug: string): Promise<TagRow | undefined> {
    return this.db.q.selectFrom('tags').selectAll().where('slug', '=', slug).executeTakeFirst();
  }

  async resolveTags(viewer: RequestViewer, access: BoardAccess, names: string[]): Promise<number[]> {
    if (!names.length) return [];
    const opts = this.tagging();
    if (!opts.enabled) return [];
    const bySlug = new Map<string, string>();
    for (const n of names) {
      const s = tagSlug(n);
      if (s.length >= 2 && !bySlug.has(s)) bySlug.set(s, n);
    }
    if (bySlug.size > opts.max) throw Errors.field('tags', `En fazla ${opts.max} etiket ekleyebilirsiniz.`);
    const existing = await this.db.q.selectFrom('tags').select(['id', 'slug']).where('slug', 'in', [...bySlug.keys()]).execute();
    const ids = existing.map((r) => r.id);
    const missing = [...bySlug.entries()].filter(([s]) => !existing.some((r) => r.slug === s));
    if (missing.length) {
      if (!opts.allowNew && !access.can.moderate) throw Errors.field('tags', `"${missing[0]![1]}" etiketi yok; yalnızca var olan etiketler seçilebilir.`);
      const now = this.clock.now();
      for (const [slug, name] of missing) {
        const row = await this.db.q
          .insertInto('tags')
          .values({ name, slug, created_by: viewer.user?.id ?? null, created_at: now })
          .onConflict((oc) => oc.column('slug').doNothing())
          .returning('id')
          .executeTakeFirst();
        const id = row?.id ?? (await this.db.q.selectFrom('tags').select('id').where('slug', '=', slug).executeTakeFirstOrThrow()).id;
        ids.push(id);
      }
    }
    return ids;
  }

  async setTopicTags(topicId: number, tagIds: number[]): Promise<void> {
    const current = (await this.db.q.selectFrom('topic_tags').select('tag_id').where('topic_id', '=', topicId).execute()).map((r) => r.tag_id);
    const add = tagIds.filter((id) => !current.includes(id));
    const remove = current.filter((id) => !tagIds.includes(id));
    if (!add.length && !remove.length) return;
    if (add.length) {
      await this.db.q.insertInto('topic_tags').values(add.map((tag_id) => ({ topic_id: topicId, tag_id }))).execute();
      await this.db.q.updateTable('tags').set((eb) => ({ topic_count: eb('topic_count', '+', 1) })).where('id', 'in', add).execute();
    }
    if (remove.length) {
      await this.db.q.deleteFrom('topic_tags').where('topic_id', '=', topicId).where('tag_id', 'in', remove).execute();
      await this.db.q.updateTable('tags').set((eb) => ({ topic_count: eb('topic_count', '-', 1) })).where('id', 'in', remove).execute();
    }
  }

  async tagsFor(topicIds: number[]): Promise<Map<number, TopicTag[]>> {
    const out = new Map<number, TopicTag[]>();
    if (!topicIds.length || !this.settings.get('forum.tagsEnabled')) return out;
    const rows = await this.db.q
      .selectFrom('topic_tags as tt')
      .innerJoin('tags as t', 't.id', 'tt.tag_id')
      .select(['tt.topic_id', 't.id', 't.name', 't.slug', 't.color'])
      .where('tt.topic_id', 'in', topicIds)
      .orderBy('t.name')
      .execute();
    for (const r of rows) {
      const list = out.get(r.topic_id) ?? [];
      list.push(toTag(r));
      out.set(r.topic_id, list);
    }
    return out;
  }

  async adminTags(q: string, page: number): Promise<{ items: TagSummary[]; total: number; page: number; perPage: number }> {
    const perPage = 50;
    let base = this.db.q.selectFrom('tags');
    const slug = tagSlug(q);
    if (slug) base = base.where('slug', 'like', `%${slug.replace(/[%_]/g, '')}%`);
    const total = Number((await base.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst())?.n ?? 0);
    const rows = await base
      .selectAll()
      .orderBy('is_official', 'desc')
      .orderBy('topic_count', 'desc')
      .orderBy('name')
      .limit(perPage)
      .offset((page - 1) * perPage)
      .execute();
    return { items: rows.map((r) => ({ ...toTag(r), topicCount: r.topic_count, isOfficial: r.is_official === 1 })), total, page, perPage };
  }

  async saveTag(viewer: RequestViewer, id: number | null, input: { name: string; color: string | null; isOfficial: boolean }): Promise<TagSummary> {
    const slug = tagSlug(input.name);
    if (slug.length < 2) throw Errors.field('name', 'Geçersiz etiket adı.');
    const clash = await this.bySlug(slug);
    const now = this.clock.now();
    let rowId = id;
    if (id) {
      if (clash && clash.id !== id) {
        await this.mergeTags(id, clash.id);
        rowId = clash.id;
        await this.db.q.updateTable('tags').set({ name: input.name, color: input.color, is_official: input.isOfficial ? 1 : 0 }).where('id', '=', clash.id).execute();
      } else {
        await this.db.q.updateTable('tags').set({ name: input.name, slug, color: input.color, is_official: input.isOfficial ? 1 : 0 }).where('id', '=', id).execute();
      }
    } else {
      if (clash) throw Errors.field('name', 'Bu etiket zaten var.');
      rowId = (await this.db.q.insertInto('tags').values({ name: input.name, slug, color: input.color, is_official: input.isOfficial ? 1 : 0, created_by: viewer.user!.id, created_at: now }).returning('id').executeTakeFirstOrThrow()).id;
    }
    await this.audit.log({ type: 'admin', action: id ? 'tag.update' : 'tag.create', actorId: viewer.user!.id, ip: viewer.ip, data: { id: rowId, name: input.name } });
    const r = await this.db.q.selectFrom('tags').selectAll().where('id', '=', rowId!).executeTakeFirstOrThrow();
    return { ...toTag(r), topicCount: r.topic_count, isOfficial: r.is_official === 1 };
  }

  private async mergeTags(from: number, into: number): Promise<void> {
    await this.db.tx(async () => {
      const topics = (await this.db.q.selectFrom('topic_tags').select('topic_id').where('tag_id', '=', from).execute()).map((r) => r.topic_id);
      const already = new Set((await this.db.q.selectFrom('topic_tags').select('topic_id').where('tag_id', '=', into).execute()).map((r) => r.topic_id));
      const move = topics.filter((t) => !already.has(t));
      if (move.length) await this.db.q.insertInto('topic_tags').values(move.map((topic_id) => ({ topic_id, tag_id: into }))).execute();
      await this.db.q.deleteFrom('topic_tags').where('tag_id', '=', from).execute();
      await this.db.q.deleteFrom('tags').where('id', '=', from).execute();
      await this.db.q.updateTable('tags').set((eb) => ({ topic_count: eb('topic_count', '+', move.length) })).where('id', '=', into).execute();
    });
  }

  async deleteTag(viewer: RequestViewer, id: number): Promise<void> {
    const r = await this.db.q.selectFrom('tags').select(['id', 'name']).where('id', '=', id).executeTakeFirst();
    if (!r) throw Errors.notFound('Etiket bulunamadı.');
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('topic_tags').where('tag_id', '=', id).execute();
      await this.db.q.deleteFrom('tags').where('id', '=', id).execute();
    });
    await this.audit.log({ type: 'admin', action: 'tag.delete', actorId: viewer.user!.id, ip: viewer.ip, data: { id, name: r.name } });
  }

  async createPoll(topicId: number, input: PollInput): Promise<void> {
    const max = this.settings.get('forum.pollMaxOptions');
    if (input.options.length > max) throw Errors.field('poll.options', `En fazla ${max} seçenek ekleyebilirsiniz.`);
    if (input.closesAt !== null && input.closesAt <= this.clock.now()) throw Errors.field('poll.closesAt', 'Bitiş tarihi gelecekte olmalı.');
    const now = this.clock.now();
    const poll = await this.db.q
      .insertInto('polls')
      .values({
        topic_id: topicId,
        question: input.question,
        max_choices: Math.min(input.maxChoices, input.options.length),
        allow_change: input.allowChange ? 1 : 0,
        public_votes: input.publicVotes ? 1 : 0,
        show_results: input.showResults,
        closes_at: input.closesAt,
        created_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await this.db.q.insertInto('poll_options').values(input.options.map((label, i) => ({ poll_id: poll.id, label, sort_order: i }))).execute();
  }

  async topicsWithPoll(topicIds: number[]): Promise<Set<number>> {
    if (!topicIds.length) return new Set();
    const rows = await this.db.q.selectFrom('polls').select('topic_id').where('topic_id', 'in', topicIds).execute();
    return new Set(rows.map((r) => r.topic_id));
  }

  private isClosed(p: Row<'polls'>): boolean {
    return !!p.closed_at || (p.closes_at !== null && p.closes_at <= this.clock.now());
  }

  private canManage(viewer: RequestViewer, access: BoardAccess, topic: Pick<Row<'topics'>, 'user_id'>): boolean {
    if (!viewer.user) return false;
    return access.can.editTopic || topic.user_id === viewer.user.id;
  }

  async pollView(viewer: RequestViewer, access: BoardAccess, topic: Pick<Row<'topics'>, 'id' | 'user_id' | 'is_locked'>): Promise<PollView | null> {
    const p = await this.db.q.selectFrom('polls').selectAll().where('topic_id', '=', topic.id).executeTakeFirst();
    if (!p) return null;
    const options = await this.db.q.selectFrom('poll_options').selectAll().where('poll_id', '=', p.id).orderBy('sort_order').orderBy('id').execute();
    const mine = viewer.user
      ? (await this.db.q.selectFrom('poll_votes').select('option_id').where('poll_id', '=', p.id).where('user_id', '=', viewer.user.id).execute()).map((r) => r.option_id)
      : [];
    const closed = this.isClosed(p);
    const manage = this.canManage(viewer, access, topic);
    const seeResults = access.can.editTopic || p.show_results === 'always' || (p.show_results === 'after_vote' && (mine.length > 0 || closed)) || (p.show_results === 'after_close' && closed);
    const canVote = !!viewer.user && access.can.vote && !closed && !topic.is_locked && (mine.length === 0 || p.allow_change === 1);
    return {
      id: p.id,
      question: p.question,
      maxChoices: p.max_choices,
      allowChange: p.allow_change === 1,
      publicVotes: p.public_votes === 1,
      showResults: p.show_results,
      closesAt: p.closes_at,
      closed,
      voterCount: p.voter_count,
      options: options.map((o) => ({ id: o.id, label: o.label, votes: seeResults ? o.vote_count : null })),
      myVotes: mine,
      can: { vote: canVote, seeResults, manage },
    };
  }

  private async requirePoll(topicId: number): Promise<Row<'polls'>> {
    const p = await this.db.q.selectFrom('polls').selectAll().where('topic_id', '=', topicId).executeTakeFirst();
    if (!p) throw Errors.notFound('Bu konuda anket yok.');
    return p;
  }

  async vote(viewer: RequestViewer, access: BoardAccess, topic: Row<'topics'>, optionIds: number[]): Promise<void> {
    const p = await this.requirePoll(topic.id);
    if (!access.can.vote) throw Errors.forbidden('Bu bölümde oy kullanma yetkiniz yok.');
    if (this.isClosed(p)) throw Errors.badRequest('Anket kapandı.');
    if (topic.is_locked) throw Errors.badRequest('Konu kilitli; oy kullanılamaz.');
    const unique = [...new Set(optionIds)];
    if (unique.length > p.max_choices) throw Errors.field('optionIds', p.max_choices === 1 ? 'Yalnızca bir seçenek seçebilirsiniz.' : `En fazla ${p.max_choices} seçenek seçebilirsiniz.`);
    const valid = await this.db.q.selectFrom('poll_options').select('id').where('poll_id', '=', p.id).where('id', 'in', unique).execute();
    if (valid.length !== unique.length) throw Errors.field('optionIds', 'Geçersiz seçenek.');
    const userId = viewer.user!.id;
    const now = this.clock.now();
    await this.db.tx(async () => {
      const prev = (await this.db.q.selectFrom('poll_votes').select('option_id').where('poll_id', '=', p.id).where('user_id', '=', userId).execute()).map((r) => r.option_id);
      if (prev.length && !p.allow_change) throw Errors.badRequest('Bu ankette oyunuzu değiştiremezsiniz.');
      if (prev.length) {
        await this.db.q.deleteFrom('poll_votes').where('poll_id', '=', p.id).where('user_id', '=', userId).execute();
        await this.db.q.updateTable('poll_options').set((eb) => ({ vote_count: eb('vote_count', '-', 1) })).where('id', 'in', prev).execute();
      }
      await this.db.q.insertInto('poll_votes').values(unique.map((option_id) => ({ poll_id: p.id, option_id, user_id: userId, created_at: now }))).execute();
      await this.db.q.updateTable('poll_options').set((eb) => ({ vote_count: eb('vote_count', '+', 1) })).where('id', 'in', unique).execute();
      if (!prev.length) await this.db.q.updateTable('polls').set((eb) => ({ voter_count: eb('voter_count', '+', 1) })).where('id', '=', p.id).execute();
    });
  }

  async unvote(viewer: RequestViewer, topic: Row<'topics'>): Promise<void> {
    const p = await this.requirePoll(topic.id);
    if (!p.allow_change) throw Errors.badRequest('Bu ankette oyunuzu geri alamazsınız.');
    if (this.isClosed(p)) throw Errors.badRequest('Anket kapandı.');
    const userId = viewer.user!.id;
    await this.db.tx(async () => {
      const prev = (await this.db.q.selectFrom('poll_votes').select('option_id').where('poll_id', '=', p.id).where('user_id', '=', userId).execute()).map((r) => r.option_id);
      if (!prev.length) return;
      await this.db.q.deleteFrom('poll_votes').where('poll_id', '=', p.id).where('user_id', '=', userId).execute();
      await this.db.q.updateTable('poll_options').set((eb) => ({ vote_count: eb('vote_count', '-', 1) })).where('id', 'in', prev).execute();
      await this.db.q.updateTable('polls').set((eb) => ({ voter_count: eb('voter_count', '-', 1) })).where('id', '=', p.id).execute();
    });
  }

  async setClosed(viewer: RequestViewer, access: BoardAccess, topic: Row<'topics'>, closed: boolean): Promise<void> {
    const p = await this.requirePoll(topic.id);
    if (!this.canManage(viewer, access, topic)) throw Errors.forbidden('Bu anketi yönetemezsiniz.');
    await this.db.q
      .updateTable('polls')
      .set(closed ? { closed_at: this.clock.now() } : { closed_at: null, closes_at: p.closes_at && p.closes_at <= this.clock.now() ? null : p.closes_at })
      .where('id', '=', p.id)
      .execute();
  }

  async deletePoll(viewer: RequestViewer, access: BoardAccess, topic: Row<'topics'>): Promise<void> {
    const p = await this.requirePoll(topic.id);
    if (!this.canManage(viewer, access, topic)) throw Errors.forbidden('Bu anketi silemezsiniz.');
    if (!access.can.editTopic && p.voter_count > 0) throw Errors.badRequest('Oy verilmiş bir anketi yalnızca moderatörler silebilir.');
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('poll_votes').where('poll_id', '=', p.id).execute();
      await this.db.q.deleteFrom('poll_options').where('poll_id', '=', p.id).execute();
      await this.db.q.deleteFrom('polls').where('id', '=', p.id).execute();
    });
  }

  async addPoll(viewer: RequestViewer, access: BoardAccess, topic: Row<'topics'>, input: PollInput): Promise<void> {
    if (!this.canManage(viewer, access, topic) || !access.can.poll) throw Errors.forbidden('Bu konuya anket ekleyemezsiniz.');
    const existing = await this.db.q.selectFrom('polls').select('id').where('topic_id', '=', topic.id).executeTakeFirst();
    if (existing) throw Errors.badRequest('Bu konuda zaten bir anket var.');
    await this.createPoll(topic.id, input);
  }

  async voters(topicId: number, viewer: RequestViewer, access: BoardAccess, _topic: Row<'topics'>): Promise<PollVoter[]> {
    const p = await this.requirePoll(topicId);
    if (!p.public_votes && !access.can.editTopic) throw Errors.forbidden('Bu ankette oylar gizli.');
    const rows = await this.db.q.selectFrom('poll_votes').select(['option_id', 'user_id', 'created_at']).where('poll_id', '=', p.id).orderBy('created_at', 'desc').limit(500).execute();
    const users = await this.users.summaries(rows.map((r) => r.user_id));
    return rows.flatMap((r) => {
      const user = users.get(r.user_id);
      return user ? [{ optionId: r.option_id, user, at: r.created_at }] : [];
    });
  }

  async isSubscribed(userId: number | undefined, topicId: number): Promise<boolean> {
    if (!userId) return false;
    return !!(await this.db.q.selectFrom('topic_subscriptions').select('topic_id').where('topic_id', '=', topicId).where('user_id', '=', userId).executeTakeFirst());
  }

  async setSubscribed(userId: number, topicId: number, on: boolean): Promise<void> {
    if (on) {
      await this.db.q
        .insertInto('topic_subscriptions')
        .values({ topic_id: topicId, user_id: userId, created_at: this.clock.now() })
        .onConflict((oc) => oc.columns(['topic_id', 'user_id']).doNothing())
        .execute();
    } else {
      await this.db.q.deleteFrom('topic_subscriptions').where('topic_id', '=', topicId).where('user_id', '=', userId).execute();
    }
  }

  async subscriberIds(topicId: number, limit = 500): Promise<number[]> {
    const rows = await this.db.q.selectFrom('topic_subscriptions').select('user_id').where('topic_id', '=', topicId).orderBy('created_at').limit(limit).execute();
    return rows.map((r) => r.user_id);
  }
}
