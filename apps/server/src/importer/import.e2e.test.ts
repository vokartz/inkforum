import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, loginAgent, type Agent, type Harness } from '../testing/harness.js';

// ---------- Sentetik döküm üretici (mysqldump biçimi) ----------

type Value = string | number | null | Buffer;
interface Table {
  name: string;
  columns: string[];
  rows: Value[][];
}

const lit = (v: Value): string => {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
};

function dump(tables: Table[]): string {
  const out = ['-- MySQL dump 10.13', '/*!40101 SET NAMES utf8mb4 */;', ''];
  for (const t of tables) {
    out.push(`DROP TABLE IF EXISTS \`${t.name}\`;`);
    out.push(`CREATE TABLE \`${t.name}\` (\n${t.columns.map((c) => `  \`${c}\` text`).join(',\n')},\n  PRIMARY KEY (\`${t.columns[0]}\`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    if (t.rows.length) out.push(`INSERT INTO \`${t.name}\` VALUES ${t.rows.map((r) => `(${r.map(lit).join(',')})`).join(',')};`);
    out.push('');
  }
  return out.join('\n');
}

const sha1 = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex');
const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');
const T0 = 1_600_000_000;
/** UTF-8 metnin latin1 tabloda saklanıp yeniden UTF-8 dökülmüş hâli ("dÃ¼nya") */
const mojibake = (s: string) => Buffer.from(s, 'utf8').toString('latin1');

async function bcrypt(password: string): Promise<string> {
  const { bcrypt: hash } = await import('hash-wasm');
  return (await hash({ password, salt: randomBytes(16), costFactor: 4, outputType: 'encoded' })).replace(/^\$2[ab]\$/, '$2y$');
}

// ---------- Test ----------

describe('forum importer', () => {
  let h: Harness;
  let admin: Agent;
  const dir = mkdtempSync(join(tmpdir(), 'inkforum-import-'));

  beforeAll(async () => {
    h = await createHarness({ STORAGE_DIR: dir, ...(process.env.TEST_DB_DRIVER === 'pglite' ? {} : { DB_SQLITE_PATH: join(dir, 'forum.db') }) });
    admin = await adminAgent(h);
  }, 60_000);
  afterAll(async () => {
    await h.close().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  });

  async function waitFor(id: number, statuses: string[]): Promise<Record<string, any>> {
    for (let i = 0; i < 300; i++) {
      const res = await admin.get(`/api/admin/import/${id}`);
      if (statuses.includes(res.body.status)) return res.body;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`İçe aktarma ${statuses.join('/')} durumuna gelmedi`);
  }

  async function runImport(sql: string, filename: string, options: Record<string, unknown> = {}) {
    const up = await admin.upload('/api/admin/import/upload', 'file', filename.endsWith('.gz') ? gzipSync(sql) : Buffer.from(sql, 'utf8'), filename);
    expect(up.status).toBe(201);
    const ready = await waitFor(up.body.id, ['ready', 'failed']);
    expect(ready.error).toBeNull();
    const start = await admin.post(`/api/admin/import/${up.body.id}/start`, {
      charset: 'utf8',
      fixMojibake: false,
      baseUrl: '',
      files: { avatars: false, groupIcons: false, attachmentImages: false },
      confirm: true,
      ...options,
    });
    expect(start.status).toBe(202);
    const done = await waitFor(up.body.id, ['done', 'failed', 'cancelled']);
    expect(done.error).toBeNull();
    expect(done.status).toBe('done');
    return { ready, done };
  }

  const topicByTitle = (title: string) => h.db.q.selectFrom('topics').selectAll().where('title', '=', title).executeTakeFirstOrThrow();
  const postsOf = (topicId: number) => h.db.q.selectFrom('posts').selectAll().where('topic_id', '=', topicId).orderBy('id').execute();

  it('rejects files that are not SQL dumps and unknown schemas', async () => {
    const bad = await admin.upload('/api/admin/import/upload', 'file', Buffer.from('x'), 'yedek.zip');
    expect(bad.status).toBe(422);
    const guest = await h.agent().upload('/api/admin/import/upload', 'file', Buffer.from('x'), 'a.sql');
    expect(guest.status).toBe(401);
    const up = await admin.upload('/api/admin/import/upload', 'file', Buffer.from(dump([{ name: 'wp_posts', columns: ['ID', 'post_title'], rows: [[1, 'x']] }])), 'wp.sql');
    const res = await waitFor(up.body.id, ['ready', 'failed']);
    expect(res.status).toBe('failed');
    expect(res.error).toMatch(/tanınamadı/);
  });

  it('imports an SMF 2.1 forum with members, permissions, quotes, polls and messages', async () => {
    const mehmetHash = await bcrypt('mehmet' + 'Gizli456');
    const sql = dump([
      {
        name: 'smf_settings',
        columns: ['variable', 'value'],
        rows: [
          ['smfVersion', '2.1.4'],
          ['global_character_set', 'UTF-8'],
          ['smileys_url', 'https://eski.smf.test/Smileys'],
        ],
      },
      {
        name: 'smf_membergroups',
        columns: ['id_group', 'group_name', 'description', 'online_color', 'min_posts', 'icons', 'hidden'],
        rows: [
          [1, 'Administrator', '', '#FF0000', -1, '5#iconadmin.png', 0],
          [2, 'Global Moderator', '', '#0000FF', -1, '5#icongmod.png', 0],
          [3, 'Moderator', '', '', -1, '5#iconmod.png', 0],
          [4, 'Newbie', '', '', 0, '1#icon.png', 0],
          [5, 'Jr. Member', '', '', 50, '2#icon.png', 0],
          [9, 'VIP Üyeler', 'Destekçiler', '#ff9900', -1, '1#vip.png', 0],
        ],
      },
      {
        name: 'smf_members',
        columns: ['id_member', 'member_name', 'real_name', 'email_address', 'passwd', 'date_registered', 'last_login', 'posts', 'id_group', 'additional_groups', 'member_ip', 'birthdate', 'signature', 'website_url', 'usertitle', 'avatar', 'is_activated', 'id_post_group'],
        rows: [
          [1, 'EskiYonetici', 'Eski Yönetici', 'admin@forum.test', sha1('eskiyonetici' + 'x'), T0, T0, 10, 1, '', Buffer.from([10, 0, 0, 1]), '1004-01-01', '', '', '', '', 1, 4],
          [2, 'Ayşe', 'Ayşe Yılmaz', 'ayse@eski.test', sha1('ayşe' + 'Parola123'), T0 + 10, T0 + 100, 5, 0, '9', Buffer.from([10, 0, 0, 2]), '1990-05-17', '[b]İmza[/b]', 'https://ayse.test', 'Kurucu', '', 1, 4],
          [3, 'Mehmet', 'Mehmet', 'mehmet@eski.test', mehmetHash, T0 + 20, T0 + 200, 1, 0, '', null, '0001-01-01', '', '', '', '', 1, 4],
          [4, 'Spamci', 'Spamci', 'spam@eski.test', sha1('spamci' + 'x'), T0 + 30, 0, 0, 0, '', null, '1004-01-01', '', '', '', '', 11, 4],
        ],
      },
      { name: 'smf_categories', columns: ['id_cat', 'cat_order', 'name', 'description', 'can_collapse'], rows: [[1, 1, 'Topluluk', 'Genel alan', 1], [2, 2, 'Yönetim', '', 1]] },
      {
        name: 'smf_boards',
        columns: ['id_board', 'id_cat', 'child_level', 'id_parent', 'board_order', 'name', 'description', 'member_groups', 'redirect', 'count_posts', 'deny_member_groups'],
        rows: [
          [1, 1, 0, 0, 1, 'Genel Sohbet', 'Her şey', '-1,0,4,5', '', 0, ''],
          [2, 1, 1, 1, 2, 'Alt Bölüm', '', '-1,0', '', 0, ''],
          [3, 1, 0, 0, 3, 'Üyelere Özel', '', '0,4,5', '', 0, ''],
          [4, 2, 0, 0, 4, 'Yönetim Odası', '', '2', '', 1, ''],
          [5, 2, 0, 0, 5, 'VIP Köşe', '', '9', '', 0, ''],
        ],
      },
      { name: 'smf_moderators', columns: ['id_board', 'id_member'], rows: [[1, 3]] },
      {
        name: 'smf_topics',
        columns: ['id_topic', 'is_sticky', 'id_board', 'id_first_msg', 'id_last_msg', 'id_member_started', 'id_poll', 'num_replies', 'num_views', 'locked', 'approved', 'id_redirect_topic'],
        rows: [
          [1, 1, 1, 1, 3, 2, 1, 2, 120, 0, 1, 0],
          [2, 0, 4, 4, 4, 1, 0, 0, 5, 0, 1, 0],
          [3, 0, 1, 5, 5, 1, 0, 0, 1, 1, 1, 1],
        ],
      },
      {
        name: 'smf_messages',
        columns: ['id_msg', 'id_topic', 'id_board', 'poster_time', 'id_member', 'subject', 'poster_name', 'poster_email', 'poster_ip', 'body', 'approved', 'modified_time', 'modified_reason'],
        rows: [
          [1, 1, 1, T0 + 1000, 2, mojibake('Merhaba dünya'), 'Ayşe', '', Buffer.from([10, 0, 0, 2]), 'İlk mesaj &quot;tırnak&quot;<br />[b]kalın[/b]', 1, 0, ''],
          [2, 1, 1, T0 + 2000, 3, 'Re: Merhaba', 'Mehmet', '', null, '[quote author=Ayşe Yılmaz link=topic=1.msg1#msg1 date=1600001000]alıntı[/quote]<br />Yanıt [member=2]Ayşe[/member] [attach id=7]resim.png[/attach]', 1, T0 + 2500, 'yazım'],
          [3, 1, 1, T0 + 3000, 0, 'Re: Merhaba', 'Misafir Kişi', 'm@x.test', null, 'Misafir yanıtı', 1, 0, ''],
          [4, 2, 4, T0 + 4000, 1, 'Yönetim notu', 'EskiYonetici', '', null, 'Gizli not', 1, 0, ''],
          [5, 3, 1, T0 + 5000, 1, 'TAŞINDI: x', 'EskiYonetici', '', null, 'Bu konu taşındı: [iurl]https://eski.smf.test/index.php?topic=1.0[/iurl]', 1, 0, ''],
        ],
      },
      {
        name: 'smf_attachments',
        columns: ['id_attach', 'id_thumb', 'id_msg', 'id_member', 'id_folder', 'attachment_type', 'filename', 'file_hash', 'fileext', 'size', 'width', 'height', 'mime_type', 'approved'],
        rows: [[7, 0, 2, 0, 1, 0, 'resim.png', 'abc', 'png', 1234, 100, 80, 'image/png', 1]],
      },
      { name: 'smf_polls', columns: ['id_poll', 'question', 'voting_locked', 'max_votes', 'expire_time', 'hide_results', 'change_vote', 'guest_vote', 'id_member', 'poster_name'], rows: [[1, 'Hangisi?', 0, 1, 0, 0, 1, 0, 2, 'Ayşe']] },
      { name: 'smf_poll_choices', columns: ['id_poll', 'id_choice', 'label', 'votes'], rows: [[1, 0, 'Elma', 1], [1, 1, 'Armut', 0]] },
      { name: 'smf_log_polls', columns: ['id_poll', 'id_member', 'id_choice'], rows: [[1, 2, 0]] },
      {
        name: 'smf_personal_messages',
        columns: ['id_pm', 'id_pm_head', 'id_member_from', 'deleted_by_sender', 'from_name', 'msgtime', 'subject', 'body'],
        rows: [
          [1, 1, 2, 0, 'Ayşe', T0 + 100, 'Selam', 'Nasılsın?'],
          [2, 1, 3, 0, 'Mehmet', T0 + 200, 'Re: Selam', 'İyiyim [quote author=Ayşe link=msg=1 date=1]x[/quote]'],
        ],
      },
      { name: 'smf_pm_recipients', columns: ['id_pm', 'id_member', 'bcc', 'is_read', 'is_new', 'deleted', 'in_inbox'], rows: [[1, 3, 0, 1, 0, 0, 1], [2, 2, 0, 1, 0, 0, 1]] },
      {
        name: 'smf_ban_groups',
        columns: ['id_ban_group', 'name', 'ban_time', 'expire_time', 'cannot_access', 'cannot_register', 'cannot_post', 'cannot_login', 'reason', 'notes'],
        rows: [[1, 'Spam', T0, null, 0, 1, 1, 1, 'Spam yasak', '']],
      },
      {
        name: 'smf_ban_items',
        columns: ['id_ban', 'id_ban_group', 'ip_low', 'ip_high', 'hostname', 'email_address', 'id_member', 'hits'],
        rows: [
          [1, 1, Buffer.from([192, 168, 5, 5]), Buffer.from([192, 168, 5, 5]), '', '', 0, 0],
          [2, 1, null, null, '', '%@spam.test', 0, 0],
        ],
      },
      // Aktarılmayan büyük tablo (ara depoya alınmamalı)
      { name: 'smf_log_search_words', columns: ['id_word', 'id_msg'], rows: [[1, 1]] },
    ]);

    const { ready, done } = await runImport(sql, 'smf-dump.sql.gz', { fixMojibake: true, baseUrl: 'https://eski.smf.test' });
    expect(ready.analysis).toMatchObject({ platform: 'smf', version: '2.1.4', prefix: 'smf_', baseUrl: 'https://eski.smf.test', charset: 'utf8', mojibake: true });
    expect(ready.analysis.counts).toMatchObject({ users: 4, topics: 3, posts: 5, polls: 1, conversations: 1, attachments: 1 });
    expect(done.stats).toMatchObject({ users: 3, usersMerged: 1, topics: 2, posts: 4, polls: 1, conversations: 1 });

    // Önizleme: çift kodlama düzeltmesi
    const preview = await admin.get(`/api/admin/import/${done.id}/preview?charset=utf8&fix=1`);
    expect(preview.status).toBe(400); // aktarma bittikten sonra önizleme yok

    // Konular ve mesajlar
    const topic = await topicByTitle('Merhaba dünya');
    expect(topic).toMatchObject({ is_pinned: 1, view_count: 120, reply_count: 2 });
    const posts = await postsOf(topic.id);
    expect(posts).toHaveLength(3);
    expect(posts[0]!.body_bbcode).toBe('İlk mesaj "tırnak"\n[b]kalın[/b]');
    const ayse = await h.db.q.selectFrom('users').selectAll().where('username', '=', 'Ayşe').executeTakeFirstOrThrow();
    expect(posts[1]!.body_bbcode).toContain(`[quote author="Ayşe Yılmaz" post=${posts[0]!.id}]alıntı[/quote]`);
    expect(posts[1]!.body_bbcode).toContain(`[mention=${ayse.id}]Ayşe Yılmaz[/mention]`);
    expect(posts[1]!.body_bbcode).toContain('[img]https://eski.smf.test/index.php?action=dlattach;attach=7[/img]');
    expect(posts[1]!.body_html).toContain('bb-quote');
    expect(posts[1]!.edit_reason).toBe('yazım');
    expect(posts[2]).toMatchObject({ user_id: null, author_name: 'Misafir Kişi' });
    expect(await h.db.q.selectFrom('topics').select('id').where('title', 'like', 'TAŞINDI%').executeTakeFirst()).toBeUndefined();

    // Üyeler, gruplar, rütbeler
    expect(ayse).toMatchObject({ display_name: 'Ayşe Yılmaz', custom_title: 'Kurucu', post_count: 1, status: 'active' });
    const vip = await h.db.q.selectFrom('member_groups').selectAll().where('name', '=', 'VIP Üyeler').executeTakeFirstOrThrow();
    expect(vip.color).toBe('#ff9900');
    expect(await h.db.q.selectFrom('group_members').select('user_id').where('group_id', '=', vip.id).execute()).toEqual([{ user_id: ayse.id }]);
    const ranks = await h.db.q.selectFrom('member_groups').select(['name', 'min_posts']).where('kind', '=', 'post_count').orderBy('min_posts').execute();
    expect(ranks).toEqual([
      { name: 'Newbie', min_posts: 0 },
      { name: 'Jr. Member', min_posts: 50 },
    ]);
    const profile = await h.db.q.selectFrom('user_profiles').selectAll().where('user_id', '=', ayse.id).executeTakeFirstOrThrow();
    expect(profile).toMatchObject({ signature: '[b]İmza[/b]', birthdate: '1990-05-17', website_url: 'https://ayse.test' });
    // Aynı e-postalı eski yönetici mevcut yöneticiyle eşleşti
    const adminRow = await h.db.q.selectFrom('users').select('id').where('email', '=', 'admin@forum.test').executeTakeFirstOrThrow();
    const note = await topicByTitle('Yönetim notu');
    expect(note.user_id).toBe(adminRow.id);

    // Bölüm erişimi
    const boards = await h.db.q
      .selectFrom('boards')
      .leftJoin('permission_profiles', 'permission_profiles.id', 'boards.permission_profile_id')
      .select(['boards.name', 'boards.parent_id', 'permission_profiles.name as profile', 'permission_profiles.key as key'])
      .orderBy('boards.sort_order')
      .execute();
    expect(boards.map((b) => [b.name, b.profile === null ? null : (b.key ?? b.profile)])).toEqual([
      ['Genel Sohbet', null],
      ['Alt Bölüm', null],
      ['Üyelere Özel', 'members_only'],
      ['Yönetim Odası', 'Yalnızca yetkililer'],
      ['VIP Köşe', 'Özel erişim: VIP Üyeler'],
    ]);
    expect(boards[1]!.parent_id).not.toBeNull();
    const guestView = await h.agent().get(`/api/forum/topics/${note.id}`);
    expect([403, 404]).toContain(guestView.status);
    const mods = await h.db.q.selectFrom('board_moderators').select('user_id').execute();
    expect(mods).toHaveLength(1);

    // Anket ve özel mesaj
    const poll = await h.db.q.selectFrom('polls').selectAll().where('topic_id', '=', topic.id).executeTakeFirstOrThrow();
    expect(poll).toMatchObject({ question: 'Hangisi?', voter_count: 1, allow_change: 1 });
    expect(await h.db.q.selectFrom('poll_votes').select('user_id').where('poll_id', '=', poll.id).execute()).toEqual([{ user_id: ayse.id }]);
    const conv = await h.db.q.selectFrom('conversations').selectAll().where('title', '=', 'Selam').executeTakeFirstOrThrow();
    expect(conv.message_count).toBe(2);
    expect(await h.db.q.selectFrom('conversation_participants').select('user_id').where('conversation_id', '=', conv.id).execute()).toHaveLength(2);

    // Yasaklar: üye (is_activated > 10), IP ve e-posta
    const triggers = await h.db.q.selectFrom('ban_triggers').select(['type', 'value']).orderBy('id').execute();
    expect(triggers.map((t) => t.type)).toEqual(expect.arrayContaining(['user', 'ip', 'email']));
    expect(triggers.find((t) => t.type === 'email')?.value).toBe('*@spam.test');

    // Eski şifrelerle giriş (SMF 2.0 sha1 ve 2.1 bcrypt); ilk girişte özet yenilenir
    await loginAgent(h, 'Ayşe', 'Parola123');
    await loginAgent(h, 'Mehmet', 'Gizli456');
    const wrong = await h.agent().post('/api/auth/login', { identifier: 'Ayşe', password: 'yanlis' });
    expect(wrong.status).not.toBe(200);
    const rehashed = await h.db.q.selectFrom('users').select('password_hash').where('id', '=', ayse.id).executeTakeFirstOrThrow();
    expect(rehashed.password_hash).not.toMatch(/^\$legacy\$/);

    // Eski adres yönlendirmesi
    const legacy = await h.agent().get('/api/import/legacy?kind=topic&id=1');
    expect(legacy.body.url).toBe(`/t/${topic.id}`);
    expect((await h.agent().get('/api/import/legacy?kind=topic&id=999')).status).toBe(404);
  }, 60_000);

  it('imports phpBB 3.3 with ACL-based access, s9e and legacy text, attachments', async () => {
    const sql = dump([
      {
        name: 'phpbb_config',
        columns: ['config_name', 'config_value', 'is_dynamic'],
        rows: [
          ['version', '3.3.10', 0],
          ['server_name', 'eski.phpbb.test', 0],
          ['server_protocol', 'https://', 0],
          ['script_path', '/forum', 0],
        ],
      },
      {
        name: 'phpbb_groups',
        columns: ['group_id', 'group_type', 'group_name', 'group_desc', 'group_desc_uid', 'group_colour'],
        rows: [
          [1, 3, 'GUESTS', '', '', ''],
          [2, 3, 'REGISTERED', '', '', ''],
          [5, 3, 'ADMINISTRATORS', '', '', 'AA0000'],
          [6, 3, 'BOTS', '', '', ''],
          [8, 0, 'Tasarımcılar', 'Tasarım ekibi', '', '00AA00'],
        ],
      },
      {
        name: 'phpbb_users',
        columns: ['user_id', 'user_type', 'group_id', 'username', 'username_clean', 'user_password', 'user_email', 'user_regdate', 'user_lastvisit', 'user_posts', 'user_rank', 'user_sig', 'user_sig_bbcode_uid', 'user_avatar', 'user_avatar_type', 'user_birthday', 'user_ip', 'user_inactive_reason'],
        rows: [
          [1, 2, 1, 'Anonymous', 'anonymous', '', '', T0, 0, 0, 0, '', '', '', '', '', '', 0],
          [2, 0, 2, 'Zeynep', 'zeynep', md5('Sifre789'), 'zeynep@eski.test', T0, T0, 2, 2, '', '', 'https://img.test/z.png', 'avatar.driver.remote', ' 5- 3-1992', '10.1.1.1', 0],
          [3, 2, 6, 'Googlebot', 'googlebot', '', '', T0, 0, 0, 0, '', '', '', '', '', '', 0],
        ],
      },
      { name: 'phpbb_user_group', columns: ['group_id', 'user_id', 'group_leader', 'user_pending'], rows: [[2, 2, 0, 0], [8, 2, 0, 0]] },
      { name: 'phpbb_ranks', columns: ['rank_id', 'rank_title', 'rank_min', 'rank_special', 'rank_image'], rows: [[1, 'Çaylak', 0, 0, 'caylak.gif'], [2, 'Efsane', 0, 1, '']] },
      {
        name: 'phpbb_forums',
        columns: ['forum_id', 'parent_id', 'left_id', 'right_id', 'forum_type', 'forum_name', 'forum_desc', 'forum_desc_uid', 'forum_link', 'forum_password'],
        rows: [
          [1, 0, 1, 8, 0, 'Ana Kategori', '', '', '', ''],
          [2, 1, 2, 5, 1, 'Sohbet', '<t>Açıklama</t>', '', '', ''],
          [3, 2, 3, 4, 1, 'Alt Sohbet', '', '', '', ''],
          [4, 1, 6, 7, 1, 'Tasarım', '', '', '', ''],
        ],
      },
      { name: 'phpbb_acl_options', columns: ['auth_option_id', 'auth_option', 'is_global', 'is_local'], rows: [[20, 'f_read', 0, 1]] },
      { name: 'phpbb_acl_roles_data', columns: ['role_id', 'auth_option_id', 'auth_setting'], rows: [[15, 20, 1]] },
      {
        name: 'phpbb_acl_groups',
        columns: ['group_id', 'forum_id', 'auth_option_id', 'auth_role_id', 'auth_setting'],
        rows: [
          [1, 2, 0, 15, 0],
          [2, 2, 0, 15, 0],
          [2, 3, 0, 15, 0],
          [8, 4, 20, 0, 1],
        ],
      },
      {
        name: 'phpbb_topics',
        columns: ['topic_id', 'forum_id', 'topic_title', 'topic_poster', 'topic_time', 'topic_views', 'topic_type', 'topic_status', 'topic_moved_id', 'topic_first_poster_name', 'topic_visibility', 'poll_title', 'poll_start', 'poll_length', 'poll_max_options', 'poll_vote_change'],
        rows: [
          [1, 2, 'phpBB konusu', 2, T0, 7, 0, 0, 0, 'Zeynep', 1, '', 0, 0, 1, 0],
          [2, 3, 'Taşınan', 2, T0, 0, 0, 2, 1, 'Zeynep', 1, '', 0, 0, 1, 0],
        ],
      },
      {
        name: 'phpbb_posts',
        columns: ['post_id', 'topic_id', 'forum_id', 'poster_id', 'poster_ip', 'post_time', 'post_username', 'post_subject', 'post_text', 'bbcode_uid', 'post_visibility', 'post_attachment', 'post_edit_time', 'post_edit_reason'],
        rows: [
          [1, 1, 2, 2, '10.1.1.1', T0 + 10, '', 'phpBB konusu', '<r><B><s>[b]</s>Kalın<e>[/b]</e></B> metin &amp; <E>:)</E></r>', '', 1, 0, 0, ''],
          [2, 1, 2, 1, '10.9.9.9', T0 + 20, 'Ziyaretçi', 'Re', '[quote=&quot;Zeynep&quot;:abc12345]Alıntı[/quote:abc12345]Yanıt [attachment=0:abc12345]<!-- ia0 -->dosya.zip<!-- ia0 -->[/attachment:abc12345]', 'abc12345', 1, 1, 0, ''],
        ],
      },
      {
        name: 'phpbb_attachments',
        columns: ['attach_id', 'post_msg_id', 'topic_id', 'in_message', 'poster_id', 'is_orphan', 'physical_filename', 'real_filename', 'extension', 'mimetype', 'filesize'],
        rows: [[5, 2, 1, 0, 1, 0, 'x', 'dosya.zip', 'zip', 'application/zip', 1234]],
      },
    ]);
    const { ready } = await runImport(sql, 'phpbb.sql', { baseUrl: 'https://eski.phpbb.test/forum' });
    expect(ready.analysis).toMatchObject({ platform: 'phpbb', version: '3.3.10', baseUrl: 'https://eski.phpbb.test/forum' });
    const topic = await topicByTitle('phpBB konusu');
    const posts = await postsOf(topic.id);
    expect(posts[0]!.body_bbcode).toBe('[b]Kalın[/b] metin & :)');
    expect(posts[1]!.body_bbcode).toBe('[quote author="Zeynep"]Alıntı[/quote]Yanıt [url=https://eski.phpbb.test/forum/download/file.php?id=5]dosya.zip[/url]');
    expect(posts[1]).toMatchObject({ user_id: null, author_name: 'Ziyaretçi' });
    expect(await h.db.q.selectFrom('topics').select('id').where('title', '=', 'Taşınan').executeTakeFirst()).toBeUndefined();
    expect(await h.db.q.selectFrom('users').select('id').where('username', '=', 'Googlebot').executeTakeFirst()).toBeUndefined();
    const boards = await h.db.q
      .selectFrom('boards')
      .leftJoin('permission_profiles', 'permission_profiles.id', 'boards.permission_profile_id')
      .select(['boards.name', 'permission_profiles.name as profile', 'permission_profiles.key as key'])
      .orderBy('boards.sort_order')
      .execute();
    expect(boards.map((b) => [b.name, b.key ?? b.profile])).toEqual([
      ['Sohbet', null],
      ['Alt Sohbet', 'members_only'],
      ['Tasarım', 'Özel erişim: Tasarımcılar'],
    ]);
    // Özel rütbe → grup üyeliği; mesaj rütbesi → post_count grubu
    const zeynep = await h.db.q.selectFrom('users').selectAll().where('username', '=', 'Zeynep').executeTakeFirstOrThrow();
    const groups = await h.db.q.selectFrom('group_members').innerJoin('member_groups', 'member_groups.id', 'group_members.group_id').select('member_groups.name').where('user_id', '=', zeynep.id).execute();
    expect(groups.map((g) => g.name).sort()).toEqual(['Efsane', 'Tasarımcılar']);
    await loginAgent(h, 'zeynep@eski.test', 'Sifre789');
  }, 60_000);

  it('imports MyBB 1.8 with salted MD5 passwords and MyCode', async () => {
    const salt = 'aB3dE5gH';
    const sql = dump([
      { name: 'mybb_settings', columns: ['sid', 'name', 'value'], rows: [[1, 'bburl', 'https://eski.mybb.test']] },
      { name: 'mybb_datacache', columns: ['title', 'cache'], rows: [['version', 'a:2:{s:7:"version";s:6:"1.8.38";s:12:"version_code";i:1838;}'], ['stats', 'x']] },
      {
        name: 'mybb_usergroups',
        columns: ['gid', 'type', 'title', 'description', 'namestyle', 'stars', 'starimage', 'image', 'cancp', 'issupermod', 'canview', 'canviewthreads', 'isbannedgroup'],
        rows: [
          [1, 1, 'Guests', '', '{username}', 0, '', '', 0, 0, 1, 1, 0],
          [2, 1, 'Registered', '', '{username}', 1, 'images/star.png', '', 0, 0, 1, 1, 0],
          [4, 1, 'Administrators', '', '<span style="color: #CC00CC;"><strong>{username}</strong></span>', 1, '', '', 1, 0, 1, 1, 0],
        ],
      },
      { name: 'mybb_usertitles', columns: ['utid', 'posts', 'title', 'stars', 'starimage'], rows: [[1, 0, 'Yeni Kalem', 1, '']] },
      {
        name: 'mybb_users',
        columns: ['uid', 'username', 'password', 'salt', 'loginkey', 'email', 'usergroup', 'additionalgroups', 'postnum', 'regdate', 'lastactive', 'regip', 'lastip', 'avatar', 'birthday', 'website', 'signature', 'usertitle'],
        rows: [[1, 'Kaan', md5(md5(salt) + md5('MyPass!1')), salt, 'k', 'kaan@eski.test', 2, '', 1, T0, T0, null, null, '', '1-2-1995', '', '', '']],
      },
      {
        name: 'mybb_forums',
        columns: ['fid', 'name', 'description', 'linkto', 'type', 'pid', 'parentlist', 'disporder', 'active', 'password'],
        rows: [
          [1, 'Kategori', '', '', 'c', 0, '1', 1, 1, ''],
          [2, 'Genel', '', '', 'f', 1, '1,2', 1, 1, ''],
        ],
      },
      { name: 'mybb_threads', columns: ['tid', 'fid', 'subject', 'uid', 'username', 'dateline', 'views', 'sticky', 'closed', 'visible'], rows: [[1, 2, 'MyBB konusu', 1, 'Kaan', T0, 3, 0, '', 1], [2, 2, 'Taşındı', 1, 'Kaan', T0, 0, 0, 'moved|1', 1]] },
      {
        name: 'mybb_posts',
        columns: ['pid', 'tid', 'fid', 'uid', 'username', 'dateline', 'message', 'ipaddress', 'visible', 'edittime'],
        rows: [
          [1, 1, 2, 1, 'Kaan', T0, 'ilk', Buffer.from([127, 0, 0, 1]), 1, 0],
          [2, 1, 2, 1, 'Kaan', T0 + 5, "[quote='Kaan' pid='1' dateline='1600000000']ilk[/quote]\n[align=center]orta[/align]", null, 1, 0],
        ],
      },
    ]);
    const { ready } = await runImport(sql, 'mybb.sql');
    expect(ready.analysis).toMatchObject({ platform: 'mybb', version: '1.8.38', baseUrl: 'https://eski.mybb.test' });
    const topic = await topicByTitle('MyBB konusu');
    const posts = await postsOf(topic.id);
    expect(posts[1]!.body_bbcode).toBe(`[quote author="Kaan" post=${posts[0]!.id}]ilk[/quote]\n[center]orta[/center]`);
    await loginAgent(h, 'Kaan', 'MyPass!1');
  }, 60_000);

  it('imports Invision Community with language strings and HTML posts', async () => {
    const salt = 'q1w2e';
    const sql = dump([
      { name: 'core_applications', columns: ['app_id', 'app_directory', 'app_version', 'app_long_version'], rows: [[1, 'core', '4.7.12', 107728]] },
      { name: 'core_sys_lang', columns: ['lang_id', 'lang_default'], rows: [[1, 1]] },
      {
        name: 'core_sys_lang_words',
        columns: ['word_id', 'lang_id', 'word_key', 'word_default', 'word_custom'],
        rows: [
          [1, 1, 'forums_forum_1', 'Category', 'Topluluk'],
          [2, 1, 'forums_forum_2', 'Forum', 'Sohbet Salonu'],
          [3, 1, 'forums_forum_2_desc', '', '<p>Açıklama</p>'],
          [4, 1, 'core_group_7', 'Grup', 'Editörler'],
          [5, 1, 'some_other_key', 'x', ''],
        ],
      },
      { name: 'core_groups', columns: ['g_id', 'prefix', 'g_icon', 'g_hide_from_list'], rows: [[2, '', '', 0], [3, '', '', 0], [4, "<span style='color:#ff0000'>", '', 0], [7, "<span style='color:#00aa00'>", 'monthly_2020/editor.png', 0]] },
      { name: 'core_admin_permission_rows', columns: ['row_id', 'row_id_type', 'row_perm_cache'], rows: [[4, 'group', '*']] },
      {
        name: 'core_members',
        columns: ['member_id', 'name', 'email', 'members_pass_hash', 'members_pass_salt', 'joined', 'member_group_id', 'mgroup_others', 'member_posts', 'member_title', 'signature', 'pp_main_photo', 'pp_photo_type', 'temp_ban', 'bday_day', 'bday_month', 'bday_year', 'ip_address', 'last_activity'],
        rows: [[1, 'Ece', 'ece@eski.test', md5(md5(salt) + md5('IpsPass9')), salt, T0, 3, ',7,', 1, '', '<p>İmzam</p>', '', 'none', 0, 3, 4, 1991, '10.2.2.2', T0]],
      },
      {
        name: 'forums_forums',
        columns: ['id', 'parent_id', 'position', 'name_seo', 'inc_postcount', 'redirect_on', 'redirect_url', 'password'],
        rows: [[1, -1, 1, 'topluluk', 1, 0, '', ''], [2, 1, 1, 'sohbet', 1, 0, '', '']],
      },
      { name: 'core_permission_index', columns: ['perm_id', 'app', 'perm_type', 'perm_type_id', 'perm_view', 'perm_2'], rows: [[1, 'forums', 'forum', 2, '*', ',2,3,4,']] },
      { name: 'forums_topics', columns: ['tid', 'forum_id', 'title', 'starter_id', 'starter_name', 'start_date', 'views', 'pinned', 'state', 'approved', 'moved_to', 'poll_state'], rows: [[1, 2, 'IPS konusu', 1, 'Ece', T0, 9, 0, 'open', 1, '', 0]] },
      {
        name: 'forums_posts',
        columns: ['pid', 'topic_id', 'author_id', 'author_name', 'post_date', 'ip_address', 'post', 'queued', 'edit_time', 'post_edit_reason', 'new_topic'],
        rows: [
          [1, 1, 1, 'Ece', T0, '10.2.2.2', '<p>Merhaba <strong>IPS</strong></p>', 0, 0, '', 1],
          [
            2,
            1,
            1,
            'Ece',
            T0 + 1,
            '10.2.2.2',
            '<blockquote class="ipsQuote" data-ipsquote-username="Ece" data-ipsquote-contentcommentid="1"><div class="ipsQuote_citation">Ece said:</div><div class="ipsQuote_contents"><p>Merhaba</p></div></blockquote><p><a href="<___base_url___>/topic/1-x/">bağlantı</a></p>',
            0,
            0,
            '',
            0,
          ],
        ],
      },
    ]);
    const { ready } = await runImport(sql, 'ips.sql', { baseUrl: 'https://eski.ips.test' });
    expect(ready.analysis).toMatchObject({ platform: 'ips', version: '4.7.12' });
    const board = await h.db.q.selectFrom('boards').selectAll().executeTakeFirstOrThrow();
    expect(board).toMatchObject({ name: 'Sohbet Salonu', description: 'Açıklama', permission_profile_id: null });
    const topic = await topicByTitle('IPS konusu');
    const posts = await postsOf(topic.id);
    expect(posts[0]!.body_bbcode).toBe('Merhaba [b]IPS[/b]');
    expect(posts[1]!.body_bbcode).toBe(`[quote author="Ece" post=${posts[0]!.id}]Merhaba[/quote]\n[url=https://eski.ips.test/topic/1-x/]bağlantı[/url]`);
    const editors = await h.db.q.selectFrom('member_groups').selectAll().where('name', '=', 'Editörler').executeTakeFirstOrThrow();
    expect(editors.color).toBe('#00aa00');
    await loginAgent(h, 'Ece', 'IpsPass9');
  }, 60_000);
});
