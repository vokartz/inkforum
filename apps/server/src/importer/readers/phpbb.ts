/**
 * phpBB 3.0 – 3.3 okuyucusu.
 */
import { legacyHash } from '../../security/legacy-password.js';
import { phpbbToBBCode } from '../convert.js';
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

const SPECIAL_ROLE: Record<string, SrcGroup['role'] | 'skip'> = {
  GUESTS: 'guest',
  REGISTERED: 'member',
  REGISTERED_COPPA: 'member',
  NEWLY_REGISTERED: 'member',
  GLOBAL_MODERATORS: 'global_moderator',
  ADMINISTRATORS: 'admin',
  BOTS: 'skip',
  AI_CRAWLERS: 'skip',
};

export class PhpbbReader extends BaseReader implements SourceReader {
  readonly platform = 'phpbb' as const;
  private configCache: Map<string, string> | null = null;

  private config(key: string): string {
    if (!this.configCache) {
      this.configCache = new Map(this.stage.rows(this.t('config')).map((r) => [this.s(r.config_name), this.s(r.config_value)]));
    }
    return this.configCache.get(key) ?? '';
  }

  version(): string {
    return this.config('version') || (this.has('migrations') || this.col('posts', 'post_visibility') ? '3.1+' : '3.0');
  }

  counts(): SourceCounts {
    return {
      users: this.count('users', 'user_type <> 2'),
      groups: this.count('groups') + this.count('ranks'),
      categories: this.count('forums', 'forum_type = 0 AND parent_id = 0'),
      boards: this.count('forums', 'NOT (forum_type = 0 AND parent_id = 0)'),
      topics: this.count('topics', 'topic_status <> 2'),
      posts: this.count('posts'),
      polls: this.count('topics', "poll_start > 0"),
      conversations: this.has('privmsgs') ? this.count('privmsgs', 'root_level = 0') : 0,
      attachments: this.count('attachments', 'in_message = 0 AND is_orphan = 0'),
    };
  }

  samples(): SqlValue[] {
    return [
      ...this.stage.all(`SELECT username AS v FROM ${this.tq('users')} WHERE user_type <> 2 ORDER BY user_posts DESC LIMIT 8`).map((r) => r.v!),
      ...this.stage.all(`SELECT topic_title AS v FROM ${this.tq('topics')} ORDER BY topic_id DESC LIMIT 12`).map((r) => r.v!),
    ];
  }

  guessBaseUrl(): string | null {
    const host = this.config('server_name');
    if (!host) return null;
    const proto = this.config('server_protocol') || 'https://';
    const port = this.config('server_port');
    const path = this.config('script_path').replace(/\/+$/, '');
    return `${proto}${host}${port && port !== '80' && port !== '443' ? `:${port}` : ''}${path}`;
  }

  // ---------- Gruplar ve rütbeler ----------

  private specialGroups(): Map<string, string> {
    const out = new Map<string, string>();
    for (const r of this.stage.rows(this.t('groups'), 'WHERE group_type = 3')) out.set(this.s(r.group_name), this.id(r.group_id));
    return out;
  }

  groups(): SrcGroup[] {
    const out: SrcGroup[] = [];
    for (const r of this.stage.rows(this.t('groups'), 'ORDER BY group_id')) {
      const special = this.n(r.group_type) === 3 ? SPECIAL_ROLE[this.s(r.group_name)] : undefined;
      if (special === 'skip') continue;
      const colour = this.s(r.group_colour);
      out.push({
        id: this.id(r.group_id),
        name: this.e(r.group_name),
        description: phpbbToBBCode(this.s(r.group_desc), this.s(r.group_desc_uid)),
        color: /^[0-9a-f]{6}$/i.test(colour) ? `#${colour}` : null,
        iconUrl: null,
        iconCount: 1,
        role: special ?? 'custom',
        minPosts: null,
        hidden: this.n(r.group_type) === 2,
      });
    }
    // Rütbeler: mesaj sayısı rütbeleri ve özel rütbeler (rütbe görselleriyle)
    const ranksPath = this.config('ranks_path') || 'images/ranks';
    for (const r of this.stage.rows(this.t('ranks'), 'ORDER BY rank_min')) {
      const image = this.s(r.rank_image);
      const special = this.n(r.rank_special) === 1;
      out.push({
        id: `rank:${this.id(r.rank_id)}`,
        name: this.e(r.rank_title),
        description: '',
        color: null,
        iconUrl: image ? this.url(`${ranksPath}/${image}`) : null,
        iconCount: 1,
        role: 'custom',
        minPosts: special ? null : this.n(r.rank_min),
        hidden: false,
      });
    }
    return out;
  }

  // ---------- Üyeler ----------

  *users(): Iterable<SrcUser> {
    const memberships = new Map<string, string[]>();
    for (const r of this.stage.rows(this.t('user_group'), 'WHERE user_pending = 0 OR user_pending IS NULL')) {
      const uid = this.id(r.user_id);
      const list = memberships.get(uid) ?? [];
      list.push(this.id(r.group_id));
      memberships.set(uid, list);
    }
    const specialRanks = new Set(this.stage.rows(this.t('ranks'), 'WHERE rank_special = 1').map((r) => this.id(r.rank_id)));
    const fields = new Map<string, StageRow>();
    for (const r of this.stage.rows(this.t('profile_fields_data'))) fields.set(this.id(r.user_id), r);
    const bans = new Map<string, { until: number; reason: string }>();
    const now = Date.now();
    for (const r of this.stage.rows(this.t('banlist'), 'WHERE ban_userid > 0 AND (ban_exclude = 0 OR ban_exclude IS NULL)')) {
      const until = this.ms(r.ban_end) ?? 0;
      if (!until || until > now) bans.set(this.id(r.ban_userid), { until, reason: this.e(r.ban_give_reason) || this.e(r.ban_reason) });
    }
    const galleryPath = this.config('avatar_gallery_path') || 'images/avatars/gallery';

    for (const r of this.stage.scan(this.t('users'), '*', 'user_type <> 2')) {
      const id = this.id(r.user_id);
      const type = this.s(r.user_avatar_type);
      const avatar = this.s(r.user_avatar);
      let avatarUrl: string | null = null;
      if (avatar) {
        if (type === '1' || type === 'avatar.driver.upload') avatarUrl = this.url(`download/file.php?avatar=${avatar}`);
        else if (type === '2' || type === 'avatar.driver.remote') avatarUrl = /^https?:\/\//i.test(avatar) ? avatar : null;
        else if (type === '3' || type === 'avatar.driver.local') avatarUrl = this.url(`${galleryPath}/${avatar}`);
      }
      const bday = /^\s*(\d{1,2})-\s*(\d{1,2})-\s*(\d{4})\s*$/.exec(this.s(r.user_birthday));
      const pf = fields.get(id);
      const groups = (memberships.get(id) ?? []).filter((g) => g !== this.id(r.group_id));
      const rank = this.id(r.user_rank);
      if (rank !== '0' && specialRanks.has(rank)) groups.push(`rank:${rank}`);
      const inactive = this.n(r.user_type) === 1;
      const reason = this.n(r.user_inactive_reason);
      const ban = bans.get(id);
      const password = this.s(r.user_password);
      yield {
        id,
        username: this.e(r.username),
        displayName: this.e(r.username),
        email: this.s(r.user_email).trim(),
        passwordHash: password ? legacyHash.phpbb(password) : '',
        registeredAt: this.ms(r.user_regdate) ?? Date.now(),
        lastActiveAt: this.ms(r.user_lastvisit),
        ip: this.s(r.user_ip).trim() || null,
        postCount: this.n(r.user_posts),
        primaryGroup: this.id(r.group_id),
        groups,
        customTitle: null,
        signature: phpbbToBBCode(this.s(r.user_sig), this.s(r.user_sig_bbcode_uid)),
        avatarUrl,
        birthdate: bday && Number(bday[3]) > 1900 ? `${bday[3]}-${bday[2]!.padStart(2, '0')}-${bday[1]!.padStart(2, '0')}` : null,
        location: r.user_from !== undefined ? this.e(r.user_from) : pf ? this.e(pf.pf_phpbb_location) : '',
        website: (r.user_website !== undefined ? this.s(r.user_website) : pf ? this.s(pf.pf_phpbb_website) : '').trim(),
        status: !inactive ? 'active' : reason === 3 ? 'pending_approval' : 'pending_email',
        bannedUntil: ban ? ban.until : null,
        banReason: ban?.reason,
      };
    }
  }

  // ---------- Forum yapısı ----------

  private forumRows(): StageRow[] {
    return this.stage.rows(this.t('forums'), 'ORDER BY left_id');
  }

  categories(): SrcCategory[] {
    const out: SrcCategory[] = this.forumRows()
      .filter((r) => this.n(r.forum_type) === 0 && this.n(r.parent_id) === 0)
      .map((r) => ({ id: this.id(r.forum_id), name: this.e(r.forum_name), description: phpbbToBBCode(this.s(r.forum_desc), this.s(r.forum_desc_uid)), order: this.n(r.left_id) }));
    // Kök düzeydeki forumlar için kategori
    if (this.forumRows().some((r) => this.n(r.parent_id) === 0 && this.n(r.forum_type) !== 0)) out.unshift({ id: 'root', name: 'Forum', description: '', order: -1 });
    return out;
  }

  /** Grup → forum → f_read (1 evet, 0 asla, -1 hayır) */
  private readAccess(): Map<string, Set<string>> {
    const allowed = new Map<string, Set<string>>();
    if (!this.has('acl_groups') || !this.has('acl_options')) return allowed;
    const opt = this.stage.get(`SELECT auth_option_id FROM ${this.tq('acl_options')} WHERE auth_option = 'f_read'`);
    if (!opt) return allowed;
    const readId = this.n(opt.auth_option_id);
    const roleSetting = new Map<string, number>();
    for (const r of this.stage.rows(this.t('acl_roles_data'), `WHERE auth_option_id = ${readId}`)) roleSetting.set(this.id(r.role_id), this.n(r.auth_setting));
    const never = new Set<string>();
    for (const r of this.stage.rows(this.t('acl_groups'))) {
      const forum = this.id(r.forum_id);
      if (forum === '0') continue;
      const role = this.id(r.auth_role_id);
      const setting = role !== '0' ? roleSetting.get(role) : this.n(r.auth_option_id) === readId ? this.n(r.auth_setting) : undefined;
      if (setting === undefined) continue;
      const key = `${forum}:${this.id(r.group_id)}`;
      if (setting === 0) never.add(key);
      if (setting === 1) {
        const set = allowed.get(forum) ?? new Set<string>();
        set.add(this.id(r.group_id));
        allowed.set(forum, set);
      }
    }
    for (const key of never) {
      const [forum, group] = key.split(':') as [string, string];
      allowed.get(forum)?.delete(group);
    }
    return allowed;
  }

  boards(): SrcBoard[] {
    const rows = this.forumRows();
    const byId = new Map(rows.map((r) => [this.id(r.forum_id), r]));
    const isCategory = (r: StageRow) => this.n(r.forum_type) === 0 && this.n(r.parent_id) === 0;
    const access = this.readAccess();
    const special = this.specialGroups();
    const guests = special.get('GUESTS');
    const members = special.get('REGISTERED');
    const staffAndBots = new Set(['ADMINISTRATORS', 'GLOBAL_MODERATORS', 'BOTS', 'AI_CRAWLERS', 'REGISTERED_COPPA', 'NEWLY_REGISTERED'].map((k) => special.get(k)).filter(Boolean) as string[]);
    const hasAcl = access.size > 0;
    const out: SrcBoard[] = [];
    for (const r of rows) {
      if (isCategory(r)) continue;
      const id = this.id(r.forum_id);
      // En yakın kök kategori ve (varsa) üst forum
      let parent = byId.get(this.id(r.parent_id));
      let categoryId = 'root';
      let parentId: string | null = null;
      if (parent && !isCategory(parent)) parentId = this.id(parent.forum_id);
      while (parent) {
        if (isCategory(parent)) {
          categoryId = this.id(parent.forum_id);
          break;
        }
        parent = byId.get(this.id(parent.parent_id));
      }
      const readers = access.get(id) ?? new Set<string>();
      let acc: SrcAccess;
      if (!hasAcl) acc = { kind: 'public' };
      else if (this.s(r.forum_password)) acc = { kind: 'staff' };
      else if (guests && readers.has(guests)) acc = { kind: 'public' };
      else if (members && readers.has(members)) acc = { kind: 'members' };
      else {
        const custom = [...readers].filter((g) => !staffAndBots.has(g));
        acc = custom.length ? { kind: 'groups', groups: custom } : { kind: 'staff' };
      }
      out.push({
        id,
        categoryId,
        parentId,
        name: this.e(r.forum_name),
        description: phpbbToBBCode(this.s(r.forum_desc), this.s(r.forum_desc_uid)),
        order: this.n(r.left_id),
        redirectUrl: this.n(r.forum_type) === 2 ? this.s(r.forum_link).trim() || null : null,
        access: acc,
        countPosts: true,
      });
    }
    return out;
  }

  moderators(): SrcModerator[] {
    return this.stage.rows(this.t('moderator_cache')).map((r) =>
      this.n(r.user_id) > 0 ? { boardId: this.id(r.forum_id), userId: this.id(r.user_id) } : { boardId: this.id(r.forum_id), groupId: this.id(r.group_id) },
    );
  }

  // ---------- Konular ve mesajlar ----------

  private visible(r: StageRow, prefix: 'topic' | 'post'): { approved: boolean; deleted: boolean } {
    const vis = r[`${prefix}_visibility`];
    if (vis !== undefined && vis !== null) {
      const v = this.n(vis);
      return { approved: v === 1 || v === 2, deleted: v === 2 };
    }
    const app = r[`${prefix}_approved`];
    return { approved: app === undefined || app === null || this.n(app) === 1, deleted: false };
  }

  *topics(): Iterable<SrcTopic> {
    const firstForum = this.stage.db.prepare(`SELECT forum_id FROM ${this.tq('posts')} WHERE topic_id = ? AND forum_id > 0 LIMIT 1`);
    for (const r of this.stage.scan(this.t('topics'), '*', 'topic_status <> 2 AND (topic_moved_id = 0 OR topic_moved_id IS NULL)')) {
      const vis = this.visible(r, 'topic');
      let board = this.id(r.forum_id);
      if (board === '0') board = this.id(firstForum.get(this.n(r.topic_id))?.forum_id);
      yield {
        id: this.id(r.topic_id),
        boardId: board,
        title: this.e(r.topic_title) || '—',
        userId: this.n(r.topic_poster) > 1 ? this.id(r.topic_poster) : null,
        authorName: this.e(r.topic_first_poster_name),
        createdAt: this.ms(r.topic_time) ?? Date.now(),
        views: this.n(r.topic_views),
        pinned: this.n(r.topic_type) > 0,
        locked: this.n(r.topic_status) === 1,
        approved: vis.approved,
        deleted: vis.deleted,
      };
    }
  }

  private lastAttachments: { postId: string; list: SrcAttachment[] } | null = null;
  private attachStmt: Stmt | null = null;

  attachments(postId: string): SrcAttachment[] {
    if (this.lastAttachments?.postId === postId) return this.lastAttachments.list;
    if (!this.has('attachments')) return [];
    if (!this.attachStmt) {
      this.stage.index(this.t('attachments'), 'post_msg_id');
      this.attachStmt = this.stage.db.prepare(
        `SELECT attach_id, real_filename, mimetype, filesize FROM ${this.tq('attachments')} WHERE post_msg_id = ? AND in_message = 0 AND (is_orphan = 0 OR is_orphan IS NULL) ORDER BY attach_id DESC`,
      );
    }
    const list = this.attachStmt.all(Number(postId)).map((r) => {
      const name = this.e(r.real_filename);
      return { id: this.id(r.attach_id), postId, name, url: this.url(`download/file.php?id=${this.id(r.attach_id)}`) ?? '', isImage: isImageName(name, this.s(r.mimetype)), size: this.n(r.filesize) };
    });
    this.lastAttachments = { postId, list };
    return list;
  }

  *posts(): Iterable<SrcPost> {
    for (const r of this.stage.scan(this.t('posts'))) {
      const id = this.id(r.post_id);
      const vis = this.visible(r, 'post');
      const hasAttach = this.n(r.post_attachment) > 0;
      const list = hasAttach ? this.attachments(id) : [];
      yield {
        id,
        topicId: this.id(r.topic_id),
        userId: this.n(r.poster_id) > 1 ? this.id(r.poster_id) : null,
        authorName: this.e(r.post_username),
        createdAt: this.ms(r.post_time) ?? Date.now(),
        ip: this.s(r.poster_ip).trim() || null,
        body: phpbbToBBCode(this.s(r.post_text), this.s(r.bbcode_uid), (i) => list[i]?.id ?? null),
        approved: vis.approved,
        deleted: vis.deleted,
        editedAt: this.ms(r.post_edit_time),
        editReason: this.e(r.post_edit_reason) || null,
      };
    }
  }

  *polls(): Iterable<SrcPoll> {
    if (!this.has('poll_options')) return;
    this.stage.index(this.t('poll_options'), 'topic_id');
    this.stage.index(this.t('poll_votes'), 'topic_id');
    const options = this.stage.db.prepare(`SELECT poll_option_id, poll_option_text, poll_option_total FROM ${this.tq('poll_options')} WHERE topic_id = ? ORDER BY poll_option_id`);
    const votes = this.has('poll_votes') ? this.stage.db.prepare(`SELECT vote_user_id, poll_option_id FROM ${this.tq('poll_votes')} WHERE topic_id = ? AND vote_user_id > 1`) : null;
    const plain = (v: SqlValue | undefined) => phpbbToBBCode(this.s(v), '').replace(/:[a-z0-9]{5,8}\]/g, ']');
    for (const r of this.stage.scan(this.t('topics'), 'topic_id, poll_title, poll_start, poll_length, poll_max_options, poll_vote_change', "poll_start > 0")) {
      const tid = this.n(r.topic_id);
      const start = this.n(r.poll_start);
      const length = this.n(r.poll_length);
      yield {
        topicId: String(tid),
        question: plain(r.poll_title),
        maxChoices: Math.max(1, this.n(r.poll_max_options)),
        allowChange: this.n(r.poll_vote_change) > 0,
        closesAt: length > 0 ? (start + length) * 1000 : null,
        createdAt: start * 1000,
        options: options.all(tid).map((o) => ({ id: this.id(o.poll_option_id), label: plain(o.poll_option_text), votes: this.n(o.poll_option_total) })),
        votes: (votes?.all(tid) ?? []).map((v) => ({ userId: this.id(v.vote_user_id), optionId: this.id(v.poll_option_id) })),
      };
    }
  }

  *conversations(): Iterable<SrcConversation> {
    if (!this.has('privmsgs')) return;
    this.stage.index(this.t('privmsgs'), 'root_level');
    this.stage.index(this.t('privmsgs_to'), 'msg_id');
    const thread = this.stage.db.prepare(`SELECT * FROM ${this.tq('privmsgs')} WHERE msg_id = ? OR root_level = ? ORDER BY message_time, msg_id`);
    const to = this.has('privmsgs_to') ? this.stage.db.prepare(`SELECT user_id FROM ${this.tq('privmsgs_to')} WHERE msg_id = ?`) : null;
    for (const root of this.stage.scan(this.t('privmsgs'), 'msg_id', 'root_level = 0')) {
      const id = this.n(root.msg_id);
      const rows = thread.all(id, id);
      const participants = new Set<string>();
      for (const m of rows) {
        if (this.n(m.author_id) > 1) participants.add(this.id(m.author_id));
        for (const t of to?.all(this.n(m.msg_id)) ?? []) if (this.n(t.user_id) > 1) participants.add(this.id(t.user_id));
      }
      if (!rows.length) continue;
      yield {
        id: String(id),
        title: this.e(rows[0]!.message_subject),
        participants: [...participants],
        messages: rows.map((m) => ({
          userId: this.n(m.author_id) > 1 ? this.id(m.author_id) : null,
          authorName: '',
          createdAt: this.ms(m.message_time) ?? Date.now(),
          body: phpbbToBBCode(this.s(m.message_text), this.s(m.bbcode_uid)),
        })),
      };
    }
  }

  bans(): SrcBan[] {
    const out: SrcBan[] = [];
    const now = Date.now();
    for (const r of this.stage.rows(this.t('banlist'), 'WHERE (ban_userid = 0 OR ban_userid IS NULL) AND (ban_exclude = 0 OR ban_exclude IS NULL)')) {
      const expiresAt = this.ms(r.ban_end);
      if (expiresAt && expiresAt < now) continue;
      const reason = this.e(r.ban_give_reason) || this.e(r.ban_reason);
      const ip = this.s(r.ban_ip).trim();
      const email = this.s(r.ban_email).trim();
      if (ip) out.push({ kind: 'ip', value: ip, reason, expiresAt });
      if (email) out.push({ kind: 'email', value: email, reason, expiresAt });
    }
    return out;
  }
}
