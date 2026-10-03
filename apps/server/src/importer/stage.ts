import { openSqlite, type SqliteStatement, type SqlValue } from './sql-dump.js';
import type { Platform } from './model.js';

export type StageRow = Record<string, SqlValue>;

export class Stage {
  readonly db: ReturnType<typeof openSqlite>;
  private readonly columnCache = new Map<string, string[]>();
  private readonly tableSet: Set<string>;

  constructor(path: string) {
    this.db = openSqlite(path);
    const rows = this.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all();
    this.tableSet = new Set(rows.map((r) => String(r.name)));
  }

  close(): void {
    this.db.close();
  }

  tables(): string[] {
    return [...this.tableSet];
  }

  has(table: string): boolean {
    return this.tableSet.has(table);
  }

  columns(table: string): string[] {
    let cols = this.columnCache.get(table);
    if (!cols) {
      cols = this.has(table) ? this.db.prepare(`PRAGMA table_info(${q(table)})`).all().map((r) => String(r.name)) : ([] as string[]);
      this.columnCache.set(table, cols);
    }
    return cols;
  }

  hasColumn(table: string, column: string): boolean {
    return this.columns(table).includes(column);
  }

  count(table: string, where = ''): number {
    if (!this.has(table)) return 0;
    const r = this.db.prepare(`SELECT COUNT(*) AS n FROM ${q(table)}${where ? ` WHERE ${where}` : ''}`).get();
    return Number(r?.n ?? 0);
  }

  all(sql: string, ...params: SqlValue[]): StageRow[] {
    return this.db.prepare(sql).all(...params);
  }

  get(sql: string, ...params: SqlValue[]): StageRow | undefined {
    return this.db.prepare(sql).get(...params);
  }

  rows(table: string, rest = ''): StageRow[] {
    if (!this.has(table)) return [];
    return this.all(`SELECT * FROM ${q(table)} ${rest}`);
  }

  index(table: string, ...columns: string[]): void {
    if (!this.has(table) || !columns.every((c) => this.hasColumn(table, c))) return;
    const name = `ix_${table}_${columns.join('_')}`.replace(/[^\w]/g, '_');
    this.db.exec(`CREATE INDEX IF NOT EXISTS ${q(name)} ON ${q(table)} (${columns.map(q).join(', ')})`);
  }

  *scan(table: string, select = '*', where = '', pageSize = 2000): Generator<StageRow> {
    if (!this.has(table)) return;
    let last = 0;
    const stmt = this.db.prepare(
      `SELECT rowid AS __rid, ${select} FROM ${q(table)} WHERE rowid > ?${where ? ` AND (${where})` : ''} ORDER BY rowid LIMIT ${pageSize}`,
    );
    for (;;) {
      const page = stmt.all(last);
      if (!page.length) return;
      for (const r of page) yield r;
      last = Number(page[page.length - 1]!.__rid);
      if (page.length < pageSize) return;
    }
  }
}

export function* joinScan(stage: Stage, select: string, from: string, alias: string, where = '', pageSize = 2000): Generator<StageRow> {
  let last = 0;
  const stmt = stage.db.prepare(
    `SELECT ${alias}.rowid AS __rid, ${select} FROM ${from} WHERE ${alias}.rowid > ?${where ? ` AND (${where})` : ''} ORDER BY ${alias}.rowid LIMIT ${pageSize}`,
  );
  for (;;) {
    const page = stmt.all(last);
    if (!page.length) return;
    for (const r of page) yield r;
    last = Number(page[page.length - 1]!.__rid);
    if (page.length < pageSize) return;
  }
}

export const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

export const WANTED_SUFFIXES = [
  'members', 'membergroups', 'categories', 'boards', 'moderators', 'moderator_groups', 'topics', 'messages', 'polls', 'poll_choices',
  'log_polls', 'personal_messages', 'pm_recipients', 'attachments', 'settings', 'ban_groups', 'ban_items', 'custom_fields',
  'users', 'groups', 'user_group', 'ranks', 'forums', 'posts', 'poll_options', 'poll_votes', 'privmsgs', 'privmsgs_to', 'config', 'banlist',
  'acl_groups', 'acl_options', 'acl_roles', 'acl_roles_data', 'moderator_cache', 'profile_fields_data',
  'core_members', 'core_groups', 'core_sys_lang', 'core_sys_lang_words', 'forums_forums', 'forums_topics', 'forums_posts', 'core_polls',
  'core_voters', 'core_message_topics', 'core_message_posts', 'core_message_topic_user_map', 'core_attachments', 'core_attachments_map',
  'core_permission_index', 'core_moderators', 'core_admin_permission_rows', 'core_banfilters', 'core_member_ranks', 'core_sys_conf_settings',
  'core_applications', 'core_validating', 'core_pfields_content',
  'usergroups', 'usertitles', 'threads', 'pollvotes', 'privatemessages', 'datacache', 'forumpermissions', 'banned', 'userfields', 'banfilters',
  'xf_user', 'xf_user_group', 'xf_user_authenticate', 'xf_user_profile', 'xf_user_ban', 'xf_user_title_ladder', 'xf_node', 'xf_link_forum', 'xf_forum',
  'xf_thread', 'xf_post', 'xf_attachment', 'xf_attachment_data', 'xf_poll', 'xf_poll_response', 'xf_poll_vote', 'xf_conversation_master',
  'xf_conversation_message', 'xf_conversation_recipient', 'xf_moderator_content', 'xf_ban_email', 'xf_ip_match', 'xf_ip', 'xf_option', 'xf_addon',
  'xf_permission_entry_content',
];

const NEVER = /(search|session|captcha|_cache$|output_cache|wordlist|wordmatch|_log$|core_log|mail_queue|notifications|item_markers|follow)/i;

export function keepTable(table: string): boolean {
  if (NEVER.test(table) && !/moderator_cache$/.test(table)) return false;
  const t = table.toLowerCase();
  return WANTED_SUFFIXES.some((s) => t === s || t.endsWith(`_${s}`) || t.endsWith(s));
}

const IPS_WORD_KEYS = /^(forums_forum_\d+(_desc)?|core_group_\d+|core_member_rank_\d+)$/;

export function keepRow(table: string, value: (column: string) => SqlValue): boolean {
  if (table.endsWith('core_sys_lang_words')) {
    const key = value('word_key');
    return typeof key === 'string' && IPS_WORD_KEYS.test(key);
  }
  if (table.endsWith('datacache')) return value('title') === 'version';
  if (/xf_ip$/.test(table)) return value('content_type') === 'post' || (value('content_type') === 'user' && value('action') === 'register');
  if (/xf_option$/.test(table)) return value('option_id') === 'boardUrl' || value('option_id') === 'boardTitle';
  if (/xf_addon$/.test(table)) return value('addon_id') === 'XF';
  return true;
}

export interface Detection {
  platform: Platform;
  prefix: string;
}

export function detectPlatform(stage: Stage): Detection | null {
  const tables = stage.tables();
  const find = (suffix: string, cols: string[]) =>
    tables.find((t) => t.endsWith(suffix) && cols.every((c) => stage.hasColumn(t, c)));

  const ips = find('core_members', ['member_id', 'members_pass_hash']);
  if (ips) return { platform: 'ips', prefix: ips.slice(0, -'core_members'.length) };
  const smf = find('members', ['id_member', 'member_name', 'passwd']);
  if (smf) return { platform: 'smf', prefix: smf.slice(0, -'members'.length) };
  const phpbb = find('users', ['username_clean', 'user_password']);
  if (phpbb) return { platform: 'phpbb', prefix: phpbb.slice(0, -'users'.length) };
  const xf = find('user', ['user_id', 'user_state', 'secondary_group_ids']);
  if (xf) return { platform: 'xenforo', prefix: xf.slice(0, -'user'.length) };
  const mybb = find('users', ['uid', 'salt', 'loginkey']);
  if (mybb) return { platform: 'mybb', prefix: mybb.slice(0, -'users'.length) };
  return null;
}

export type Stmt = SqliteStatement;
