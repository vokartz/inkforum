/**
 * MyBB 1.8 okuyucusu.
 */
import { legacyHash } from '../../security/legacy-password.js';
import { mybbToBBCode } from '../convert.js';
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
import { BaseReader, baseFrom, isImageName } from './base.js';

const STAFF_GIDS = new Set(['3', '4', '6']);

export class MybbReader extends BaseReader implements SourceReader {
  readonly platform = 'mybb' as const;
  private settingsCache: Map<string, string> | null = null;

  private setting(key: string): string {
    if (!this.settingsCache) this.settingsCache = new Map(this.stage.rows(this.t('settings')).map((r) => [this.s(r.name), this.s(r.value)]));
    return this.settingsCache.get(key) ?? '';
  }

  version(): string {
    const cache = this.stage.rows(this.t('datacache'), "WHERE title = 'version'")[0];
    return (cache && /"version";s:\d+:"([^"]+)"/.exec(this.s(cache.cache))?.[1]) || '1.8';
  }

  counts(): SourceCounts {
    return {
      users: this.count('users'),
      groups: this.count('usergroups') + this.count('usertitles'),
      categories: this.count('forums', "type = 'c'"),
      boards: this.count('forums', "type <> 'c'"),
      topics: this.count('threads', "closed NOT LIKE 'moved|%'"),
      posts: this.count('posts'),
      polls: this.count('polls'),
      conversations: this.count('privatemessages', 'uid = toid'),
      attachments: this.count('attachments', 'pid > 0'),
    };
  }

  samples(): SqlValue[] {
    return [
      ...this.stage.all(`SELECT username AS v FROM ${this.tq('users')} ORDER BY postnum DESC LIMIT 8`).map((r) => r.v!),
      ...this.stage.all(`SELECT subject AS v FROM ${this.tq('threads')} ORDER BY tid DESC LIMIT 12`).map((r) => r.v!),
    ];
  }

  guessBaseUrl(): string | null {
    return baseFrom(this.setting('bburl'), /\/$/);
  }

  groups(): SrcGroup[] {
    const out: SrcGroup[] = [];
    for (const r of this.stage.rows(this.t('usergroups'), 'ORDER BY gid')) {
      const id = this.id(r.gid);
      const role: SrcGroup['role'] =
        id === '1' ? 'guest' : id === '2' || id === '5' || this.n(r.isbannedgroup) === 1 ? 'member' : this.n(r.cancp) === 1 ? 'admin' : this.n(r.issupermod) === 1 ? 'global_moderator' : id === '6' ? 'moderator' : 'custom';
      const color = /color:\s*([^;"'>]+)/i.exec(this.s(r.namestyle))?.[1]?.trim() ?? null;
      const image = this.s(r.image) || this.s(r.starimage);
      out.push({
        id,
        name: this.s(r.title),
        description: this.s(r.description),
        color,
        iconUrl: image ? this.url(image.replace('{theme}', 'images')) : null,
        iconCount: this.s(r.image) ? 1 : Math.max(1, Math.min(10, this.n(r.stars) || 1)),
        role,
        minPosts: null,
        hidden: false,
      });
    }
    for (const r of this.stage.rows(this.t('usertitles'), 'ORDER BY posts')) {
      const star = this.s(r.starimage);
      out.push({
        id: `title:${this.id(r.utid)}`,
        name: this.s(r.title),
        description: '',
        color: null,
        iconUrl: star ? this.url(star.replace('{theme}', 'images')) : null,
        iconCount: Math.max(1, Math.min(10, this.n(r.stars) || 1)),
        role: 'custom',
        minPosts: this.n(r.posts),
        hidden: false,
      });
    }
    return out;
  }

  *users(): Iterable<SrcUser> {
    const bans = new Map<string, { until: number; reason: string }>();
    const now = Date.now();
    for (const r of this.stage.rows(this.t('banned'))) {
      const until = this.ms(r.lifted) ?? 0;
      if (!until || until > now) bans.set(this.id(r.uid), { until, reason: this.s(r.reason) });
    }
    const fields = new Map<string, StageRow>();
    for (const r of this.stage.rows(this.t('userfields'))) fields.set(this.id(r.ufid), r);
    for (const r of this.stage.scan(this.t('users'))) {
      const id = this.id(r.uid);
      const hash = this.s(r.password);
      const salt = this.s(r.salt);
      const avatar = this.s(r.avatar).replace(/\?.*$/, '');
      const bday = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(this.s(r.birthday));
      const ban = bans.get(id);
      yield {
        id,
        username: this.s(r.username),
        displayName: this.s(r.username),
        email: this.s(r.email).trim(),
        passwordHash: /^[0-9a-f]{32}$/i.test(hash) ? legacyHash.md5salt(salt, hash) : hash.startsWith('$') ? hash : '',
        registeredAt: this.ms(r.regdate) ?? Date.now(),
        lastActiveAt: this.ms(r.lastactive),
        ip: this.ip(r.lastip) ?? this.ip(r.regip),
        postCount: this.n(r.postnum),
        primaryGroup: this.id(r.usergroup),
        groups: this.csv(r.additionalgroups),
        customTitle: this.s(r.usertitle) || null,
        signature: mybbToBBCode(this.s(r.signature)),
        avatarUrl: avatar ? this.url(avatar) : null,
        birthdate: bday ? `${bday[3]}-${bday[2]!.padStart(2, '0')}-${bday[1]!.padStart(2, '0')}` : null,
        location: this.s(fields.get(id)?.fid1),
        website: this.s(r.website).trim(),
        status: this.id(r.usergroup) === '5' ? 'pending_email' : 'active',
        bannedUntil: ban ? ban.until : null,
        banReason: ban?.reason,
      };
    }
  }

  private forums(): StageRow[] {
    return this.stage.rows(this.t('forums'), 'ORDER BY disporder, fid');
  }

  categories(): SrcCategory[] {
    const out: SrcCategory[] = this.forums()
      .filter((r) => this.s(r.type) === 'c')
      .map((r) => ({ id: this.id(r.fid), name: this.s(r.name), description: this.s(r.description), order: this.n(r.disporder) }));
    if (this.forums().some((r) => this.s(r.type) !== 'c' && this.n(r.pid) === 0)) out.unshift({ id: 'root', name: 'Forum', description: '', order: -1 });
    return out;
  }

  boards(): SrcBoard[] {
    const rows = this.forums();
    const byId = new Map(rows.map((r) => [this.id(r.fid), r]));
    const groupView = new Map(this.stage.rows(this.t('usergroups')).map((r) => [this.id(r.gid), this.n(r.canview) === 1 && this.n(r.canviewthreads) !== 0]));
    const perms = new Map<string, boolean>();
    for (const r of this.stage.rows(this.t('forumpermissions'))) perms.set(`${this.id(r.fid)}:${this.id(r.gid)}`, this.n(r.canview) === 1 && this.n(r.canviewthreads) !== 0);
    const canView = (forum: StageRow, gid: string): boolean => {
      const chain = this.s(forum.parentlist).split(',').filter(Boolean).reverse();
      for (const fid of chain) {
        const v = perms.get(`${fid}:${gid}`);
        if (v !== undefined) return v;
      }
      return groupView.get(gid) ?? false;
    };
    const out: SrcBoard[] = [];
    for (const r of rows) {
      if (this.s(r.type) === 'c') continue;
      const chain = this.s(r.parentlist).split(',').filter(Boolean);
      const top = byId.get(chain[0] ?? '');
      const categoryId = top && this.s(top.type) === 'c' ? this.id(top.fid) : 'root';
      const parent = byId.get(this.id(r.pid));
      let access: SrcAccess;
      if (this.n(r.active) === 0 || this.s(r.password)) access = { kind: 'staff' };
      else if (canView(r, '1')) access = { kind: 'public' };
      else if (canView(r, '2')) access = { kind: 'members' };
      else {
        const custom = [...groupView.keys()].filter((g) => !['1', '2', '5', '7'].includes(g) && !STAFF_GIDS.has(g) && canView(r, g));
        access = custom.length ? { kind: 'groups', groups: custom } : { kind: 'staff' };
      }
      out.push({
        id: this.id(r.fid),
        categoryId,
        parentId: parent && this.s(parent.type) !== 'c' ? this.id(parent.fid) : null,
        name: this.s(r.name),
        description: this.s(r.description),
        order: this.n(r.disporder),
        redirectUrl: this.s(r.linkto).trim() || null,
        access,
        countPosts: r.usepostcounts === undefined || this.n(r.usepostcounts) === 1,
      });
    }
    return out;
  }

  moderators(): SrcModerator[] {
    return this.stage.rows(this.t('moderators')).map((r) =>
      this.n(r.isgroup) === 1 ? { boardId: this.id(r.fid), groupId: this.id(r.id) } : { boardId: this.id(r.fid), userId: this.id(r.id) },
    );
  }

  *topics(): Iterable<SrcTopic> {
    for (const r of this.stage.scan(this.t('threads'), '*', "closed NOT LIKE 'moved|%'")) {
      const vis = this.n(r.visible);
      yield {
        id: this.id(r.tid),
        boardId: this.id(r.fid),
        title: this.s(r.subject) || '—',
        userId: this.n(r.uid) > 0 ? this.id(r.uid) : null,
        authorName: this.s(r.username),
        createdAt: this.ms(r.dateline) ?? Date.now(),
        views: this.n(r.views),
        pinned: this.n(r.sticky) === 1,
        locked: this.s(r.closed) === '1',
        approved: vis !== 0,
        deleted: vis === -1,
      };
    }
  }

  *posts(): Iterable<SrcPost> {
    for (const r of this.stage.scan(this.t('posts'))) {
      const vis = this.n(r.visible);
      yield {
        id: this.id(r.pid),
        topicId: this.id(r.tid),
        userId: this.n(r.uid) > 0 ? this.id(r.uid) : null,
        authorName: this.s(r.username),
        createdAt: this.ms(r.dateline) ?? Date.now(),
        ip: this.ip(r.ipaddress),
        body: mybbToBBCode(this.s(r.message)),
        approved: vis !== 0,
        deleted: vis === -1,
        editedAt: this.ms(r.edittime),
        editReason: r.editreason !== undefined ? this.s(r.editreason) || null : null,
      };
    }
  }

  private attachStmt: Stmt | null = null;

  attachments(postId: string): SrcAttachment[] {
    if (!this.has('attachments')) return [];
    if (!this.attachStmt) {
      this.stage.index(this.t('attachments'), 'pid');
      this.attachStmt = this.stage.db.prepare(`SELECT aid, filename, filetype, filesize FROM ${this.tq('attachments')} WHERE pid = ? ORDER BY aid`);
    }
    return this.attachStmt.all(Number(postId)).map((r) => {
      const name = this.s(r.filename);
      return { id: this.id(r.aid), postId, name, url: this.url(`attachment.php?aid=${this.id(r.aid)}`) ?? '', isImage: isImageName(name, this.s(r.filetype)), size: this.n(r.filesize) };
    });
  }

  *polls(): Iterable<SrcPoll> {
    if (!this.has('polls')) return;
    this.stage.index(this.t('pollvotes'), 'pid');
    const votes = this.has('pollvotes') ? this.stage.db.prepare(`SELECT uid, voteoption FROM ${this.tq('pollvotes')} WHERE pid = ? AND uid > 0`) : null;
    for (const r of this.stage.scan(this.t('polls'))) {
      const labels = this.s(r.options).split('||~|~||');
      const counts = this.s(r.votes).split('||~|~||');
      const created = this.ms(r.dateline) ?? Date.now();
      const days = this.n(r.timeout);
      yield {
        topicId: this.id(r.tid),
        question: this.s(r.question),
        maxChoices: this.n(r.multiple) === 1 ? Math.max(this.n(r.maxoptions), labels.length) || labels.length : 1,
        allowChange: false,
        closesAt: days > 0 ? created + days * 86_400_000 : null,
        createdAt: created,
        options: labels.map((label, i) => ({ id: String(i + 1), label, votes: Number(counts[i]) || 0 })),
        votes: (votes?.all(this.n(r.pid)) ?? []).map((v) => ({ userId: this.id(v.uid), optionId: this.id(v.voteoption) })),
      };
    }
  }

  /** MyBB her kutu için ayrı kopya tutar; alınan kopyalar katılımcı çifti + konu başlığına göre birleştirilir */
  *conversations(): Iterable<SrcConversation> {
    if (!this.has('privatemessages')) return;
    const threads = new Map<string, SrcConversation>();
    for (const r of this.stage.scan(this.t('privatemessages'), '*', 'uid = toid AND fromid > 0')) {
      const from = this.id(r.fromid);
      const to = this.id(r.toid);
      const title = this.s(r.subject).replace(/^((re|fw|fwd|ynt|ileti)\s*:\s*)+/i, '').trim();
      const key = `${[from, to].sort().join('-')}|${title.toLowerCase()}`;
      let conv = threads.get(key);
      if (!conv) threads.set(key, (conv = { id: this.id(r.pmid), title, participants: [from, to], messages: [] }));
      conv.messages.push({ userId: from, authorName: '', createdAt: this.ms(r.dateline) ?? Date.now(), body: mybbToBBCode(this.s(r.message)) });
    }
    for (const conv of threads.values()) {
      conv.messages.sort((a, b) => a.createdAt - b.createdAt);
      yield conv;
    }
  }

  bans(): SrcBan[] {
    const out: SrcBan[] = [];
    for (const r of this.stage.rows(this.t('banfilters'))) {
      const type = this.n(r.type);
      const value = this.s(r.filter).trim();
      if (!value) continue;
      if (type === 1) out.push({ kind: 'ip', value, reason: '', expiresAt: null });
      if (type === 3) out.push({ kind: 'email', value, reason: '', expiresAt: null });
    }
    return out;
  }
}
