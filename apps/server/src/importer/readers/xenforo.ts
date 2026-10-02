/**
 * XenForo 2.x okuyucusu (1.5 veritabanları da büyük ölçüde aynı tablolara sahiptir). Mesajlar BBCode olarak
 * saklanır; forum ağacı xf_node, şifreler xf_user_authenticate tablosundadır.
 */
import { createHash } from 'node:crypto';
import { legacyHash } from '../../security/legacy-password.js';
import { xenforoToBBCode } from '../convert.js';
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
import { BaseReader, baseFrom } from './base.js';

/** XenForo varsayılan grupları: 1 misafir, 2 kayıtlı, 3 yönetici, 4 moderatör */
const GUEST = '1';
const REGISTERED = '2';
const ADMIN = '3';
const MODERATOR = '4';

/** Forum dışı düğümler (sayfa, arama forumu) aktarılmaz */
const BOARD_TYPES = new Set(['Forum', 'LinkForum', 'Category']);

/** Root kategorisi olmayan forumlar için yapay kategori */
const ROOT_CATEGORY = 'xf-root';

/** PHP serialize / JSON kimlik doğrulama verisinden bir alanı okur */
export function xfAuthField(data: string, key: string): string {
  const json = /^\s*\{/.test(data) ? (() => {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return null;
    }
  })() : null;
  if (json) return typeof json[key] === 'string' ? (json[key] as string) : '';
  const m = new RegExp(`s:\\d+:"${key}";s:\\d+:"([^"]*)"`).exec(data);
  return m?.[1] ?? '';
}

/** xf_user_authenticate satırı → users.password_hash biçimi ('' = şifre sıfırlama gerekir) */
export function xfPasswordHash(scheme: string, data: string): string {
  const hash = xfAuthField(data, 'hash');
  if (!hash) return '';
  switch (scheme) {
    case 'XF:Core12':
    case 'XenForo_Authentication_Core12':
      return /^\$2[abxy]\$/.test(hash) ? hash : '';
    case 'XF:Core':
    case 'XenForo_Authentication_Core': {
      const salt = xfAuthField(data, 'salt');
      const fn = xfAuthField(data, 'hashFunc') === 'sha1' ? 'sha1' : 'sha256';
      return salt && /^[0-9a-f]{40,64}$/i.test(hash) ? legacyHash.xfcore(salt, hash, fn) : '';
    }
    // Daha önce başka forumdan XenForo'ya aktarılmış ve hiç giriş yapmamış üyeler
    case 'XF:PhpBb3':
      return legacyHash.phpbb(hash);
    case 'XF:MyBb': {
      const salt = xfAuthField(data, 'salt');
      return salt ? legacyHash.md5salt(salt, hash) : '';
    }
    case 'XF:IPBoard': {
      const salt = xfAuthField(data, 'salt');
      return salt ? legacyHash.ipsmd5(salt, hash) : '';
    }
    default:
      return /^\$2[abxy]\$/.test(hash) ? hash : '';
  }
}

export class XenforoReader extends BaseReader implements SourceReader {
  readonly platform = 'xenforo' as const;
  private optionsCache: Map<string, string> | null = null;
  private nodesCache: StageRow[] | null = null;

  private option(key: string): string {
    if (!this.optionsCache) this.optionsCache = new Map(this.stage.rows(this.t('option')).map((r) => [this.s(r.option_id), this.s(r.option_value)]));
    return this.optionsCache.get(key) ?? '';
  }

  version(): string {
    if (!this.has('addon')) return '2.x';
    const row = this.stage.rows(this.t('addon'), "WHERE addon_id = 'XF'")[0];
    return row ? this.s(row.version_string) || '2.x' : '2.x';
  }

  counts(): SourceCounts {
    const nodes = this.nodes();
    const roots = nodes.filter((r) => this.s(r.node_type_id) === 'Category' && this.n(r.parent_node_id) === 0).length;
    return {
      users: this.count('user'),
      groups: this.count('user_group') + (this.has('user_title_ladder') ? this.count('user_title_ladder') : 0),
      categories: roots,
      boards: nodes.length - roots,
      topics: this.count('thread', "discussion_type <> 'redirect'"),
      posts: this.count('post'),
      polls: this.has('poll') ? this.count('poll', "content_type = 'thread'") : 0,
      conversations: this.has('conversation_master') ? this.count('conversation_master') : 0,
      attachments: this.has('attachment') ? this.count('attachment', "content_type = 'post'") : 0,
    };
  }

  samples(): SqlValue[] {
    return [
      ...this.stage.all(`SELECT username AS v FROM ${this.tq('user')} ORDER BY message_count DESC LIMIT 8`).map((r) => r.v!),
      ...this.stage.all(`SELECT title AS v FROM ${this.tq('thread')} ORDER BY thread_id DESC LIMIT 12`).map((r) => r.v!),
    ];
  }

  guessBaseUrl(): string | null {
    return baseFrom(this.option('boardUrl'), /\/$/);
  }

  // ---------- Gruplar ve üyeler ----------

  groups(): SrcGroup[] {
    const out: SrcGroup[] = [];
    for (const r of this.stage.rows(this.t('user_group'), 'ORDER BY user_group_id')) {
      const id = this.id(r.user_group_id);
      const css = this.s(r.username_css);
      out.push({
        id,
        name: this.s(r.title) || `Group ${id}`,
        description: '',
        color: /(?:^|;|\s)color:\s*([^;!]+)/i.exec(css)?.[1]?.trim() ?? null,
        iconUrl: null,
        iconCount: 1,
        role: id === GUEST ? 'guest' : id === REGISTERED ? 'member' : id === ADMIN ? 'admin' : id === MODERATOR ? 'global_moderator' : 'custom',
        minPosts: null,
        hidden: false,
      });
    }
    // Kullanıcı unvanı merdiveni (varsayılan ölçüt mesaj sayısı)
    if (this.has('user_title_ladder')) {
      for (const r of this.stage.rows(this.t('user_title_ladder'), 'ORDER BY minimum_level')) {
        const level = this.n(r.minimum_level);
        out.push({ id: `rank:${level}`, name: this.s(r.title) || `Rank ${level}`, description: '', color: null, iconUrl: null, iconCount: 1, role: 'custom', minPosts: level, hidden: false });
      }
    }
    return out;
  }

  *users(): Iterable<SrcUser> {
    const auth = new Map<string, string>();
    if (this.has('user_authenticate')) {
      for (const r of this.stage.scan(this.t('user_authenticate'))) auth.set(this.id(r.user_id), xfPasswordHash(this.s(r.scheme_class), this.s(r.data)));
    }
    const profile = this.has('user_profile') ? this.stage.db.prepare(`SELECT * FROM ${this.tq('user_profile')} WHERE user_id = ?`) : null;
    if (profile) this.stage.index(this.t('user_profile'), 'user_id');
    const bans = new Map<string, StageRow>();
    if (this.has('user_ban')) for (const r of this.stage.rows(this.t('user_ban'))) bans.set(this.id(r.user_id), r);
    const regIp = new Map<string, string>();
    if (this.has('ip')) {
      for (const r of this.stage.scan(this.t('ip'), 'user_id, ip', "content_type = 'user' AND action = 'register'")) {
        const ip = this.ip(r.ip);
        if (ip) regIp.set(this.id(r.user_id), ip);
      }
    }
    const now = Date.now();
    for (const r of this.stage.scan(this.t('user'))) {
      const id = this.id(r.user_id);
      const p = profile?.get(Number(id));
      const [d, m, y] = p ? [this.n(p.dob_day), this.n(p.dob_month), this.n(p.dob_year)] : [0, 0, 0];
      const ban = bans.get(id);
      const banEnd = ban ? this.n(ban.end_date) : -1;
      const state = this.s(r.user_state);
      const email = this.s(r.email).trim();
      const avatarDate = this.n(r.avatar_date);
      const gravatar = this.s(r.gravatar).trim();
      yield {
        id,
        username: this.s(r.username),
        displayName: this.s(r.username),
        email,
        passwordHash: auth.get(id) ?? '',
        registeredAt: this.ms(r.register_date) ?? now,
        lastActiveAt: this.ms(r.last_activity),
        ip: regIp.get(id) ?? null,
        postCount: this.n(r.message_count),
        primaryGroup: this.id(r.user_group_id),
        groups: this.csv(r.secondary_group_ids),
        customTitle: this.s(r.custom_title) || null,
        signature: p ? xenforoToBBCode(this.s(p.signature)) : '',
        avatarUrl:
          avatarDate > 0
            ? this.url(`data/avatars/l/${Math.floor(Number(id) / 1000)}/${id}.jpg?${avatarDate}`)
            : gravatar
              ? `https://www.gravatar.com/avatar/${createHash('md5').update(gravatar.toLowerCase()).digest('hex')}?s=384`
              : null,
        birthdate: y > 1900 && m > 0 && d > 0 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null,
        location: p ? this.s(p.location) : '',
        website: p ? this.s(p.website) : '',
        status: state === 'email_confirm' || state === 'email_confirm_edit' ? 'pending_email' : state === 'moderated' ? 'pending_approval' : 'active',
        bannedUntil: banEnd === 0 ? 0 : banEnd * 1000 > now ? banEnd * 1000 : null,
        banReason: ban ? this.s(ban.user_reason) : undefined,
      };
    }
  }

  // ---------- Forum ağacı ----------

  private nodes(): StageRow[] {
    if (!this.nodesCache) this.nodesCache = this.stage.rows(this.t('node'), 'ORDER BY lft, display_order, node_id').filter((r) => BOARD_TYPES.has(this.s(r.node_type_id)));
    return this.nodesCache;
  }

  private isRootCategory(r: StageRow): boolean {
    return this.s(r.node_type_id) === 'Category' && this.n(r.parent_node_id) === 0;
  }

  categories(): SrcCategory[] {
    const out: SrcCategory[] = this.nodes()
      .filter((r) => this.isRootCategory(r))
      .map((r) => ({ id: this.id(r.node_id), name: this.s(r.title) || `Category ${this.id(r.node_id)}`, description: this.s(r.description).replace(/<[^>]+>/g, '').trim(), order: this.n(r.display_order) }));
    if (this.nodes().some((r) => this.n(r.parent_node_id) === 0 && !this.isRootCategory(r))) out.unshift({ id: ROOT_CATEGORY, name: 'Forum', description: '', order: -1 });
    return out;
  }

  /** Görüntüleme izinleri: grup başına, kökten düğüme doğru miras alınan viewNode değeri */
  private accessFor(): (nodeId: string) => SrcAccess {
    const entries = new Map<string, Map<string, string>>();
    if (this.has('permission_entry_content')) {
      for (const r of this.stage.rows(this.t('permission_entry_content'), "WHERE content_type = 'node' AND permission_id = 'viewNode' AND user_group_id > 0")) {
        const node = this.id(r.content_id);
        if (!entries.has(node)) entries.set(node, new Map());
        entries.get(node)!.set(this.id(r.user_group_id), this.s(r.permission_value));
      }
    }
    const byId = new Map(this.stage.rows(this.t('node')).map((r) => [this.id(r.node_id), r]));
    const staff = new Set([ADMIN, MODERATOR]);
    return (nodeId) => {
      const chain: string[] = [];
      for (let id: string | undefined = nodeId; id && id !== '0' && chain.length < 50; id = byId.has(id) ? this.id(byId.get(id)!.parent_node_id) : undefined) chain.unshift(id);
      // Her grup için kökten yaprağa: reset/deny gizler, content_allow açar
      const allowed = new Map<string, boolean>();
      const groupsSeen = new Set<string>([GUEST, REGISTERED]);
      for (const id of chain) for (const g of entries.get(id)?.keys() ?? []) groupsSeen.add(g);
      for (const g of groupsSeen) {
        let ok = true;
        for (const id of chain) {
          const v = entries.get(id)?.get(g);
          if (v === 'reset' || v === 'deny') ok = false;
          else if (v === 'content_allow') ok = true;
        }
        allowed.set(g, ok);
      }
      if (allowed.get(GUEST)) return { kind: 'public' };
      if (allowed.get(REGISTERED)) return { kind: 'members' };
      const custom = [...allowed].filter(([g, ok]) => ok && !staff.has(g) && g !== GUEST && g !== REGISTERED).map(([g]) => g);
      return custom.length ? { kind: 'groups', groups: custom } : { kind: 'staff' };
    };
  }

  boards(): SrcBoard[] {
    const nodes = this.nodes();
    const byId = new Map(nodes.map((r) => [this.id(r.node_id), r]));
    const links = new Map<string, string>();
    if (this.has('link_forum')) for (const r of this.stage.rows(this.t('link_forum'))) links.set(this.id(r.node_id), this.s(r.link_url).trim());
    const counts = new Map<string, boolean>();
    if (this.has('forum') && this.col('forum', 'count_messages')) for (const r of this.stage.rows(this.t('forum'))) counts.set(this.id(r.node_id), this.n(r.count_messages) !== 0);
    const access = this.accessFor();
    const out: SrcBoard[] = [];
    for (const r of nodes) {
      if (this.isRootCategory(r)) continue;
      const id = this.id(r.node_id);
      // Üst düğüm: kök kategori değilse bölüm; kategori kökü yukarı doğru aranır
      let parent = byId.get(this.id(r.parent_node_id));
      const parentId = parent && !this.isRootCategory(parent) ? this.id(parent.node_id) : null;
      let categoryId = ROOT_CATEGORY;
      while (parent) {
        if (this.isRootCategory(parent)) {
          categoryId = this.id(parent.node_id);
          break;
        }
        parent = byId.get(this.id(parent.parent_node_id));
      }
      out.push({
        id,
        categoryId,
        parentId,
        name: this.s(r.title) || `Forum ${id}`,
        description: this.s(r.description).replace(/<[^>]+>/g, '').trim(),
        order: this.n(r.display_order),
        redirectUrl: this.s(r.node_type_id) === 'LinkForum' ? links.get(id) || null : null,
        access: access(id),
        countPosts: counts.get(id) ?? true,
      });
    }
    return out;
  }

  moderators(): SrcModerator[] {
    if (!this.has('moderator_content')) return [];
    return this.stage.rows(this.t('moderator_content'), "WHERE content_type = 'node'").map((r) => ({ boardId: this.id(r.content_id), userId: this.id(r.user_id) }));
  }

  // ---------- Konular ve mesajlar ----------

  *topics(): Iterable<SrcTopic> {
    for (const r of this.stage.scan(this.t('thread'), '*', "discussion_type <> 'redirect'")) {
      const state = this.s(r.discussion_state);
      yield {
        id: this.id(r.thread_id),
        boardId: this.id(r.node_id),
        title: this.s(r.title) || '—',
        userId: this.n(r.user_id) > 0 ? this.id(r.user_id) : null,
        authorName: this.s(r.username),
        createdAt: this.ms(r.post_date) ?? Date.now(),
        views: this.n(r.view_count),
        pinned: this.n(r.sticky) === 1,
        locked: this.n(r.discussion_open) === 0,
        approved: state !== 'moderated',
        deleted: state === 'deleted',
      };
    }
  }

  private ipStmt: Stmt | null | undefined;

  private postIp(ipId: number): string | null {
    if (this.ipStmt === undefined) {
      this.ipStmt = this.has('ip') ? this.stage.db.prepare(`SELECT ip FROM ${this.tq('ip')} WHERE ip_id = ?`) : null;
      if (this.ipStmt) this.stage.index(this.t('ip'), 'ip_id');
    }
    if (!this.ipStmt || !ipId) return null;
    const row = this.ipStmt.get(ipId);
    return row ? this.ip(row.ip) : null;
  }

  *posts(): Iterable<SrcPost> {
    for (const r of this.stage.scan(this.t('post'))) {
      const state = this.s(r.message_state);
      yield {
        id: this.id(r.post_id),
        topicId: this.id(r.thread_id),
        userId: this.n(r.user_id) > 0 ? this.id(r.user_id) : null,
        authorName: this.s(r.username),
        createdAt: this.ms(r.post_date) ?? Date.now(),
        ip: this.postIp(this.n(r.ip_id)),
        body: xenforoToBBCode(this.s(r.message)),
        approved: state !== 'moderated',
        deleted: state === 'deleted',
        editedAt: this.ms(r.last_edit_date),
        editReason: null,
      };
    }
  }

  private attachStmt: Stmt | null = null;

  attachments(postId: string): SrcAttachment[] {
    if (!this.has('attachment') || !this.has('attachment_data')) return [];
    if (!this.attachStmt) {
      this.stage.index(this.t('attachment'), 'content_id');
      this.stage.index(this.t('attachment_data'), 'data_id');
      this.attachStmt = this.stage.db.prepare(
        `SELECT a.attachment_id, d.filename, d.file_size, d.width FROM ${this.tq('attachment', 'a')} JOIN ${this.tq('attachment_data', 'd')} ON d.data_id = a.data_id WHERE a.content_type = 'post' AND a.content_id = ? ORDER BY a.attachment_id`,
      );
    }
    return this.attachStmt.all(Number(postId)).map((r) => {
      const id = this.id(r.attachment_id);
      const name = this.s(r.filename);
      return {
        id,
        postId,
        name,
        // Dosyalar internal_data altında saklanır; herkese açık adres yönlendiriciden geçer
        url: this.url(`index.php?attachments/${id}/`) ?? '',
        isImage: this.n(r.width) > 0,
        size: this.n(r.file_size),
      };
    });
  }

  *polls(): Iterable<SrcPoll> {
    if (!this.has('poll') || !this.has('poll_response')) return;
    this.stage.index(this.t('poll_response'), 'poll_id');
    const responses = this.stage.db.prepare(`SELECT poll_response_id, response, response_vote_count FROM ${this.tq('poll_response')} WHERE poll_id = ? ORDER BY poll_response_id`);
    const votes = this.has('poll_vote') ? this.stage.db.prepare(`SELECT user_id, poll_response_id FROM ${this.tq('poll_vote')} WHERE poll_id = ?`) : null;
    if (votes) this.stage.index(this.t('poll_vote'), 'poll_id');
    for (const r of this.stage.rows(this.t('poll'), "WHERE content_type = 'thread'")) {
      const pollId = this.n(r.poll_id);
      const options = responses.all(pollId).map((o) => ({ id: this.id(o.poll_response_id), label: this.s(o.response), votes: this.n(o.response_vote_count) }));
      if (!options.length) continue;
      const max = this.n(r.max_votes);
      yield {
        topicId: this.id(r.content_id),
        question: this.s(r.question),
        maxChoices: max > 0 ? Math.min(max, options.length) : options.length,
        allowChange: this.n(r.change_vote) === 1,
        closesAt: this.ms(r.close_date),
        createdAt: Date.now(),
        options,
        votes: (votes?.all(pollId) ?? []).filter((v) => this.n(v.user_id) > 0).map((v) => ({ userId: this.id(v.user_id), optionId: this.id(v.poll_response_id) })),
      };
    }
  }

  *conversations(): Iterable<SrcConversation> {
    if (!this.has('conversation_master') || !this.has('conversation_message')) return;
    this.stage.index(this.t('conversation_message'), 'conversation_id');
    const messages = this.stage.db.prepare(`SELECT * FROM ${this.tq('conversation_message')} WHERE conversation_id = ? ORDER BY message_date, message_id`);
    const recipients = this.has('conversation_recipient') ? this.stage.db.prepare(`SELECT user_id FROM ${this.tq('conversation_recipient')} WHERE conversation_id = ?`) : null;
    if (recipients) this.stage.index(this.t('conversation_recipient'), 'conversation_id');
    for (const c of this.stage.scan(this.t('conversation_master'))) {
      const id = this.n(c.conversation_id);
      const rows = messages.all(id);
      if (!rows.length) continue;
      const participants = new Set<string>([this.id(c.user_id)]);
      for (const u of recipients?.all(id) ?? []) participants.add(this.id(u.user_id));
      yield {
        id: String(id),
        title: this.s(c.title),
        participants: [...participants].filter((p) => p !== '0'),
        messages: rows.map((m) => ({
          userId: this.n(m.user_id) > 0 ? this.id(m.user_id) : null,
          authorName: this.s(m.username),
          createdAt: this.ms(m.message_date) ?? Date.now(),
          body: xenforoToBBCode(this.s(m.message)),
        })),
      };
    }
  }

  bans(): SrcBan[] {
    const out: SrcBan[] = [];
    if (this.has('ban_email')) for (const r of this.stage.rows(this.t('ban_email'))) out.push({ kind: 'email', value: this.s(r.banned_email).trim(), reason: this.s(r.reason), expiresAt: null });
    if (this.has('ip_match')) {
      for (const r of this.stage.rows(this.t('ip_match'), "WHERE match_type = 'banned'")) {
        const value = this.s(r.ip).trim();
        if (value) out.push({ kind: 'ip', value, reason: this.s(r.reason), expiresAt: this.ms(r.expiry_date) });
      }
    }
    return out.filter((b) => b.value);
  }
}
