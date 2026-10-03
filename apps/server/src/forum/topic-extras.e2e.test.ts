import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';
import { TopicViewsService } from './topic-views.service.js';

let h: Harness;
let admin: Agent;
let ali: Agent;
let ayse: Agent;
let chat: number;

beforeAll(async () => {
  h = await createHarness();
  await h.settings.set('forum.floodSeconds', 0);
  admin = await adminAgent(h);
  ali = await registerActive(h, 'Ali');
  ayse = await registerActive(h, 'Ayse');
  const index = await h.agent().get('/api/forum');
  for (const c of index.body.categories) for (const b of c.boards) if (b.name === 'Genel Sohbet') chat = b.id;
});

afterAll(async () => {
  await h.close();
});

describe('tags', () => {
  it('creates, normalises and lists tags on topics', async () => {
    const res = await ali.post(`/api/boards/${chat}/topics`, { title: 'Etiketli konu', body: 'Merhaba', tags: ['Oyun', 'oyun', 'Rol Yapma', 'Şehir'] });
    expect(res.status).toBe(201);
    const page = (await h.agent().get(`/api/topics/${res.body.topicId}`)).body;
    expect(page.tags.map((t: { slug: string }) => t.slug).sort()).toEqual(['oyun', 'rol-yapma', 'sehir']);
    expect(page.subscribed).toBe(false);
    expect((await ali.get(`/api/topics/${res.body.topicId}`)).body.subscribed).toBe(true);

    const board = (await h.agent().get(`/api/boards/${chat}`)).body;
    expect(board.topics.items[0].tags).toHaveLength(3);

    const tagPage = await h.agent().get('/api/tags/oyun');
    expect(tagPage.body.tag).toMatchObject({ name: 'Oyun', topicCount: 1 });
    expect(tagPage.body.topics.items[0].title).toBe('Etiketli konu');
    expect(tagPage.body.related.map((t: { slug: string }) => t.slug).sort()).toEqual(['rol-yapma', 'sehir']);

    const suggest = await h.agent().get('/api/tags?q=ro');
    expect(suggest.body.map((t: { slug: string }) => t.slug)).toEqual(['rol-yapma']);

    const tooMany = await ali.post(`/api/boards/${chat}/topics`, { title: 'Çok etiket', body: 'x', tags: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'] });
    expect(tooMany.status).toBe(422);

    const edit = await ali.put(`/api/posts/${res.body.postId}`, { body: 'Merhaba', tags: ['Oyun'] });
    expect(edit.status).toBe(200);
    const after = (await h.agent().get('/api/tags/sehir')).body;
    expect(after.tag.topicCount).toBe(0);
  });

  it('respects the allow-new setting and lets admins merge tags', async () => {
    await h.settings.set('forum.tagsAllowNew', false);
    const res = await ayse.post(`/api/boards/${chat}/topics`, { title: 'Yeni etiket', body: 'x', tags: ['hiçyok'] });
    expect(res.status).toBe(422);
    const ok = await ayse.post(`/api/boards/${chat}/topics`, { title: 'Var olan etiket', body: 'x', tags: ['oyun'] });
    expect(ok.status).toBe(201);
    await h.settings.set('forum.tagsAllowNew', true);

    const list = (await admin.get('/api/admin/tags')).body;
    const rp = list.items.find((t: { slug: string }) => t.slug === 'rol-yapma');
    const merged = await admin.put(`/api/admin/tags/${rp.id}`, { name: 'oyun', color: '#16a34a', isOfficial: true });
    expect(merged.status).toBe(200);
    expect(merged.body).toMatchObject({ slug: 'oyun', isOfficial: true, color: '#16a34a' });
    expect((await h.agent().get('/api/tags/rol-yapma')).status).toBe(404);
  });
});

describe('polls', () => {
  it('creates a poll with the topic and records votes', async () => {
    const res = await ali.post(`/api/boards/${chat}/topics`, {
      title: 'Anketli konu',
      body: 'Oy verin',
      poll: { question: 'Hangisi?', options: ['Kırmızı', 'Mavi', 'Yeşil'], maxChoices: 2, publicVotes: true, showResults: 'after_vote' },
    });
    expect(res.status).toBe(201);
    const id = res.body.topicId;

    const guest = (await h.agent().get(`/api/topics/${id}`)).body.poll;
    expect(guest).toMatchObject({ question: 'Hangisi?', maxChoices: 2, can: { vote: false, seeResults: false } });
    expect(guest.options.every((o: { votes: null }) => o.votes === null)).toBe(true);

    const before = (await ayse.get(`/api/topics/${id}`)).body.poll;
    expect(before.can.vote).toBe(true);
    const [red, blue, green] = before.options.map((o: { id: number }) => o.id);

    const tooMany = await ayse.post(`/api/topics/${id}/poll/vote`, { optionIds: [red, blue, green] });
    expect(tooMany.status).toBe(422);
    const voted = await ayse.post(`/api/topics/${id}/poll/vote`, { optionIds: [red, blue] });
    expect(voted.status).toBe(200);
    expect(voted.body).toMatchObject({ voterCount: 1, myVotes: [red, blue], can: { seeResults: true } });

    const changed = await ayse.post(`/api/topics/${id}/poll/vote`, { optionIds: [green] });
    expect(changed.body.voterCount).toBe(1);
    expect(changed.body.options.map((o: { votes: number }) => o.votes)).toEqual([0, 0, 1]);

    const voters = await ali.get(`/api/topics/${id}/poll/voters`);
    expect(voters.body).toHaveLength(1);
    expect(voters.body[0]).toMatchObject({ optionId: green, user: { username: 'Ayse' } });

    const closed = await ali.post(`/api/topics/${id}/poll/close`, { closed: true });
    expect(closed.body.closed).toBe(true);
    expect((await ayse.post(`/api/topics/${id}/poll/vote`, { optionIds: [red] })).status).toBe(400);
    expect((await ayse.post(`/api/topics/${id}/poll/close`, { closed: false })).status).toBe(403);
  });

  it('validates poll input', async () => {
    const one = await ali.post(`/api/boards/${chat}/topics`, { title: 'Tek seçenek', body: 'x', poll: { question: 'Soru?', options: ['Tek'] } });
    expect(one.status).toBe(422);
    const dup = await ali.post(`/api/boards/${chat}/topics`, { title: 'Aynı', body: 'x', poll: { question: 'Soru?', options: ['A', 'a'] } });
    expect(dup.status).toBe(422);
  });
});

describe('subscriptions and view logging', () => {
  it('notifies subscribers of new replies and logs viewers', async () => {
    const t = await ali.post(`/api/boards/${chat}/topics`, { title: 'Takip edilen konu', body: 'x' });
    const id = t.body.topicId;
    await ayse.put(`/api/topics/${id}/subscription`, { on: true });
    await admin.post(`/api/topics/${id}/posts`, { body: 'Yanıt' });
    await new Promise((r) => setTimeout(r, 50));
    const types = async (a: Agent) => ((await a.get('/api/me/notifications')).body.items as Array<{ type: string }>).map((n) => n.type);
    expect(await types(ali)).toContain('forum.reply');
    expect(await types(ayse)).toContain('forum.reply');

    await ayse.put(`/api/topics/${id}/subscription`, { on: false });
    expect((await ayse.get(`/api/topics/${id}`)).body.subscribed).toBe(false);

    await ayse.get(`/api/topics/${id}`);
    await h.app.get(TopicViewsService).flush();
    expect((await ayse.get(`/api/topics/${id}/viewers`)).status).toBe(403);
    const log = await admin.get(`/api/topics/${id}/viewers`);
    expect(log.status).toBe(200);
    const row = log.body.items.find((i: { user: { username: string } }) => i.user.username === 'Ayse');
    expect(row.views).toBeGreaterThanOrEqual(2);
  });
});

describe('advanced search and related topics', () => {
  it('filters by tag, author, type and title', async () => {
    const a = await ali.post(`/api/boards/${chat}/topics`, { title: 'Harita önerileri', body: 'Yeni şehir haritası için fikirler: liman bölgesi', tags: ['harita', 'oyun'] });
    await ayse.post(`/api/topics/${a.body.topicId}/posts`, { body: 'Liman bölgesine bir deniz feneri eklenmeli' });

    const byTag = await h.agent().get('/api/search?tag=harita');
    expect(byTag.body.topics.map((t: { title: string }) => t.title)).toEqual(['Harita önerileri']);
    expect(byTag.body.topics[0].tags.map((t: { slug: string }) => t.slug).sort()).toEqual(['harita', 'oyun']);

    const body = await h.agent().get('/api/search?q=liman');
    expect(body.body.topics[0]).toMatchObject({ title: 'Harita önerileri' });
    expect(body.body.topics[0].excerpt).toContain('liman');
    const titleOnly = await h.agent().get('/api/search?q=liman&titleOnly=1');
    expect(titleOnly.body.total).toBe(0);

    const posts = await h.agent().get('/api/search?q=feneri&type=posts');
    expect(posts.body.posts).toHaveLength(1);
    expect(posts.body.posts[0]).toMatchObject({ topicTitle: 'Harita önerileri', authorName: 'Ayse', isFirst: false });

    const byAuthor = await h.agent().get('/api/search?type=posts&author=Ayse&q=liman');
    expect(byAuthor.body.posts).toHaveLength(1);
    expect((await h.agent().get('/api/search?author=yokboyleuye')).body.total).toBe(0);
    expect((await h.agent().get('/api/search?q=a')).body.total).toBe(0);

    const related = await ali.get(`/api/topics/${a.body.topicId}/related`);
    expect(related.status).toBe(200);
    expect(related.body.similar[0].tags.some((t: { slug: string }) => t.slug === 'oyun')).toBe(true);
    expect(related.body.similar.every((t: { id: number }) => t.id !== a.body.topicId)).toBe(true);
  });
});
