/**
 * Invision Community (IPS) 4.x / 5.x okuyucusu. Forum, grup ve rütbe adları core_sys_lang_words tablosundadır;
 * mesajlar HTML olarak saklanır.
 */
import { legacyHash } from '../../security/legacy-password.js';
import { ipsToBBCode, type IpsContext } from '../convert.js';
import type {
  SourceCounts,
  SourceReader,
  SrcAccess,
  SrcAttachment,
  SrcBan,
  SrcBoard,
  SrcCategory,
  SrcConversation,
  SrcGroup,
  SrcModerator,
  SrcPoll,
  SrcPost,
  SrcTopic,
  SrcUser,
} from '../model.js';
import type { SqlValue } from '../sql-dump.js';
import type { StageRow, Stmt } from '../stage.js';
import { BaseReader, isImageName } from './base.js';

export class IpsReader extends BaseReader implements SourceReader {
  readonly platform = 'ips' as const;
  private words: Map<string, string> | null = null;
  private settingsCache: Map<string, string> | null = null;
  private attachByPath: Map<string, string> | null = null;
  private attachIds: Set<string> | null = null;

  private setting(key: string): string {
    if (!this.settingsCache) this.settingsCache = new Map(this.stage.rows(this.t('core_sys_conf_settings')).map((r) => [this.s(r.conf_key), this.s(r.conf_value ?? r.conf_default)]));
    return this.settingsCache.get(key) ?? '';
  }

  /** Dil dizesi: varsayılan dildeki özel çeviri, yoksa varsayılan metin */
  private word(key: string): string {
    if (!this.words) {
      this.words = new Map();
      const defaultLang = this.stage.rows(this.t('core_sys_lang'), 'WHERE lang_default = 1')[0];
      const langId = defaultLang ? this.n(defaultLang.lang_id) : null;
      const rows = this.stage.rows(this.t('core_sys_lang_words'));
      // Önce diğer dillerdeki, sonra varsayılan dildeki değerler (varsayılan üstün gelir)
      rows.sort((a, b) => Number(this.n(a.lang_id) === langId) - Number(this.n(b.lang_id) === langId));
      for (const r of rows) {
        const v = this.s(r.word_custom) || this.s(r.word_default);
        if (v) this.words.set(this.s(r.word_key), v);
      }
    }
    return this.words.get(key) ?? '';
  }

  private get guestGroup(): string {
    return this.setting('guest_group') || '2';
  }

  private get memberGroup(): string {
    return this.setting('member_group') || '3';
  }

  version(): string {
    const app = this.stage.rows(this.t('core_applications'), "WHERE app_directory = 'core'")[0];
    return app ? this.s(app.app_version) || String(this.n(app.app_long_version)) : '4.x';
  }

  counts(): SourceCounts {
    return {
      users: this.count('core_members'),
      groups: this.count('core_groups') + this.count('core_member_ranks'),
      categories: this.count('forums_forums', 'parent_id = -1'),
      boards: this.count('forums_forums', 'parent_id <> -1'),
      topics: this.count('forums_topics', "state <> 'link'"),
      posts: this.count('forums_posts'),
      polls: this.count('core_polls'),
      conversations: this.count('core_message_topics', 'mt_is_draft = 0 OR mt_is_draft IS NULL'),
      attachments: this.count('core_attachments_map', "location_key = 'forums_Forums'"),
    };
  }

  samples(): SqlValue[] {
    return [
      ...this.stage.all(`SELECT name AS v FROM ${this.tq('core_members')} ORDER BY member_posts DESC LIMIT 8`).map((r) => r.v!),
      ...this.stage.all(`SELECT title AS v FROM ${this.tq('forums_topics')} ORDER BY tid DESC LIMIT 12`).map((r) => r.v!),
    ];
  }

  guessBaseUrl(): string | null {
    return null;
  }

  private uploads(path: string): string | null {
    if (!path) return null;
    return /^https?:\/\//i.test(path) ? path : this.url(`uploads/${path}`);
  }

  private adminGroups(): Set<string> {
    return new Set(this.stage.rows(this.t('core_admin_permission_rows'), "WHERE row_id_type = 'group'").map((r) => this.id(r.row_id)));
  }

  private modGroups(): Set<string> {
    return new Set(this.stage.rows(this.t('core_moderators'), "WHERE type = 'g'").map((r) => this.id(r.id)));
  }

  groups(): SrcGroup[] {
    const admins = this.adminGroups();
    const mods = this.modGroups();
    const out: SrcGroup[] = [];
    for (const r of this.stage.rows(this.t('core_groups'), 'ORDER BY g_id')) {
      const id = this.id(r.g_id);
      const prefix = this.s(r.prefix);
      const role: SrcGroup['role'] =
        id === this.guestGroup ? 'guest' : id === this.memberGroup ? 'member' : admins.has(id) ? 'admin' : mods.has(id) ? 'global_moderator' : 'custom';
      out.push({
        id,
        name: this.word(`core_group_${id}`) || `Group ${id}`,
        description: '',
        color: /color:\s*([^;'"]+)/i.exec(prefix)?.[1]?.trim() ?? null,
        iconUrl: this.uploads(this.s(r.g_icon)),
        iconCount: 1,
        role,
        minPosts: null,
        hidden: this.n(r.g_hide_from_list) === 1,
      });
    }
    for (const r of this.stage.rows(this.t('core_member_ranks'), 'ORDER BY posts')) {
      const id = this.id(r.id);
      out.push({
        id: `rank:${id}`,
        name: this.word(`core_member_rank_${id}`) || this.s(r.title) || `Rank ${id}`,
        description: '',
        color: null,
        iconUrl: this.uploads(this.s(r.icon)),
        iconCount: Math.max(1, Math.min(10, this.n(r.pips) || 1)),
        role: 'custom',
        minPosts: this.n(r.posts),
        hidden: false,
      });
    }
    return out;
  }

  *users(): Iterable<SrcUser> {
    const validating = new Set(this.stage.rows(this.t('core_validating')).filter((r) => r.new_reg === undefined || this.n(r.new_reg) === 1).map((r) => this.id(r.member_id)));
    const now = Date.now();
    for (const r of this.stage.scan(this.t('core_members'))) {
      const id = this.id(r.member_id);
      const hash = this.s(r.members_pass_hash);
      const salt = this.s(r.members_pass_salt);
      const photo = this.s(r.pp_main_photo);
      const type = this.s(r.pp_photo_type);
      const tempBan = this.n(r.temp_ban);
      const [y, m, d] = [this.n(r.bday_year), this.n(r.bday_month), this.n(r.bday_day)];
      yield {
        id,
        username: this.s(r.name),
        displayName: this.s(r.name),
        email: this.s(r.email).trim(),
        passwordHash: hash.startsWith('$2') ? hash : /^[0-9a-f]{32}$/i.test(hash) ? legacyHash.ipsmd5(salt, hash) : '',
        registeredAt: this.ms(r.joined) ?? Date.now(),
        lastActiveAt: this.ms(r.last_activity) ?? this.ms(r.last_visit),
        ip: this.s(r.ip_address).trim() || null,
        postCount: this.n(r.member_posts),
        primaryGroup: this.id(r.member_group_id),
        groups: this.csv(r.mgroup_others),
        customTitle: this.s(r.member_title) || null,
        signature: ipsToBBCode(this.s(r.signature), this.ipsContext()),
        avatarUrl: photo && type !== 'none' && type !== 'letter' ? this.uploads(photo) : null,
        birthdate: y > 1900 && m > 0 && d > 0 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null,
        location: '',
        website: '',
        status: validating.has(id) ? 'pending_email' : 'active',
        bannedUntil: tempBan === -1 ? 0 : tempBan * 1000 > now ? tempBan * 1000 : null,
      };
    }
  }

  private forumRows(): StageRow[] {
    return this.stage.rows(this.t('forums_forums'), 'ORDER BY position, id');
  }

  categories(): SrcCategory[] {
    return this.forumRows()
      .filter((r) => this.n(r.parent_id) === -1)
      .map((r) => ({ id: this.id(r.id), name: this.word(`forums_forum_${this.id(r.id)}`) || this.s(r.name_seo), description: this.word(`forums_forum_${this.id(r.id)}_desc`), order: this.n(r.position) }));
  }

  boards(): SrcBoard[] {
    const rows = this.forumRows();
    const byId = new Map(rows.map((r) => [this.id(r.id), r]));
    const perms = new Map<string, StageRow>();
    for (const r of this.stage.rows(this.t('core_permission_index'), "WHERE app = 'forums' AND perm_type = 'forum'")) perms.set(this.id(r.perm_type_id), r);
    const staff = new Set([...this.adminGroups(), ...this.modGroups()]);
    const list = (v: SqlValue | undefined): string[] | '*' => {
      const s = this.s(v).trim();
      return s === '*' ? '*' : s.split(',').filter((x) => /^\d+$/.test(x));
    };
    const out: SrcBoard[] = [];
    for (const r of rows) {
      if (this.n(r.parent_id) === -1) continue;
      const id = this.id(r.id);
      let parent = byId.get(this.id(r.parent_id));
      const parentId = parent && this.n(parent.parent_id) !== -1 ? this.id(parent.id) : null;
      let categoryId = '';
      while (parent) {
        if (this.n(parent.parent_id) === -1) {
          categoryId = this.id(parent.id);
          break;
        }
        parent = byId.get(this.id(parent.parent_id));
      }
      const p = perms.get(id);
      let access: SrcAccess = { kind: 'public' };
      if (p) {
        const view = list(p.perm_view);
        const read = list(p.perm_2);
        const can = (g: string) => (view === '*' || view.includes(g)) && (read === '*' || read.includes(g));
        if (can(this.guestGroup)) access = { kind: 'public' };
        else if (can(this.memberGroup)) access = { kind: 'members' };
        else {
          const all = new Set([...(view === '*' ? [] : view), ...(read === '*' ? [] : read)]);
          const custom = [...all].filter((g) => can(g) && !staff.has(g));
          access = custom.length ? { kind: 'groups', groups: custom } : { kind: 'staff' };
        }
      }
      if (this.s(r.password)) access = { kind: 'staff' };
      out.push({
        id,
        categoryId,
        parentId,
        name: this.word(`forums_forum_${id}`) || this.s(r.name_seo) || `Forum ${id}`,
        description: this.word(`forums_forum_${id}_desc`).replace(/<[^>]+>/g, '').trim(),
        order: this.n(r.position),
        redirectUrl: this.n(r.redirect_on) === 1 ? this.s(r.redirect_url).trim() || null : null,
        access,
        countPosts: r.inc_postcount === undefined || this.n(r.inc_postcount) === 1,
      });
    }
    return out;
  }

  moderators(): SrcModerator[] {
    const boards = this.forumRows().filter((r) => this.n(r.parent_id) !== -1).map((r) => this.id(r.id));
    const out: SrcModerator[] = [];
    for (const r of this.stage.rows(this.t('core_moderators'))) {
      const raw = this.s(r.perms);
      let forums: string[] | '*' = '*';
      if (raw !== '*') {
        try {
          const parsed = JSON.parse(raw) as { forums?: unknown };
          forums = parsed.forums === '*' || parsed.forums === undefined || parsed.forums === 0 ? '*' : Array.isArray(parsed.forums) ? parsed.forums.map(String) : '*';
        } catch {
          forums = '*';
        }
      }
      const isGroup = this.s(r.type) === 'g';
      // Tüm forumları kapsayan grup moderatörlüğü, grup rolünde (genel moderatör) karşılanır
      if (forums === '*' && isGroup) continue;
      for (const b of forums === '*' ? boards : forums) out.push(isGroup ? { boardId: b, groupId: this.id(r.id) } : { boardId: b, userId: this.id(r.id) });
    }
    return out;
  }

  *topics(): Iterable<SrcTopic> {
    for (const r of this.stage.scan(this.t('forums_topics'), '*', "state <> 'link'")) {
      if (this.s(r.moved_to)) continue;
      const approved = this.n(r.approved);
      yield {
        id: this.id(r.tid),
        boardId: this.id(r.forum_id),
        title: this.s(r.title) || '—',
        userId: this.n(r.starter_id) > 0 ? this.id(r.starter_id) : null,
        authorName: this.s(r.starter_name),
        createdAt: this.ms(r.start_date) ?? Date.now(),
        views: this.n(r.views),
        pinned: this.n(r.pinned) === 1,
        locked: this.s(r.state) === 'closed',
        approved: approved !== 0,
        deleted: approved < 0,
      };
    }
  }

  private loadAttachIndex(): void {
    if (this.attachByPath) return;
    this.attachByPath = new Map();
    this.attachIds = new Set();
    for (const r of this.stage.scan(this.t('core_attachments'), 'attach_id, attach_location')) {
      const id = this.id(r.attach_id);
      this.attachIds.add(id);
      this.attachByPath.set(this.s(r.attach_location), id);
    }
  }

  private ctxCache: IpsContext | null = null;

  private ipsContext(): IpsContext {
    if (!this.ctxCache) {
      this.ctxCache = {
        baseUrl: this.ctx.baseUrl,
        attachment: ({ id, path }) => {
          this.loadAttachIndex();
          if (path && this.attachByPath!.has(path)) return this.attachByPath!.get(path)!;
          if (id && this.attachIds!.has(id)) return id;
          return null;
        },
      };
    }
    return this.ctxCache;
  }

  *posts(): Iterable<SrcPost> {
    const ctx = this.ipsContext();
    for (const r of this.stage.scan(this.t('forums_posts'))) {
      const queued = this.n(r.queued);
      yield {
        id: this.id(r.pid),
        topicId: this.id(r.topic_id),
        userId: this.n(r.author_id) > 0 ? this.id(r.author_id) : null,
        authorName: this.s(r.author_name),
        createdAt: this.ms(r.post_date) ?? Date.now(),
        ip: this.s(r.ip_address).trim() || null,
        body: ipsToBBCode(this.s(r.post), ctx),
        approved: queued !== 1,
        deleted: queued === -1 || queued === 2,
        editedAt: this.ms(r.edit_time),
        editReason: this.s(r.post_edit_reason) || null,
      };
    }
  }

  private attachStmt: Stmt | null = null;

  attachments(postId: string): SrcAttachment[] {
    if (!this.has('core_attachments_map') || !this.has('core_attachments')) return [];
    if (!this.attachStmt) {
      this.stage.index(this.t('core_attachments_map'), 'id2');
      this.stage.index(this.t('core_attachments'), 'attach_id');
      this.attachStmt = this.stage.db.prepare(
        `SELECT a.* FROM ${this.tq('core_attachments_map', 'm')} JOIN ${this.tq('core_attachments', 'a')} ON a.attach_id = m.attachment_id WHERE m.location_key = 'forums_Forums' AND m.id2 = ? ORDER BY a.attach_id`,
      );
    }
    return this.attachStmt.all(Number(postId)).map((r) => {
      const name = this.s(r.attach_file);
      return {
        id: this.id(r.attach_id),
        postId,
        name,
        url: this.uploads(this.s(r.attach_location)) ?? '',
        isImage: this.n(r.attach_is_image) === 1 || isImageName(name),
        size: this.n(r.attach_filesize),
      };
    });
  }

  *polls(): Iterable<SrcPoll> {
    if (!this.has('core_polls')) return;
    this.stage.index(this.t('core_voters'), 'poll');
    const voters = this.has('core_voters') ? this.stage.db.prepare(`SELECT member_id, member_choices FROM ${this.tq('core_voters')} WHERE poll = ? AND member_id > 0`) : null;
    const rows = this.stage.all(`SELECT t.tid, p.* FROM ${this.tq('forums_topics', 't')} JOIN ${this.tq('core_polls', 'p')} ON p.pid = t.poll_state WHERE t.poll_state > 0`);
    for (const r of rows) {
      let data: Record<string, { question?: string; multi?: number; choice?: Record<string, string>; votes?: Record<string, number> }>;
      try {
        data = JSON.parse(this.s(r.choices)) as typeof data;
      } catch {
        continue;
      }
      const first = Object.entries(data)[0];
      if (!first) continue;
      const [qid, question] = first;
      const choices = Object.entries(question.choice ?? {});
      const votes: SrcPoll['votes'] = [];
      for (const v of voters?.all(this.n(r.pid)) ?? []) {
        try {
          const picked = (JSON.parse(this.s(v.member_choices)) as Record<string, number | number[]>)[qid];
          for (const c of Array.isArray(picked) ? picked : picked !== undefined ? [picked] : []) votes.push({ userId: this.id(v.member_id), optionId: String(c) });
        } catch {
          /* bozuk oy kaydı */
        }
      }
      yield {
        topicId: this.id(r.tid),
        question: this.s(question.question ?? '') || this.s(r.poll_question),
        maxChoices: question.multi ? choices.length : 1,
        allowChange: false,
        closesAt: this.ms(r.poll_close_date),
        createdAt: this.ms(r.start_date) ?? Date.now(),
        options: choices.map(([id, label]) => ({ id, label: String(label), votes: Number(question.votes?.[id] ?? 0) })),
        votes,
      };
    }
  }

  *conversations(): Iterable<SrcConversation> {
    if (!this.has('core_message_topics')) return;
    this.stage.index(this.t('core_message_posts'), 'msg_topic_id');
    this.stage.index(this.t('core_message_topic_user_map'), 'map_topic_id');
    const posts = this.stage.db.prepare(`SELECT * FROM ${this.tq('core_message_posts')} WHERE msg_topic_id = ? ORDER BY msg_date, msg_id`);
    const users = this.has('core_message_topic_user_map') ? this.stage.db.prepare(`SELECT map_user_id FROM ${this.tq('core_message_topic_user_map')} WHERE map_topic_id = ?`) : null;
    const ctx = this.ipsContext();
    for (const t of this.stage.scan(this.t('core_message_topics'), '*', 'mt_is_draft = 0 OR mt_is_draft IS NULL')) {
      const id = this.n(t.mt_id);
      const rows = posts.all(id);
      if (!rows.length) continue;
      const participants = new Set<string>([this.id(t.mt_starter_id)]);
      for (const u of users?.all(id) ?? []) participants.add(this.id(u.map_user_id));
      yield {
        id: String(id),
        title: this.s(t.mt_title),
        participants: [...participants].filter((p) => p !== '0'),
        messages: rows.map((m) => ({
          userId: this.n(m.msg_author_id) > 0 ? this.id(m.msg_author_id) : null,
          authorName: '',
          createdAt: this.ms(m.msg_date) ?? Date.now(),
          body: ipsToBBCode(this.s(m.msg_post), ctx),
        })),
      };
    }
  }

  bans(): SrcBan[] {
    return this.stage
      .rows(this.t('core_banfilters'))
      .filter((r) => ['ip', 'email'].includes(this.s(r.ban_type)))
      .map((r) => ({ kind: this.s(r.ban_type) as 'ip' | 'email', value: this.s(r.ban_content).trim(), reason: this.s(r.ban_reason), expiresAt: null }))
      .filter((b) => b.value);
  }
}
