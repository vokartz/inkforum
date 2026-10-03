import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let admin: Agent;
let ali: Agent;
let ayse: Agent;
let postId: number;
let topicId: number;

const reputation = async (username: string) =>
  (await h.db.q.selectFrom('users').select('reputation').where('username', '=', username).executeTakeFirstOrThrow()).reputation;

beforeAll(async () => {
  h = await createHarness();
  await h.settings.set('forum.floodSeconds', 0);
  admin = await adminAgent(h);
  ali = await registerActive(h, 'Tepkici');
  ayse = await registerActive(h, 'Yazar');
  const index = await h.agent().get('/api/forum');
  const board = index.body.categories.flatMap((c: { boards: Array<{ id: number; name: string }> }) => c.boards).find((b: { name: string }) => b.name === 'Genel Sohbet');
  const t = await ayse.post(`/api/boards/${board.id}/topics`, { title: 'Tepki konusu', body: 'Bunu beğenin 😀' });
  postId = t.body.postId;
  topicId = t.body.topicId;
});

afterAll(async () => {
  await h.close();
});

describe('reactions', () => {
  it('seeds a default set and exposes it on the topic page', async () => {
    const page = await ali.get(`/api/topics/${topicId}`);
    expect(page.status).toBe(200);
    expect(page.body.reactions.map((r: { key: string }) => r.key)).toContain('like');
    expect(page.body.posts.items[0]).toMatchObject({ reactions: [], myReaction: null, can: { react: true } });
    expect(page.body.posts.items[0].html).toContain('/emoji/1f600.svg');
  });

  it('reacts, switches, toggles off and tracks reputation', async () => {
    const page = await ali.get(`/api/topics/${topicId}`);
    const like = page.body.reactions.find((r: { key: string }) => r.key === 'like');
    const sad = page.body.reactions.find((r: { key: string }) => r.key === 'sad');

    let res = await ali.put(`/api/posts/${postId}/reaction`, { reactionId: like.id });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reactions: [{ reactionId: like.id, count: 1 }], myReaction: like.id });
    expect(await reputation('Yazar')).toBe(1);

    res = await ali.put(`/api/posts/${postId}/reaction`, { reactionId: sad.id });
    expect(res.body.myReaction).toBe(sad.id);
    expect(await reputation('Yazar')).toBe(0);

    res = await ali.put(`/api/posts/${postId}/reaction`, { reactionId: sad.id });
    expect(res.body).toEqual({ reactions: [], myReaction: null });

    await ali.put(`/api/posts/${postId}/reaction`, { reactionId: like.id });
    const who = await h.agent().get(`/api/posts/${postId}/reactions`);
    expect(who.body[0]).toMatchObject({ reactionId: like.id, user: { username: 'Tepkici' } });

    const notes = await ayse.get('/api/me/notifications');
    expect(notes.body.items.some((n: { type: string }) => n.type === 'forum.reaction')).toBe(true);
  });

  it('rejects self reactions, guests and disabled reactions', async () => {
    const page = await ayse.get(`/api/topics/${topicId}`);
    const like = page.body.reactions[0];
    expect((await ayse.put(`/api/posts/${postId}/reaction`, { reactionId: like.id })).status).toBe(400);
    expect((await h.agent().put(`/api/posts/${postId}/reaction`, { reactionId: like.id })).status).toBe(401);
    expect((await ali.put(`/api/posts/${postId}/reaction`, { reactionId: 99999 })).status).toBe(400);
  });

  it('lets admins edit the reaction set', async () => {
    const list = await admin.get('/api/admin/forum/reactions');
    expect(list.status).toBe(200);
    const items = list.body.items.map(({ uses: _u, ...r }: { uses: number }) => r);
    const bad = await admin.put('/api/admin/forum/reactions', { items: [{ key: 'x', label: 'X', emoji: 'abc' }] });
    expect(bad.status).toBe(422);
    const res = await admin.put('/api/admin/forum/reactions', { items: [...items.slice(0, 2), { key: 'party', label: 'Kutlama', emoji: '🎉', points: 2 }] });
    expect(res.status).toBe(200);
    const after = await admin.get('/api/admin/forum/reactions');
    const keys = after.body.items.filter((r: { isEnabled: boolean }) => r.isEnabled).map((r: { key: string }) => r.key);
    expect(keys).toEqual(['like', 'love', 'party']);
    expect(after.body.items.find((r: { key: string }) => r.key === 'like')).toBeTruthy();
    expect((await ali.put('/api/admin/forum/reactions', { items })).status).toBe(403);
  });
});
