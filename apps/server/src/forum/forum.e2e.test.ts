import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { MINUTE } from '../common/clock.js';

let h: Harness;
let admin: Agent;
let ali: Agent;
let ayse: Agent;
const boards: Record<string, number> = {};

async function userId(username: string): Promise<number> {
  const row = await h.db.q.selectFrom('users').select('id').where('username', '=', username).executeTakeFirstOrThrow();
  return row.id;
}

async function postCount(username: string): Promise<number> {
  const row = await h.db.q.selectFrom('users').select('post_count').where('username', '=', username).executeTakeFirstOrThrow();
  return row.post_count;
}

async function newTopic(agent: Agent, boardId: number, title = 'Deneme konusu', body = 'İlk mesaj içeriği') {
  const res = await agent.post(`/api/boards/${boardId}/topics`, { title, body });
  if (res.status !== 201) throw new Error(`Konu açılamadı: ${JSON.stringify(res.body)}`);
  return res.body as { topicId: number; postId: number; approved: boolean };
}

beforeAll(async () => {
  h = await createHarness();
  await h.settings.set('forum.floodSeconds', 0);
  admin = await adminAgent(h);
  ali = await registerActive(h, 'Ali');
  ayse = await registerActive(h, 'Ayse');
  const index = await h.agent().get('/api/forum');
  for (const c of index.body.categories) for (const b of c.boards) boards[b.name] = b.id;
});

afterAll(async () => {
  await h.close();
});

describe('forum index', () => {
  it('seeds a default structure with a welcome topic', async () => {
    const res = await h.agent().get('/api/forum');
    expect(res.status).toBe(200);
    expect(res.body.categories.map((c: { name: string }) => c.name)).toEqual(['Genel', 'Topluluk']);
    const ann = res.body.categories[0].boards[0];
    expect(ann).toMatchObject({ name: 'Duyurular', topicCount: 1, postCount: 1, icon: { kind: 'icon', name: 'megaphone' } });
    expect(ann.lastPost.topicTitle).toBe('Foruma hoş geldiniz!');
    const link = res.body.categories[1].boards.find((b: { type: string }) => b.type === 'redirect');
    expect(link.redirectUrl).toBe('/policies/rules');
    expect(res.body.stats.members).toBeGreaterThanOrEqual(3);
  });

  it('counts clicks on link boards', async () => {
    const id = boards['Forum Kuralları']!;
    const res = await h.agent().get(`/api/boards/${id}/go`);
    expect(res.body.url).toBe('/policies/rules');
    const index = await h.agent().get('/api/forum');
    const link = index.body.categories[1].boards.find((b: { id: number }) => b.id === id);
    expect(link.redirectClicks).toBe(1);
  });
});

describe('topics and posts', () => {
  let topicId: number;
  let firstPostId: number;

  it('lets guests read but not post', async () => {
    const guest = h.agent();
    const board = await guest.get(`/api/boards/${boards['Genel Sohbet']}`);
    expect(board.status).toBe(200);
    expect(board.body.can.createTopic).toBe(false);
    const res = await guest.post(`/api/boards/${boards['Genel Sohbet']}/topics`, { title: 'Misafir', body: 'x' });
    expect(res.status).toBe(401);
  });

  it('creates a topic and updates counters', async () => {
    const before = await postCount('Ali');
    const t = await newTopic(ali, boards['Genel Sohbet']!, 'Merhaba dünya', '[b]Selam[/b] <script>alert(1)</script>');
    topicId = t.topicId;
    firstPostId = t.postId;
    expect(t.approved).toBe(true);
    expect(await postCount('Ali')).toBe(before + 1);

    const page = await h.agent().get(`/api/topics/${topicId}`);
    expect(page.status).toBe(200);
    expect(page.body.topic.title).toBe('Merhaba dünya');
    expect(page.body.posts.items[0].html).toBe('<strong>Selam</strong> &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(page.body.posts.items[0].author.postCount).toBe(before + 1);

    const board = await h.agent().get(`/api/boards/${boards['Genel Sohbet']}`);
    expect(board.body.board.topicCount).toBe(1);
    expect(board.body.topics.items[0]).toMatchObject({ id: topicId, replyCount: 0, title: 'Merhaba dünya' });
  });

  it('validates input', async () => {
    const empty = await ali.post(`/api/boards/${boards['Genel Sohbet']}/topics`, { title: 'Boş mesaj', body: '[b] [/b]' });
    expect(empty.status).toBe(422);
    expect(empty.body.error.fields.body).toBeTruthy();
    const short = await ali.post(`/api/boards/${boards['Genel Sohbet']}/topics`, { title: 'a', body: 'metin' });
    expect(short.status).toBe(422);
  });

  it('respects read-only boards', async () => {
    const res = await ali.post(`/api/boards/${boards['Duyurular']}/topics`, { title: 'Duyuru denemesi', body: 'metin' });
    expect(res.status).toBe(403);
    const ok = await admin.post(`/api/boards/${boards['Duyurular']}/topics`, { title: 'Yönetim duyurusu', body: 'metin' });
    expect(ok.status).toBe(201);
  });

  it('replies, quotes and mentions with notifications', async () => {
    const quote = await ayse.get(`/api/posts/${firstPostId}/quote`);
    expect(quote.body.bbcode).toContain(`post=${firstPostId}`);
    const aliId = await userId('Ali');
    const res = await ayse.post(`/api/topics/${topicId}/posts`, { body: `${quote.body.bbcode}Katılıyorum [mention=${aliId}]Ali[/mention]` });
    expect(res.status).toBe(201);
    expect(res.body.location).toMatchObject({ topicId, page: 1 });

    const notes = await ali.get('/api/me/notifications');
    const types = notes.body.items.map((n: { type: string }) => n.type);
    expect(types).toContain('forum.quote');
    expect(types).not.toContain('forum.mention'); // aynı mesajda alıntılanan kişiye ikinci bildirim gitmez

    const page = await h.agent().get(`/api/topics/${topicId}`);
    expect(page.body.topic.replyCount).toBe(1);
    expect(page.body.posts.items[1].html).toContain('bb-quote');
    expect(page.body.posts.items[1].html).toContain('bb-mention');
  });

  it('tracks edits outside the grace period', async () => {
    const quick = await ali.put(`/api/posts/${firstPostId}`, { body: 'Düzeltilmiş ilk mesaj' });
    expect(quick.status).toBe(200);
    let page = await h.agent().get(`/api/topics/${topicId}`);
    expect(page.body.posts.items[0].editCount).toBe(0);

    h.clock.advance(5 * MINUTE);
    const res = await ali.put(`/api/posts/${firstPostId}`, { body: 'İkinci düzenleme', reason: 'yazım', title: 'Merhaba forum' });
    expect(res.status).toBe(200);
    page = await h.agent().get(`/api/topics/${topicId}`);
    expect(page.body.topic.title).toBe('Merhaba forum');
    expect(page.body.posts.items[0]).toMatchObject({ editCount: 1, editReason: 'yazım' });
    const history = await ali.get(`/api/posts/${firstPostId}/revisions`);
    expect(history.body[0].bbcode).toBe('Düzeltilmiş ilk mesaj');
    expect((await ayse.put(`/api/posts/${firstPostId}`, { body: 'başkası' })).status).toBe(403);
    expect((await ayse.get(`/api/posts/${firstPostId}/revisions`)).status).toBe(403);
    await admin.post('/api/auth/elevate', { password: 'AdminPass123' });
  });

  it('deletes replies and keeps counters in sync', async () => {
    const r = await ali.post(`/api/topics/${topicId}/posts`, { body: 'Silinecek yanıt' });
    const before = await postCount('Ali');
    expect((await ali.delete(`/api/posts/${r.body.postId}`)).status).toBe(200);
    expect(await postCount('Ali')).toBe(before - 1);
    const page = await h.agent().get(`/api/topics/${topicId}`);
    expect(page.body.topic.replyCount).toBe(1);
    expect(page.body.posts.items.some((p: { id: number }) => p.id === r.body.postId)).toBe(false);
    // Yanıtı olan konunun ilk mesajını sahibi silemez.
    expect((await ali.delete(`/api/posts/${firstPostId}`)).status).toBe(403);
  });

  it('tracks unread topics', async () => {
    const t = await newTopic(ali, boards['Konu Dışı']!, 'Okunmamış testi');
    let unread = await ayse.get('/api/forum/unread');
    expect(unread.body.items.some((x: { id: number }) => x.id === t.topicId)).toBe(true);
    let index = await ayse.get('/api/forum');
    expect(index.body.categories[1].boards.find((b: { id: number }) => b.id === boards['Konu Dışı']).unread).toBe(true);

    await ayse.get(`/api/topics/${t.topicId}`);
    unread = await ayse.get('/api/forum/unread');
    expect(unread.body.items.some((x: { id: number }) => x.id === t.topicId)).toBe(false);

    h.clock.advance(1000);
    const reply = await ali.post(`/api/topics/${t.topicId}/posts`, { body: 'yeni yanıt' });
    unread = await ayse.get('/api/forum/unread');
    const item = unread.body.items.find((x: { id: number }) => x.id === t.topicId);
    expect(item.firstUnreadPostId).toBe(reply.body.postId);
    const page = await ayse.get(`/api/topics/${t.topicId}?page=unread`);
    expect(page.body.firstUnreadPostId).toBe(reply.body.postId);

    await ali.post(`/api/topics/${t.topicId}/posts`, { body: 'bir yanıt daha' });
    await ayse.post('/api/forum/mark-read');
    unread = await ayse.get('/api/forum/unread');
    expect(unread.body.total).toBe(0);
    index = await ayse.get('/api/forum');
    expect(index.body.categories[1].boards.find((b: { id: number }) => b.id === boards['Konu Dışı']).unread).toBe(false);
  });

  it('moves members into post-count groups', async () => {
    const groups = h.app.get(GroupCacheService);
    const active = (await groups.all()).find((g) => g.name === 'Aktif Üye')!;
    await h.db.q.updateTable('member_groups').set({ min_posts: 3 }).where('id', '=', active.id).execute();
    await groups.invalidate();
    const t = await newTopic(ayse, boards['Tanışma']!, 'Merhaba ben Ayşe');
    await ayse.post(`/api/topics/${t.topicId}/posts`, { body: 'bir' });
    await ayse.post(`/api/topics/${t.topicId}/posts`, { body: 'iki' });
    const row = await h.db.q.selectFrom('users').select('post_group_id').where('username', '=', 'Ayse').executeTakeFirstOrThrow();
    expect(row.post_group_id).toBe(active.id);
  });

  it('blocks muted members', async () => {
    const mehmet = await registerActive(h, 'Mehmet');
    await h.db.q.updateTable('users').set({ muted_until: h.clock.now() + MINUTE * 60 }).where('username', '=', 'Mehmet').execute();
    const res = await mehmet.post(`/api/topics/${topicId}/posts`, { body: 'susturuldum mu?' });
    expect(res.status).toBe(403);
    const page = await mehmet.get(`/api/topics/${topicId}`);
    expect(page.body.replyBlockedReason).toContain('susturuldu');
  });
});

describe('board permissions and moderation', () => {
  let secretBoard: number;

  it('manages categories and boards from the admin panel', async () => {
    const cat = await admin.post('/api/admin/forum/categories', { name: 'Özel', description: '' });
    expect(cat.status).toBe(201);
    const tree = await admin.get('/api/admin/forum');
    const membersOnly = tree.body.profiles.find((p: { key: string }) => p.key === 'members_only');
    const res = await admin.post('/api/admin/forum/boards', {
      categoryId: cat.body.id,
      name: 'Üye Odası',
      icon: { kind: 'icon', name: 'lock', color: '#123abc' },
      permissionProfileId: membersOnly.id,
    });
    expect(res.status).toBe(201);
    secretBoard = res.body.id;
    const bad = await admin.post('/api/admin/forum/boards', { categoryId: cat.body.id, name: 'Kötü', icon: { kind: 'icon', name: 'Bad Name!' } });
    expect(bad.status).toBe(422);
  });

  it('hides members-only boards from guests', async () => {
    const guest = await h.agent().get('/api/forum');
    const names = guest.body.categories.flatMap((c: { boards: Array<{ name: string }> }) => c.boards.map((b) => b.name));
    expect(names).not.toContain('Üye Odası');
    expect((await h.agent().get(`/api/boards/${secretBoard}`)).status).toBe(404);
    expect((await ali.get(`/api/boards/${secretBoard}`)).status).toBe(200);
  });

  it('applies profile permission changes immediately', async () => {
    const profiles = await admin.get('/api/admin/forum/profiles');
    const def = profiles.body.find((p: { key: string }) => p.key === 'default');
    const matrix = await admin.get(`/api/admin/forum/profiles/${def.id}`);
    const member = matrix.body.groups.find((g: { systemKey: string }) => g.systemKey === 'member');
    await admin.put(`/api/admin/forum/profiles/${def.id}/values`, { groupId: member.id, values: { 'topic.create': -1 } });
    expect((await ali.post(`/api/boards/${boards['Genel Sohbet']}/topics`, { title: 'Yasak', body: 'x' })).status).toBe(403);
    await admin.put(`/api/admin/forum/profiles/${def.id}/values`, { groupId: member.id, values: { 'topic.create': 1 } });
    expect((await ali.post(`/api/boards/${boards['Genel Sohbet']}/topics`, { title: 'Serbest', body: 'x' })).status).toBe(201);
  });

  it('gives board moderators moderation rights only in their boards', async () => {
    const t = await newTopic(ali, boards['Yardım ve Destek']!, 'Yardım lazım');
    expect((await ayse.post(`/api/mod/topics/${t.topicId}/lock`)).status).toBe(403);
    await admin.put(`/api/admin/forum/boards/${boards['Yardım ve Destek']}/moderators`, { userIds: [await userId('Ayse')] });
    expect((await ayse.post(`/api/mod/topics/${t.topicId}/lock`)).status).toBe(200);
    expect((await ali.post(`/api/topics/${t.topicId}/posts`, { body: 'kilitli mi?' })).status).toBe(403);
    // Başka bölümde moderatör değil.
    const other = await newTopic(ali, boards['Konu Dışı']!, 'Başka bölüm');
    expect((await ayse.post(`/api/mod/topics/${other.topicId}/lock`)).status).toBe(403);
  });

  it('moves and merges topics', async () => {
    const a = await newTopic(ali, boards['Genel Sohbet']!, 'Taşınacak konu');
    const moved = await admin.post(`/api/mod/topics/${a.topicId}/move`, { boardId: boards['Konu Dışı'], leaveRedirect: true });
    expect(moved.status).toBe(200);
    const genel = await h.agent().get(`/api/boards/${boards['Genel Sohbet']}`);
    const stub = genel.body.topics.items.find((x: { isMoved: boolean; movedToTopicId: number }) => x.isMoved && x.movedToTopicId === a.topicId);
    expect(stub).toBeTruthy();
    const followed = await h.agent().get(`/api/topics/${stub.id}`);
    expect(followed.body.topic.id).toBe(a.topicId);

    const b = await newTopic(ayse, boards['Konu Dışı']!, 'Birleşecek konu', 'b içeriği');
    const merged = await admin.post(`/api/mod/topics/${b.topicId}/merge`, { targetTopicId: a.topicId });
    expect(merged.status).toBe(200);
    const page = await h.agent().get(`/api/topics/${a.topicId}`);
    expect(page.body.topic.replyCount).toBe(1);
    expect(page.body.posts.items.map((p: { html: string }) => p.html)).toContain('b içeriği');
  });

  it('holds posts for approval when required', async () => {
    const tree = await admin.get('/api/admin/forum');
    const b = tree.body.categories.flatMap((c: { boards: unknown[] }) => c.boards).find((x: { id: number }) => x.id === boards['Tanışma']);
    await admin.put(`/api/admin/forum/boards/${b.id}`, {
      categoryId: b.categoryId,
      name: b.name,
      description: b.description,
      icon: { kind: b.icon.kind, name: b.icon.name, color: b.icon.color },
      requireApprovalPosts: true,
    });
    const t = await newTopic(admin, boards['Tanışma']!, 'Onay testi');
    const before = await postCount('Ali');
    const r = await ali.post(`/api/topics/${t.topicId}/posts`, { body: 'onay bekliyor' });
    expect(r.body.approved).toBe(false);
    expect(await postCount('Ali')).toBe(before);
    let guestView = await h.agent().get(`/api/topics/${t.topicId}`);
    expect(guestView.body.posts.items).toHaveLength(1);
    const own = await ali.get(`/api/topics/${t.topicId}`);
    expect(own.body.posts.items).toHaveLength(2);
    expect((await admin.post(`/api/posts/${r.body.postId}/approve`)).status).toBe(200);
    guestView = await h.agent().get(`/api/topics/${t.topicId}`);
    expect(guestView.body.posts.items).toHaveLength(2);
    expect(await postCount('Ali')).toBe(before + 1);
    const notes = await ali.get('/api/me/notifications');
    expect(notes.body.items.map((n: { type: string }) => n.type)).toContain('forum.postApproved');
  });

  it('refuses to delete a board with topics unless they are moved', async () => {
    const tree = await admin.get('/api/admin/forum');
    const cat = tree.body.categories.find((c: { name: string }) => c.name === 'Özel');
    const zeynep = await registerActive(h, 'Zeynep');
    await newTopic(zeynep, secretBoard, 'Üye odası konusu');
    const res = await admin.delete(`/api/admin/forum/boards/${secretBoard}`);
    expect(res.status).toBe(422);
    const ok = await admin.delete(`/api/admin/forum/boards/${secretBoard}?moveTopicsTo=${boards['Konu Dışı']}`);
    expect(ok.status).toBe(200);
    expect((await admin.delete(`/api/admin/forum/categories/${cat.id}`)).status).toBe(200);
  });
});

describe('embeds', () => {
  it('auto-embeds links and re-renders posts when embed settings change', async () => {
    const dj = await registerActive(h, 'Djmuzik');
    const t = await newTopic(dj, boards['Konu Dışı']!, 'Müzik önerisi', 'Dinleyin:\nhttps://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
    let page = await h.agent().get(`/api/topics/${t.topicId}`);
    expect(page.body.posts.items[0].html).toContain('https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT');

    const current = await admin.get('/api/admin/embeds');
    expect(current.body.providers.some((p: { key: string }) => p.key === 'spotify')).toBe(true);
    const test = await admin.post('/api/admin/embeds/test', { url: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(test.body.match.provider).toBe('youtube');

    const bad = await admin.put('/api/admin/embeds', { ...current.body, providers: undefined, custom: [{ key: 'x', name: 'X', pattern: '(', template: 'https://a.b/$1', ratio: '16/9' }] });
    expect(bad.status).toBe(422);

    const res = await admin.put('/api/admin/embeds', {
      enabled: true,
      autoEmbed: true,
      clickToLoad: false,
      disabledProviders: ['spotify'],
      custom: [],
    });
    expect(res.body).toMatchObject({ ok: true });
    await h.jobs.drain(100);
    page = await h.agent().get(`/api/topics/${t.topicId}`);
    expect(page.body.posts.items[0].html).not.toContain('<iframe');
    expect(page.body.posts.items[0].html).toContain('<a href="https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"');
  });
});
