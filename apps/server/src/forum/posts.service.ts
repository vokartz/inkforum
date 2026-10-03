import { Injectable } from '@nestjs/common';
import {
  bbcodeToDoc,
  bbcodeToText,
  docToBBCode,
  parseTopicTemplate,
  slugify,
  type TopicTemplate,
  type PostRevisionItem,
  type createTopicSchema,
  type editPostSchema,
} from '@forum/shared';
import type { z } from 'zod';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock, DAY, MINUTE } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import { EventsService } from '../events/events.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { BansService } from '../bans/bans.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestViewer } from '../common/request-context.js';
import { ForumAccessService, type BoardAccess } from './forum-access.service.js';
import { ForumCacheService, type CachedBoard } from './forum-cache.service.js';
import { ForumCountersService } from './forum-counters.service.js';
import { PostRenderService, RENDER_VERSION } from './post-render.service.js';
import { TopicExtrasService } from './topic-extras.service.js';

export function topicSlug(title: string): string {
  const s = slugify(title).slice(0, 80).replace(/-+$/, '');
  return s && s !== 'uye' ? s : 'konu';
}

interface InsertPostInput {
  topicId: number;
  boardId: number;
  userId: number | null;
  authorName: string;
  body: string;
  html: string;
  ip: string | null;
  approved: boolean;
  at: number;
}

@Injectable()
export class PostsService {
  private readonly lastPostAt = new Map<number, number>();

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
    private readonly bans: BansService,
    private readonly audit: AuditService,
    private readonly access: ForumAccessService,
    private readonly forum: ForumCacheService,
    private readonly counters: ForumCountersService,
    private readonly render: PostRenderService,
    private readonly extras: TopicExtrasService,
  ) {}

  async postingBlockReason(viewer: RequestViewer): Promise<string | null> {
    if (!viewer.user) return 'Mesaj yazmak için giriş yapmalısınız.';
    const now = this.clock.now();
    if (viewer.user.muted_until && viewer.user.muted_until > now) {
      return 'Hesabınız susturulduğu için şu anda mesaj yazamazsınız.';
    }
    const ban = await this.bans.activeFor({ userId: viewer.user.id, ip: viewer.ip });
    if (ban?.cannotPost) return 'Hesabınız kısıtlandığı için mesaj yazamazsınız.';
    return null;
  }

  private async assertCanPost(viewer: RequestViewer, access: BoardAccess): Promise<Row<'users'>> {
    const reason = await this.postingBlockReason(viewer);
    if (reason) throw viewer.user ? Errors.forbidden(reason) : Errors.unauthenticated(reason);
    const flood = this.settings.get('forum.floodSeconds');
    if (flood > 0 && !access.can.moderate) {
      const last = this.lastPostAt.get(viewer.user!.id);
      const wait = last ? Math.ceil((last + flood * 1000 - this.clock.now()) / 1000) : 0;
      if (wait > 0) throw Errors.badRequest(`Çok hızlı mesaj gönderiyorsunuz. ${wait} saniye sonra tekrar deneyin.`);
    }
    return viewer.user!;
  }

  private needsApproval(viewer: RequestViewer, access: BoardAccess, kind: 'topic' | 'post'): boolean {
    if (access.perms.has('post.noApproval')) return false;
    const moderated = !!viewer.user?.moderated_until && viewer.user.moderated_until > this.clock.now();
    const board = access.board;
    return moderated || (kind === 'topic' ? board.require_approval_topics === 1 : board.require_approval_posts === 1);
  }

  private prepareBody(body: string): { body: string; html: string; mentions: number[]; quotedPosts: number[] } {
    const text = body.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
    const max = this.settings.get('forum.postMaxLength');
    if (text.length > max) throw Errors.field('body', `Mesaj en fazla ${max} karakter olabilir (şu an ${text.length}).`);
    const rendered = this.render.post(text);
    if (!bbcodeToText(text).trim() && rendered.imageCount === 0 && !/\[(?:media|youtube|hr)\]/i.test(text)) {
      throw Errors.field('body', 'Mesaj boş olamaz.');
    }
    return { body: text, html: rendered.html, mentions: rendered.mentions, quotedPosts: rendered.quotedPosts };
  }

  private applyTemplate(tpl: TopicTemplate, answers: Record<string, string | string[]>, title: string, body: string, displayName: string): { title: string; body: string } {
    const values = new Map<string, string>();
    const blocks: string[] = [];
    for (const f of tpl.fields) {
      const raw = answers[f.id];
      const key = `answers.${f.id}`;
      if (f.type === 'checkbox') {
        const list = [...new Set(Array.isArray(raw) ? raw : raw ? [raw] : [])].filter((o) => f.options.includes(o));
        if (f.required && !list.length) throw Errors.field(key, 'Bu soru zorunlu.');
        values.set(f.id, list.join(', '));
        if (list.length) blocks.push(`[b]${f.label}[/b]\n[list]\n${list.map((o) => `[*]${o}`).join('\n')}\n[/list]`);
        continue;
      }
      const v = (Array.isArray(raw) ? raw.join(', ') : (raw ?? '')).replace(/\r\n?/g, '\n').trim();
      if (f.required && !v) throw Errors.field(key, 'Bu soru zorunlu.');
      if (v) {
        if ((f.type === 'select' || f.type === 'radio') && !f.options.includes(v)) throw Errors.field(key, 'Geçersiz seçim.');
        if (f.type === 'number' && !/^-?\d+(?:[.,]\d+)?$/.test(v)) throw Errors.field(key, 'Bir sayı girin.');
        if (f.type === 'url' && !/^https?:\/\/\S+$/i.test(v)) throw Errors.field(key, 'Geçerli bir adres girin (https://…).');
        if (f.type !== 'textarea' && v.length > 500) throw Errors.field(key, 'Yanıt çok uzun.');
        blocks.push(`[b]${f.label}[/b]\n${f.type === 'url' ? `[url]${v}[/url]` : v}`);
      }
      values.set(f.id, f.type === 'textarea' ? v.replace(/\s+/g, ' ') : v);
    }
    let finalTitle = title.trim();
    if (tpl.titleTemplate) {
      finalTitle = tpl.titleTemplate
        .replace(/\{(\w+)\}/g, (m, id: string) => (id === 'user' ? displayName : values.has(id) ? values.get(id)! : m))
        .replace(/\s+/g, ' ')
        .trim();
    }
    const extra = tpl.allowMessage ? body.trim() : '';
    const out = [blocks.join('\n\n'), extra].filter(Boolean).join('\n\n[hr]\n\n');
    return { title: finalTitle, body: out };
  }

  private checkTitle(title: string): string {
    if (title.trim().length < 3) throw Errors.field('title', 'Başlık en az 3 karakter olmalı.');
    const max = this.settings.get('forum.titleMaxLength');
    if (title.length > max) throw Errors.field('title', `Başlık en fazla ${max} karakter olabilir.`);
    return title;
  }

  async checkPrefix(boardId: number, prefixId: number | null | undefined): Promise<number | null> {
    if (!prefixId) return null;
    const allowed = await this.forum.prefixesFor(boardId);
    if (!allowed.some((p) => p.id === prefixId)) throw Errors.field('prefixId', 'Bu önek bu bölümde kullanılamaz.');
    return prefixId;
  }

  private async insertPost(i: InsertPostInput): Promise<number> {
    const row = await this.db.q
      .insertInto('posts')
      .values({
        topic_id: i.topicId,
        board_id: i.boardId,
        user_id: i.userId,
        author_name: i.authorName,
        body_bbcode: i.body,
        body_html: i.html,
        render_version: RENDER_VERSION,
        ip: i.ip,
        is_approved: i.approved,
        created_at: i.at,
        updated_at: i.at,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  private async bumpUserPostCount(userId: number | null, board: Pick<CachedBoard, 'count_posts'>, delta: number): Promise<void> {
    if (!userId || !board.count_posts || !delta) return;
    await this.db.q
      .updateTable('users')
      .set((eb) => ({ post_count: eb('post_count', '+', delta) }))
      .where('id', '=', userId)
      .execute();
    if (delta < 0) {
      await this.db.q.updateTable('users').set({ post_count: 0 }).where('id', '=', userId).where('post_count', '<', 0).execute();
    }
    this.db.afterCommit(async () => {
      await this.users.recalcPostGroup(userId);
      this.events.emit('user.postCountChanged', { userId });
    });
  }

  async markTopicRead(userId: number, topicId: number, postId: number, at: number): Promise<void> {
    await this.db.q
      .insertInto('topic_reads')
      .values({ user_id: userId, topic_id: topicId, last_read_post_id: postId, read_at: at })
      .onConflict((oc) =>
        oc
          .columns(['user_id', 'topic_id'])
          .doUpdateSet({ last_read_post_id: postId, read_at: at })
          .where('topic_reads.last_read_post_id', '<', postId),
      )
      .execute();
  }

  async insertTopic(input: {
    board: CachedBoard;
    userId: number | null;
    authorName: string;
    title: string;
    body: string;
    html: string;
    prefixId: number | null;
    ip: string | null;
    approved: boolean;
    pinned?: boolean;
    locked?: boolean;
  }): Promise<{ topicId: number; postId: number }> {
    const now = this.clock.now();
    return this.db.tx(async () => {
      const topic = await this.db.q
        .insertInto('topics')
        .values({
          board_id: input.board.id,
          title: input.title,
          slug: topicSlug(input.title),
          prefix_id: input.prefixId,
          user_id: input.userId,
          author_name: input.authorName,
          last_post_at: now,
          last_poster_id: input.userId,
          last_poster_name: input.authorName,
          is_pinned: !!input.pinned,
          is_locked: !!input.locked,
          is_approved: input.approved,
          is_hidden: input.board.private_topics === 1,
          created_at: now,
          updated_at: now,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const postId = await this.insertPost({
        topicId: topic.id,
        boardId: input.board.id,
        userId: input.userId,
        authorName: input.authorName,
        body: input.body,
        html: input.html,
        ip: input.ip,
        approved: input.approved,
        at: now,
      });
      await this.db.q.updateTable('topics').set({ first_post_id: postId, last_post_id: postId }).where('id', '=', topic.id).execute();
      if (input.approved) {
        await this.db.q
          .updateTable('boards')
          .set((eb) => ({
            topic_count: eb('topic_count', '+', 1),
            post_count: eb('post_count', '+', 1),
            last_post_id: postId,
            last_post_at: now,
          }))
          .where('id', '=', input.board.id)
          .execute();
        await this.bumpUserPostCount(input.userId, input.board, 1);
      }
      if (input.userId) await this.markTopicRead(input.userId, topic.id, postId, now);
      return { topicId: topic.id, postId };
    });
  }

  async createTopic(viewer: RequestViewer, boardId: number, input: z.output<typeof createTopicSchema>) {
    const access = await this.access.require(viewer, boardId);
    if (access.board.type !== 'forum') throw Errors.badRequest('Bu bölüme konu açılamaz.');
    if (!access.can.createTopic) throw Errors.forbidden('Bu bölümde konu açma yetkiniz yok.');
    const user = await this.assertCanPost(viewer, access);
    const tpl = parseTopicTemplate(access.board.topic_template_json);
    const filled = tpl.enabled ? this.applyTemplate(tpl, input.answers ?? {}, input.title, input.body, user.display_name) : { title: input.title, body: input.body };
    const max = this.settings.get('forum.titleMaxLength');
    const title = this.checkTitle(tpl.enabled && tpl.titleTemplate && filled.title.length > max ? `${filled.title.slice(0, max - 1)}…` : filled.title);
    const prefixId = await this.checkPrefix(boardId, input.prefixId);
    const body = this.prepareBody(filled.body);
    const approved = !this.needsApproval(viewer, access, 'topic');
    if (input.poll) {
      if (!access.can.poll) throw Errors.forbidden('Bu bölümde anket ekleme yetkiniz yok.');
      const max = this.settings.get('forum.pollMaxOptions');
      if (input.poll.options.length > max) throw Errors.field('poll.options', `En fazla ${max} seçenek ekleyebilirsiniz.`);
      if (input.poll.closesAt !== null && input.poll.closesAt <= this.clock.now()) throw Errors.field('poll.closesAt', 'Bitiş tarihi gelecekte olmalı.');
    }
    const tagIds = await this.extras.resolveTags(viewer, access, input.tags);

    const { topicId, postId } = await this.insertTopic({
      board: access.board,
      userId: user.id,
      authorName: user.display_name,
      title,
      body: body.body,
      html: body.html,
      prefixId,
      ip: viewer.ip,
      approved,
      pinned: input.pinned && access.can.pin,
      locked: input.locked && access.can.lock,
    });
    await this.db.tx(async () => {
      await this.extras.setTopicTags(topicId, tagIds);
      if (input.poll) await this.extras.createPoll(topicId, input.poll);
      if (input.subscribe) await this.extras.setSubscribed(user.id, topicId, true);
    });
    this.lastPostAt.set(user.id, this.clock.now());
    if (approved && access.board.private_topics !== 1) {
      this.db.afterCommit(() => this.notifyPost(viewer, postId, topicId, title, access.board, body, []));
      this.events.emit('topic.created', { topicId, postId, userId: user.id, boardId: access.board.id });
    }
    return { topicId, postId, slug: topicSlug(title), approved, hidden: access.board.private_topics === 1 };
  }

  async reply(viewer: RequestViewer, topicId: number, bodyInput: string) {
    const topic = await this.requireTopic(topicId);
    const access = await this.access.require(viewer, topic.board_id);
    await this.assertTopicVisible(viewer, access, topic);
    if (topic.moved_to_topic_id) throw Errors.badRequest('Bu konu taşındı.');
    if (!access.can.reply) throw Errors.forbidden('Bu bölümde yanıt yazma yetkiniz yok.');
    if (topic.is_locked && !access.can.lock) throw Errors.forbidden('Bu konu kilitli; yanıt yazılamaz.');
    const user = await this.assertCanPost(viewer, access);
    const body = this.prepareBody(bodyInput);
    const approved = topic.is_approved === 1 && !this.needsApproval(viewer, access, 'post');
    const now = this.clock.now();

    const postId = await this.db.tx(async () => {
      const id = await this.insertPost({
        topicId,
        boardId: topic.board_id,
        userId: user.id,
        authorName: user.display_name,
        body: body.body,
        html: body.html,
        ip: viewer.ip,
        approved,
        at: now,
      });
      if (approved) {
        await this.db.q
          .updateTable('topics')
          .set((eb) => ({
            reply_count: eb('reply_count', '+', 1),
            last_post_id: id,
            last_post_at: now,
            last_poster_id: user.id,
            last_poster_name: user.display_name,
            updated_at: now,
          }))
          .where('id', '=', topicId)
          .execute();
        await this.db.q
          .updateTable('boards')
          .set((eb) => ({ post_count: eb('post_count', '+', 1), last_post_id: id, last_post_at: now }))
          .where('id', '=', topic.board_id)
          .execute();
        await this.bumpUserPostCount(user.id, access.board, 1);
      }
      await this.markTopicRead(user.id, topicId, id, now);
      return id;
    });
    this.lastPostAt.set(user.id, now);
    if (approved) {
      this.db.afterCommit(async () => {
        const notified = await this.notifyPost(viewer, postId, topicId, topic.title, access.board, body, []);
        await this.notifySubscribers(viewer, postId, topic, access.board, notified);
      });
      this.events.emit('post.created', { topicId, postId, userId: user.id, boardId: topic.board_id });
    }
    return { postId, approved };
  }

  private canEdit(viewer: RequestViewer, access: BoardAccess, topic: Row<'topics'>, post: Row<'posts'>): boolean {
    if (!viewer.user || post.deleted_at) return false;
    if (access.perms.has('mod.post.edit')) return true;
    if (post.user_id !== viewer.user.id || !access.perms.has('post.edit.own')) return false;
    if (topic.is_locked && !access.can.lock) return false;
    const window = this.settings.get('forum.editWindowMinutes');
    return !window || this.clock.now() - post.created_at <= window * MINUTE;
  }

  private canDelete(viewer: RequestViewer, access: BoardAccess, topic: Row<'topics'>, post: Row<'posts'>): boolean {
    if (!viewer.user || post.deleted_at) return false;
    const isFirst = topic.first_post_id === post.id;
    if (isFirst) {
      if (access.perms.has('mod.topic.delete')) return true;
      return post.user_id === viewer.user.id && access.perms.has('post.delete.own') && topic.reply_count === 0 && !topic.is_locked;
    }
    if (access.perms.has('mod.post.delete')) return true;
    return post.user_id === viewer.user.id && access.perms.has('post.delete.own') && !topic.is_locked;
  }

  postPermissions(viewer: RequestViewer, access: BoardAccess, topic: Row<'topics'>, post: Row<'posts'>) {
    const own = !!viewer.user && post.user_id === viewer.user.id;
    return {
      edit: this.canEdit(viewer, access, topic, post),
      delete: this.canDelete(viewer, access, topic, post),
      history: post.edit_count > 0 && (own || access.perms.has('mod.post.history')),
      approve: !post.is_approved && access.can.approve,
      restore: !!post.deleted_at && access.can.viewDeleted && access.perms.has('mod.post.delete'),
      react: !!viewer.user && !own && !post.deleted_at && post.is_approved === 1,
    };
  }

  async requireTopic(topicId: number): Promise<Row<'topics'>> {
    const topic = await this.db.q.selectFrom('topics').selectAll().where('id', '=', topicId).executeTakeFirst();
    if (!topic) throw Errors.notFound('Konu bulunamadı.');
    return topic;
  }

  async assertTopicVisible(viewer: RequestViewer, access: BoardAccess, topic: Row<'topics'>): Promise<void> {
    const own = !!viewer.user && topic.user_id === viewer.user.id;
    if (topic.deleted_at && !access.can.viewDeleted) throw Errors.notFound('Konu bulunamadı.');
    if (!topic.is_approved && !own && !access.can.approve) throw Errors.notFound('Konu bulunamadı.');
    if (topic.is_hidden && !own && !access.can.approve && !(viewer.user && (await this.isTopicMember(topic.id, viewer.user.id)))) {
      throw Errors.notFound('Konu bulunamadı.');
    }
  }

  async isTopicMember(topicId: number, userId: number): Promise<boolean> {
    const row = await this.db.q.selectFrom('topic_members').select('user_id').where('topic_id', '=', topicId).where('user_id', '=', userId).executeTakeFirst();
    return !!row;
  }

  async loadVisiblePost(viewer: RequestViewer, postId: number) {
    const post = await this.db.q.selectFrom('posts').selectAll().where('id', '=', postId).executeTakeFirst();
    if (!post) throw Errors.notFound('Mesaj bulunamadı.');
    const topic = await this.requireTopic(post.topic_id);
    const access = await this.access.require(viewer, topic.board_id);
    await this.assertTopicVisible(viewer, access, topic);
    const own = !!viewer.user && post.user_id === viewer.user.id;
    if (post.deleted_at && !access.can.viewDeleted) throw Errors.notFound('Mesaj bulunamadı.');
    if (!post.is_approved && !own && !access.can.approve) throw Errors.notFound('Mesaj bulunamadı.');
    return { post, topic, access };
  }

  async source(viewer: RequestViewer, postId: number): Promise<{ bbcode: string; title: string | null; prefixId: number | null; isFirst: boolean }> {
    const { post, topic, access } = await this.loadVisiblePost(viewer, postId);
    if (!this.canEdit(viewer, access, topic, post)) throw Errors.forbidden('Bu mesajı düzenleyemezsiniz.');
    const isFirst = topic.first_post_id === post.id;
    return { bbcode: post.body_bbcode, title: isFirst ? topic.title : null, prefixId: isFirst ? topic.prefix_id : null, isFirst };
  }

  async quote(viewer: RequestViewer, postId: number): Promise<{ bbcode: string }> {
    const { post } = await this.loadVisiblePost(viewer, postId);
    if (post.deleted_at) throw Errors.notFound('Mesaj bulunamadı.');
    const doc = bbcodeToDoc(post.body_bbcode);
    doc.content = (doc.content ?? []).filter((n) => n.type !== 'blockquote');
    const inner = docToBBCode(doc).trim();
    const author = post.author_name.replace(/["\]\n]/g, '');
    return { bbcode: `[quote author="${author}" post=${post.id} date=${Math.floor(post.created_at / 1000)}]\n${inner}\n[/quote]\n` };
  }

  async edit(viewer: RequestViewer, postId: number, input: z.output<typeof editPostSchema>) {
    const { post, topic, access } = await this.loadVisiblePost(viewer, postId);
    if (!this.canEdit(viewer, access, topic, post)) throw Errors.forbidden('Bu mesajı düzenleyemezsiniz.');
    const body = this.prepareBody(input.body);
    const now = this.clock.now();
    const isFirst = topic.first_post_id === post.id;
    const own = post.user_id === viewer.user!.id;
    const grace = this.settings.get('forum.editGraceSeconds') * 1000;
    const silent = own && now - post.created_at <= grace && post.edit_count === 0;
    const changed = body.body !== post.body_bbcode;

    const topicPatch: { title?: string; slug?: string; prefix_id?: number | null } = {};
    if (isFirst && (input.title !== undefined || input.prefixId !== undefined)) {
      const canTopic = access.perms.has('mod.topic.edit') || (own && access.perms.has('post.edit.own'));
      if (!canTopic) throw Errors.forbidden('Konu başlığını düzenleyemezsiniz.');
      if (input.title !== undefined && input.title !== topic.title) {
        topicPatch.title = this.checkTitle(input.title);
        topicPatch.slug = topicSlug(input.title);
      }
      if (input.prefixId !== undefined && input.prefixId !== topic.prefix_id) {
        topicPatch.prefix_id = await this.checkPrefix(topic.board_id, input.prefixId);
      }
    }
    const tagIds = isFirst && input.tags !== undefined ? await this.extras.resolveTags(viewer, access, input.tags) : null;

    await this.db.tx(async () => {
      if (changed) {
        if (!silent) {
          await this.db.q
            .insertInto('post_revisions')
            .values({ post_id: post.id, user_id: post.edited_by ?? post.user_id, body_bbcode: post.body_bbcode, reason: post.edit_reason, created_at: post.edited_at ?? post.created_at })
            .execute();
        }
        await this.db.q
          .updateTable('posts')
          .set({
            body_bbcode: body.body,
            body_html: body.html,
            render_version: RENDER_VERSION,
            updated_at: now,
            ...(silent
              ? {}
              : {
                  edited_at: now,
                  edited_by: viewer.user!.id,
                  edit_reason: input.reason || null,
                  edit_count: post.edit_count + 1,
                }),
          })
          .where('id', '=', post.id)
          .execute();
      }
      if (Object.keys(topicPatch).length) {
        await this.db.q.updateTable('topics').set({ ...topicPatch, updated_at: now }).where('id', '=', topic.id).execute();
      }
      if (tagIds) await this.extras.setTopicTags(topic.id, tagIds);
    });
    if (!own) {
      await this.audit.log({ type: 'moderation', action: 'post.edit', actorId: viewer.user!.id, targetType: 'post', targetId: post.id, ip: viewer.ip });
    }
    if (changed && post.is_approved) {
      const previous = this.render.post(post.body_bbcode);
      this.db.afterCommit(() =>
        this.notifyPost(viewer, post.id, topic.id, topicPatch.title ?? topic.title, access.board, body, [...previous.mentions, ...previous.quotedPosts.map((id) => -id)]),
      );
    }
    return { html: body.html, title: topicPatch.title ?? topic.title };
  }

  async revisions(viewer: RequestViewer, postId: number): Promise<PostRevisionItem[]> {
    const { post, access } = await this.loadVisiblePost(viewer, postId);
    const own = !!viewer.user && post.user_id === viewer.user.id;
    if (!own && !access.perms.has('mod.post.history')) throw Errors.forbidden('Düzenleme geçmişini görme yetkiniz yok.');
    const rows = await this.db.q.selectFrom('post_revisions').selectAll().where('post_id', '=', postId).orderBy('id', 'desc').limit(50).execute();
    const users = await this.users.summaries(rows.map((r) => r.user_id ?? 0));
    return rows.map((r) => ({
      id: r.id,
      user: r.user_id ? (users.get(r.user_id) ?? null) : null,
      bbcode: r.body_bbcode,
      html: this.render.post(r.body_bbcode).html,
      reason: r.reason,
      createdAt: r.created_at,
    }));
  }

  async delete(viewer: RequestViewer, postId: number, reason = ''): Promise<{ topicDeleted: boolean }> {
    const { post, topic, access } = await this.loadVisiblePost(viewer, postId);
    if (!this.canDelete(viewer, access, topic, post)) throw Errors.forbidden('Bu mesajı silemezsiniz.');
    const own = post.user_id === viewer.user!.id;
    if (topic.first_post_id === post.id) {
      await this.deleteTopicInternal(topic, viewer.user!.id);
      await this.audit.log({ type: own ? 'user' : 'moderation', action: 'topic.delete', actorId: viewer.user!.id, targetType: 'topic', targetId: topic.id, ip: viewer.ip, data: { title: topic.title, reason } });
      return { topicDeleted: true };
    }
    await this.db.tx(async () => {
      await this.db.q.updateTable('posts').set({ deleted_at: this.clock.now(), deleted_by: viewer.user!.id }).where('id', '=', post.id).execute();
      await this.counters.recountTopic(topic.id);
      await this.counters.recountBoard(topic.board_id);
      if (post.is_approved && !topic.deleted_at) await this.bumpUserPostCount(post.user_id, access.board, -1);
    });
    if (!own) {
      await this.audit.log({ type: 'moderation', action: 'post.delete', actorId: viewer.user!.id, targetType: 'post', targetId: post.id, ip: viewer.ip, data: { topicId: topic.id, reason } });
    }
    return { topicDeleted: false };
  }

  async deleteTopicInternal(topic: Row<'topics'>, actorId: number): Promise<void> {
    const board = await this.forum.board(topic.board_id);
    await this.db.tx(async () => {
      await this.db.q.updateTable('topics').set({ deleted_at: this.clock.now(), deleted_by: actorId }).where('id', '=', topic.id).execute();
      await this.counters.recountBoard(topic.board_id);
      if (board && topic.is_approved) await this.adjustTopicAuthors(topic.id, board, -1);
    });
  }

  async restoreTopicInternal(topic: Row<'topics'>): Promise<void> {
    const board = await this.forum.board(topic.board_id);
    await this.db.tx(async () => {
      await this.db.q.updateTable('topics').set({ deleted_at: null, deleted_by: null }).where('id', '=', topic.id).execute();
      await this.counters.recountBoard(topic.board_id);
      if (board && topic.is_approved) await this.adjustTopicAuthors(topic.id, board, 1);
    });
  }

  async adjustTopicAuthors(topicId: number, board: Pick<CachedBoard, 'count_posts'>, sign: 1 | -1): Promise<void> {
    if (!board.count_posts) return;
    const rows = await this.db.q
      .selectFrom('posts')
      .select(['user_id', (eb) => eb.fn.countAll<number>().as('n')])
      .where('topic_id', '=', topicId)
      .where('deleted_at', 'is', null)
      .where('is_approved', '=', 1)
      .where('user_id', 'is not', null)
      .groupBy('user_id')
      .execute();
    for (const r of rows) await this.bumpUserPostCount(r.user_id, board, sign * Number(r.n));
  }

  async restore(viewer: RequestViewer, postId: number): Promise<void> {
    const { post, topic, access } = await this.loadVisiblePost(viewer, postId);
    if (!this.postPermissions(viewer, access, topic, post).restore) throw Errors.forbidden();
    await this.db.tx(async () => {
      await this.db.q.updateTable('posts').set({ deleted_at: null, deleted_by: null }).where('id', '=', post.id).execute();
      await this.counters.recountTopic(topic.id);
      await this.counters.recountBoard(topic.board_id);
      if (post.is_approved && !topic.deleted_at) await this.bumpUserPostCount(post.user_id, access.board, 1);
    });
    await this.audit.log({ type: 'moderation', action: 'post.restore', actorId: viewer.user!.id, targetType: 'post', targetId: post.id, ip: viewer.ip });
  }

  async approve(viewer: RequestViewer, postId: number): Promise<void> {
    const { post, topic, access } = await this.loadVisiblePost(viewer, postId);
    if (!access.can.approve) throw Errors.forbidden();
    if (post.is_approved) return;
    const isFirst = topic.first_post_id === post.id;
    await this.db.tx(async () => {
      await this.db.q.updateTable('posts').set({ is_approved: 1 }).where('id', '=', post.id).execute();
      if (isFirst) await this.db.q.updateTable('topics').set({ is_approved: 1 }).where('id', '=', topic.id).execute();
      await this.counters.recountTopic(topic.id);
      await this.counters.recountBoard(topic.board_id);
      if (!post.deleted_at && !topic.deleted_at) await this.bumpUserPostCount(post.user_id, access.board, 1);
    });
    await this.audit.log({ type: 'moderation', action: 'post.approve', actorId: viewer.user!.id, targetType: 'post', targetId: post.id, ip: viewer.ip });
    if (post.user_id && post.user_id !== viewer.user!.id) {
      await this.notifications.notify(post.user_id, 'forum.postApproved', { postId: post.id, topicId: topic.id, topicTitle: topic.title }, viewer.user!.id);
    }
    const body = this.render.post(post.body_bbcode);
    this.db.afterCommit(() =>
      this.notifyPost({ ...viewer, user: { ...viewer.user!, id: post.user_id ?? 0, display_name: post.author_name } }, post.id, topic.id, topic.title, access.board, body, []),
    );
  }

  private async notifyPost(
    viewer: RequestViewer,
    postId: number,
    topicId: number,
    topicTitle: string,
    board: CachedBoard,
    body: { mentions: number[]; quotedPosts: number[] },
    skip: number[],
  ): Promise<Set<number>> {
    const actorId = viewer.user?.id ?? 0;
    const actorName = viewer.user?.display_name ?? '';
    const skipUsers = new Set(skip.filter((x) => x > 0));
    const skipPosts = new Set(skip.filter((x) => x < 0).map((x) => -x));
    const notified = new Set<number>([actorId]);
    const data = { postId, topicId, topicTitle, actorName };

    const quoted = body.quotedPosts.filter((id) => !skipPosts.has(id));
    if (quoted.length) {
      const rows = await this.db.q.selectFrom('posts').select('user_id').where('id', 'in', quoted.slice(0, 20)).execute();
      for (const r of rows) {
        if (!r.user_id || notified.has(r.user_id)) continue;
        notified.add(r.user_id);
        if (await this.userCanSeeTopic(r.user_id, board, topicId)) await this.notifications.notify(r.user_id, 'forum.quote', data, actorId || null);
      }
    }
    for (const id of body.mentions.slice(0, 20)) {
      if (notified.has(id) || skipUsers.has(id)) continue;
      notified.add(id);
      if (await this.userCanSeeTopic(id, board, topicId)) await this.notifications.notify(id, 'forum.mention', data, actorId || null);
    }
    return notified;
  }

  private async notifySubscribers(viewer: RequestViewer, postId: number, topic: Row<'topics'>, board: CachedBoard, already: Set<number>): Promise<void> {
    const actorId = viewer.user?.id ?? 0;
    const data = { postId, topicId: topic.id, topicTitle: topic.title, actorName: viewer.user?.display_name ?? '' };
    for (const id of await this.extras.subscriberIds(topic.id)) {
      if (id === actorId || already.has(id)) continue;
      if (await this.userCanSeeTopic(id, board, topic.id)) await this.notifications.notify(id, 'forum.reply', data, actorId || null);
    }
  }

  async userCanSeeTopic(userId: number, board: CachedBoard, topicId: number): Promise<boolean> {
    const user = await this.db.q.selectFrom('users').selectAll().where('id', '=', userId).where('deleted_at', 'is', null).executeTakeFirst();
    if (!user || user.status !== 'active') return false;
    const perms = await this.permissions.forUser(user);
    const v: RequestViewer = { user, session: null, groupIds: perms.groupIds, permissions: perms.permissions, isAdmin: perms.isAdmin, ip: null, userAgent: null };
    const access = await this.access.access(v, board.id);
    if (!access) return false;
    const topic = await this.db.q.selectFrom('topics').selectAll().where('id', '=', topicId).executeTakeFirst();
    if (!topic) return false;
    try {
      await this.assertTopicVisible(v, access, topic);
      return true;
    } catch {
      return false;
    }
  }

  pruneFlood(): void {
    const cutoff = this.clock.now() - DAY;
    for (const [k, t] of this.lastPostAt) if (t < cutoff) this.lastPostAt.delete(k);
  }
}
