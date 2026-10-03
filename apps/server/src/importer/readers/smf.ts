import { legacyHash } from '../../security/legacy-password.js';
import { smfToBBCode } from '../convert.js';
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
import { joinScan, type Stmt } from '../stage.js';
import type { SqlValue } from '../sql-dump.js';
import { BaseReader, baseFrom, isImageName } from './base.js';

export class SmfReader extends BaseReader implements SourceReader {
  readonly platform = 'smf' as const;
  private settingsCache: Map<string, string> | null = null;

  private setting(key: string): string {
    if (!this.settingsCache) {
      this.settingsCache = new Map(this.stage.rows(this.t('settings')).map((r) => [this.s(r.variable), this.s(r.value)]));
    }
    return this.settingsCache.get(key) ?? '';
  }

  private get is21(): boolean {
    return this.col('membergroups', 'icons') || this.has('user_alerts');
  }

  version(): string {
    return this.setting('smfVersion') || (this.is21 ? '2.1' : '2.0');
  }

  counts(): SourceCounts {
    return {
      users: this.count('members'),
      groups: this.count('membergroups'),
      categories: this.count('categories'),
      boards: this.count('boards'),
      topics: this.count('topics'),
      posts: this.count('messages'),
      polls: this.count('polls'),
      conversations: this.has('personal_messages') ? this.count('personal_messages', 'id_pm = id_pm_head OR id_pm_head = 0') : 0,
      attachments: this.count('attachments', 'id_msg > 0 AND attachment_type = 0'),
    };
  }

  samples(): SqlValue[] {
    return [
      ...this.stage.all(`SELECT real_name AS v FROM ${this.tq('members')} ORDER BY posts DESC LIMIT 8`).map((r) => r.v!),
      ...this.stage.all(`SELECT m.subject AS v FROM ${this.tq('topics', 't')} JOIN ${this.tq('messages', 'm')} ON m.id_msg = t.id_first_msg ORDER BY t.id_topic DESC LIMIT 12`).map((r) => r.v!),
    ];
  }

  guessBaseUrl(): string | null {
    return (
      baseFrom(this.setting('smileys_url'), /\/Smileys\/?$/i) ??
      baseFrom(this.setting('avatar_url'), /\/avatars\/?$/i) ??
      baseFrom(this.setting('theme_url') || this.setting('images_url'), /\/Themes\/.*$/i)
    );
  }

  groups(): SrcGroup[] {
    const out: SrcGroup[] = [
      { id: '-1', name: 'Guests', description: '', color: null, iconUrl: null, iconCount: 0, role: 'guest', minPosts: null, hidden: false },
      { id: '0', name: 'Regular Members', description: '', color: null, iconUrl: null, iconCount: 0, role: 'member', minPosts: null, hidden: false },
    ];
    const iconCol = this.col('membergroups', 'icons') ? 'icons' : 'stars';
    for (const r of this.stage.rows(this.t('membergroups'), 'ORDER BY id_group')) {
      const id = this.id(r.id_group);
      const [count, file] = this.s(r[iconCol]).split('#');
      const iconPath = file ? (this.is21 ? `Themes/default/images/membericons/${file}` : `Themes/default/images/${file}`) : '';
      const minPosts = this.n(r.min_posts);
      out.push({
        id,
        name: this.e(r.group_name),
        description: this.e(r.description),
        color: this.s(r.online_color) || null,
        iconUrl: this.url(iconPath),
        iconCount: Math.max(1, Math.min(10, Number(count) || 1)),
        role: id === '1' ? 'admin' : id === '2' ? 'global_moderator' : id === '3' ? 'moderator' : 'custom',
        minPosts: minPosts >= 0 && r.min_posts !== null && id !== '1' && id !== '2' && id !== '3' ? minPosts : null,
        hidden: this.n(r.hidden) > 0,
      });
    }
    return out;
  }

  private bannedMembers(): Map<string, { until: number; reason: string }> {
    const out = new Map<string, { until: number; reason: string }>();
    if (!this.has('ban_items') || !this.has('ban_groups')) return out;
    const rows = this.stage.all(
      `SELECT i.id_member, g.expire_time, g.reason, g.cannot_access, g.cannot_login FROM ${this.tq('ban_items', 'i')} JOIN ${this.tq('ban_groups', 'g')} ON g.id_ban_group = i.id_ban_group WHERE i.id_member > 0`,
    );
    const now = Date.now();
    for (const r of rows) {
      const until = this.ms(r.expire_time) ?? 0;
      if (until && until < now) continue;
      out.set(this.id(r.id_member), { until, reason: this.e(r.reason) });
    }
    return out;
  }

  *users(): Iterable<SrcUser> {
    const table = this.t('members');
    const avatars = new Map<string, { id: string; type: number; file: string }>();
    if (this.has('attachments')) {
      for (const a of this.stage.all(`SELECT id_member, id_attach, attachment_type, filename FROM ${this.tq('attachments')} WHERE id_member > 0 AND id_msg = 0`)) {
        avatars.set(this.id(a.id_member), { id: this.id(a.id_attach), type: this.n(a.attachment_type), file: this.s(a.filename) });
      }
    }
    const banned = this.bannedMembers();
    const customAvatarUrl = this.setting('custom_avatar_url');
    for (const r of this.stage.scan(table)) {
      const id = this.id(r.id_member);
      const storedName = this.s(r.member_name);
      const passwd = this.s(r.passwd);
      const passwordHash = /^[0-9a-f]{40}$/i.test(passwd)
        ? legacyHash.smf1(storedName, passwd)
        : /^\$2[aby]\$/.test(passwd)
          ? legacyHash.smf2(storedName, passwd)
          : passwd.startsWith('$')
            ? passwd
            : '';
      const act = this.n(r.is_activated);
      const avatarRaw = this.s(r.avatar);
      let avatarUrl: string | null = null;
      if (/^https?:\/\//i.test(avatarRaw)) avatarUrl = avatarRaw;
      else if (avatarRaw && !avatarRaw.startsWith('gravatar://') && avatarRaw !== 'blank.png') avatarUrl = this.url(`avatars/${avatarRaw}`);
      else {
        const a = avatars.get(id);
        if (a) {
          avatarUrl =
            a.type === 1
              ? customAvatarUrl
                ? `${customAvatarUrl.replace(/\/+$/, '')}/${a.file}`
                : this.url(`custom_avatar/${a.file}`)
              : this.url(`index.php?action=dlattach;attach=${a.id};type=avatar`);
        }
      }
      const bday = this.s(r.birthdate);
      const year = Number(bday.slice(0, 4));
      const ban = banned.get(id) ?? (act > 10 ? { until: 0, reason: '' } : undefined);
      yield {
        id,
        username: this.e(r.member_name),
        displayName: this.e(r.real_name) || this.e(r.member_name),
        email: this.s(r.email_address).trim(),
        passwordHash,
        registeredAt: this.ms(r.date_registered) ?? Date.now(),
        lastActiveAt: this.ms(r.last_login),
        ip: this.ip(r.member_ip),
        postCount: this.n(r.posts),
        primaryGroup: this.id(r.id_group),
        groups: this.csv(r.additional_groups),
        customTitle: this.e(r.usertitle) || null,
        signature: smfToBBCode(this.s(r.signature)),
        avatarUrl,
        birthdate: year > 1004 && /^\d{4}-\d{2}-\d{2}$/.test(bday) && !bday.endsWith('-00') ? bday : null,
        location: r.location !== undefined ? this.e(r.location) : '',
        website: this.s(r.website_url).trim(),
        status: act % 10 === 1 ? 'active' : act % 10 === 3 ? 'pending_approval' : act % 10 === 0 ? 'pending_email' : 'active',
        bannedUntil: ban ? ban.until : null,
        banReason: ban?.reason,
      };
    }
  }

  categories(): SrcCategory[] {
    return this.stage.rows(this.t('categories'), 'ORDER BY cat_order, id_cat').map((r) => ({
      id: this.id(r.id_cat),
      name: this.e(r.name),
      description: r.description !== undefined ? this.e(r.description) : '',
      order: this.n(r.cat_order),
    }));
  }

  boards(): SrcBoard[] {
    const postGroups = new Set(
      this.stage.rows(this.t('membergroups'), 'WHERE min_posts >= 0').map((r) => this.id(r.id_group)),
    );
    const recycle = this.setting('recycle_enable') === '1' ? this.setting('recycle_board') : '';
    return this.stage.rows(this.t('boards'), 'ORDER BY board_order, id_board').map((r) => {
      const id = this.id(r.id_board);
      const groups = this.csv(r.member_groups);
      let access: SrcAccess;
      if (id === recycle) access = { kind: 'staff' };
      else if (groups.includes('-1')) access = { kind: 'public' };
      else if (groups.includes('0') || (postGroups.size > 0 && [...postGroups].every((g) => groups.includes(g)))) access = { kind: 'members' };
      else {
        const custom = groups.filter((g) => !['1', '2', '3'].includes(g) && !postGroups.has(g));
        access = custom.length ? { kind: 'groups', groups: custom } : { kind: 'staff' };
      }
      const parent = this.id(r.id_parent);
      return {
        id,
        categoryId: this.id(r.id_cat),
        parentId: parent !== '0' ? parent : null,
        name: this.e(r.name),
        description: this.e(r.description),
        order: this.n(r.board_order),
        redirectUrl: this.s(r.redirect).trim() || null,
        access,
        countPosts: this.n(r.count_posts) === 0,
      };
    });
  }

  moderators(): SrcModerator[] {
    const out: SrcModerator[] = this.stage.rows(this.t('moderators')).map((r) => ({ boardId: this.id(r.id_board), userId: this.id(r.id_member) }));
    for (const r of this.stage.rows(this.t('moderator_groups'))) out.push({ boardId: this.id(r.id_board), groupId: this.id(r.id_group) });
    return out;
  }

  *topics(): Iterable<SrcTopic> {
    this.stage.index(this.t('messages'), 'id_msg');
    const redirectCol = this.col('topics', 'id_redirect_topic') ? 't.id_redirect_topic' : '0';
    const rows = joinScan(
      this.stage,
      `t.id_topic, t.id_board, t.is_sticky, t.locked, t.num_views, t.num_replies, ${this.col('topics', 'approved') ? 't.approved' : '1'} AS approved, ${redirectCol} AS redirect_to,
       m.subject, m.poster_name, m.poster_time, m.id_member, m.body`,
      `${this.tq('topics', 't')} LEFT JOIN ${this.tq('messages', 'm')} ON m.id_msg = t.id_first_msg`,
      't',
    );
    for (const r of rows) {
      if (this.n(r.redirect_to) > 0) continue;
      if (this.n(r.locked) && this.n(r.num_replies) === 0 && /index\.php\?topic=\d+/.test(this.s(r.body)) && /\[iurl\]|\[url/.test(this.s(r.body)) && this.s(r.body).length < 600) continue;
      yield {
        id: this.id(r.id_topic),
        boardId: this.id(r.id_board),
        title: this.e(r.subject) || '—',
        userId: this.n(r.id_member) > 0 ? this.id(r.id_member) : null,
        authorName: this.e(r.poster_name),
        createdAt: this.ms(r.poster_time) ?? Date.now(),
        views: this.n(r.num_views),
        pinned: this.n(r.is_sticky) > 0,
        locked: this.n(r.locked) > 0,
        approved: r.approved === null || this.n(r.approved) === 1,
        deleted: false,
      };
    }
  }

  *posts(): Iterable<SrcPost> {
    for (const r of this.stage.scan(this.t('messages'))) {
      const edited = this.ms(r.modified_time);
      yield {
        id: this.id(r.id_msg),
        topicId: this.id(r.id_topic),
        userId: this.n(r.id_member) > 0 ? this.id(r.id_member) : null,
        authorName: this.e(r.poster_name),
        createdAt: this.ms(r.poster_time) ?? Date.now(),
        ip: this.ip(r.poster_ip),
        body: smfToBBCode(this.s(r.body)),
        approved: r.approved === undefined || r.approved === null || this.n(r.approved) === 1,
        deleted: false,
        editedAt: edited,
        editReason: r.modified_reason !== undefined ? this.e(r.modified_reason) || null : null,
      };
    }
  }

  private attachStmt: Stmt | null = null;

  attachments(postId: string): SrcAttachment[] {
    if (!this.has('attachments')) return [];
    if (!this.attachStmt) {
      this.stage.index(this.t('attachments'), 'id_msg');
      this.attachStmt = this.stage.db.prepare(
        `SELECT a.id_attach, a.filename, a.size, a.width, a.mime_type, m.id_topic FROM ${this.tq('attachments', 'a')} LEFT JOIN ${this.tq('messages', 'm')} ON m.id_msg = a.id_msg WHERE a.id_msg = ? AND a.attachment_type = 0 ORDER BY a.id_attach`,
      );
    }
    return this.attachStmt.all(Number(postId)).map((r) => {
      const id = this.id(r.id_attach);
      const name = this.e(r.filename);
      const url = this.is21
        ? this.url(`index.php?action=dlattach;attach=${id}`)
        : this.url(`index.php?action=dlattach;topic=${this.id(r.id_topic)}.0;attach=${id}`);
      return { id, postId, name, url: url ?? '', isImage: this.n(r.width) > 0 || isImageName(name, this.s(r.mime_type)), size: this.n(r.size) };
    });
  }

  *polls(): Iterable<SrcPoll> {
    if (!this.has('polls')) return;
    const choices = this.stage.db.prepare(`SELECT id_choice, label, votes FROM ${this.tq('poll_choices')} WHERE id_poll = ? ORDER BY id_choice`);
    const votes = this.has('log_polls') ? this.stage.db.prepare(`SELECT id_member, id_choice FROM ${this.tq('log_polls')} WHERE id_poll = ? AND id_member > 0`) : null;
    this.stage.index(this.t('poll_choices'), 'id_poll');
    this.stage.index(this.t('log_polls'), 'id_poll');
    const rows = this.stage.all(
      `SELECT t.id_topic, t.id_first_msg, p.* FROM ${this.tq('topics', 't')} JOIN ${this.tq('polls', 'p')} ON p.id_poll = t.id_poll WHERE t.id_poll > 0`,
    );
    for (const r of rows) {
      const pid = this.n(r.id_poll);
      yield {
        topicId: this.id(r.id_topic),
        question: this.e(r.question),
        maxChoices: Math.max(1, this.n(r.max_votes)),
        allowChange: this.n(r.change_vote) > 0,
        closesAt: this.ms(r.expire_time),
        createdAt: Date.now(),
        options: choices.all(pid).map((c) => ({ id: this.id(c.id_choice), label: this.e(c.label), votes: this.n(c.votes) })),
        votes: (votes?.all(pid) ?? []).map((v) => ({ userId: this.id(v.id_member), optionId: this.id(v.id_choice) })),
      };
    }
  }

  *conversations(): Iterable<SrcConversation> {
    if (!this.has('personal_messages')) return;
    this.stage.index(this.t('personal_messages'), 'id_pm_head');
    this.stage.index(this.t('pm_recipients'), 'id_pm');
    const messages = this.stage.db.prepare(`SELECT * FROM ${this.tq('personal_messages')} WHERE id_pm_head = ? OR id_pm = ? ORDER BY id_pm`);
    const recipients = this.stage.db.prepare(`SELECT id_member FROM ${this.tq('pm_recipients')} WHERE id_pm = ?`);
    for (const head of this.stage.scan(this.t('personal_messages'), 'id_pm, id_pm_head', 'id_pm = id_pm_head OR id_pm_head = 0')) {
      const id = this.n(head.id_pm);
      const rows = messages.all(id, id);
      if (!rows.length) continue;
      const participants = new Set<string>();
      for (const m of rows) {
        if (this.n(m.id_member_from) > 0) participants.add(this.id(m.id_member_from));
        for (const rc of recipients.all(this.n(m.id_pm))) participants.add(this.id(rc.id_member));
      }
      yield {
        id: String(id),
        title: this.e(rows[0]!.subject),
        participants: [...participants],
        messages: rows.map((m) => ({
          userId: this.n(m.id_member_from) > 0 ? this.id(m.id_member_from) : null,
          authorName: this.e(m.from_name),
          createdAt: this.ms(m.msgtime) ?? Date.now(),
          body: smfToBBCode(this.s(m.body)),
        })),
      };
    }
  }

  bans(): SrcBan[] {
    if (!this.has('ban_items') || !this.has('ban_groups')) return [];
    const out: SrcBan[] = [];
    const now = Date.now();
    const rows = this.stage.all(
      `SELECT i.*, g.expire_time, g.reason FROM ${this.tq('ban_items', 'i')} JOIN ${this.tq('ban_groups', 'g')} ON g.id_ban_group = i.id_ban_group WHERE i.id_member = 0 OR i.id_member IS NULL`,
    );
    for (const r of rows) {
      const expiresAt = this.ms(r.expire_time);
      if (expiresAt && expiresAt < now) continue;
      const email = this.s(r.email_address).trim();
      if (email) out.push({ kind: 'email', value: email.replace(/%/g, '*'), reason: this.e(r.reason), expiresAt });
      let ip: string | null = null;
      if (r.ip_low1 !== undefined) {
        const lo = [r.ip_low1, r.ip_low2, r.ip_low3, r.ip_low4].map((x) => this.n(x));
        const hi = [r.ip_high1, r.ip_high2, r.ip_high3, r.ip_high4].map((x) => this.n(x));
        if (lo.some((x) => x > 0)) ip = lo.map((x, i) => (x === hi[i] ? String(x) : '*')).join('.');
      } else if (r.ip_low !== undefined && r.ip_low !== null) {
        const lo = this.ip(r.ip_low);
        const hi = this.ip(r.ip_high);
        if (lo && lo === hi) ip = lo;
      }
      if (ip) out.push({ kind: 'ip', value: ip, reason: this.e(r.reason), expiresAt });
    }
    return out;
  }
}
