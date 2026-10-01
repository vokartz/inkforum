import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let ali: Agent;
let veli: Agent;
let ayse: Agent;
const ids: Record<string, number> = {};

beforeAll(async () => {
  h = await createHarness();
  await h.settings.set('messages.floodSeconds', 0);
  ali = await registerActive(h, 'MesajAli');
  veli = await registerActive(h, 'MesajVeli');
  ayse = await registerActive(h, 'MesajAyse');
  for (const n of ['MesajAli', 'MesajVeli', 'MesajAyse']) {
    ids[n] = (await h.db.q.selectFrom('users').select('id').where('username', '=', n).executeTakeFirstOrThrow()).id;
  }
});

afterAll(async () => {
  await h.close();
});

describe('private messages', () => {
  let convId: number;

  it('starts a conversation and counts it as unread for the recipient', async () => {
    const res = await ali.post('/api/messages', { recipientIds: [ids.MesajVeli], title: 'Merhaba', body: 'Selam Veli 👋' });
    expect(res.status).toBe(201);
    convId = res.body.id;

    const me = await veli.get('/api/auth/me');
    expect(me.body.user.unreadMessages).toBe(1);
    const list = await veli.get('/api/messages');
    expect(list.body.items[0]).toMatchObject({ id: convId, title: 'Merhaba', unread: true, participantCount: 2 });
    expect(list.body.items[0].participants[0].username).toBe('MesajAli');
    // Gönderen için okunmamış değil
    expect((await ali.get('/api/me/counters')).body).toEqual({ notifications: 0, messages: 0 });
  });

  it('marks read on open and allows replies', async () => {
    const detail = await veli.get(`/api/messages/${convId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.messages.items[0]).toMatchObject({ isMine: false, authorName: 'MesajAli' });
    expect(detail.body.messages.items[0].html).toContain('/emoji/');
    expect((await veli.get('/api/me/counters')).body.messages).toBe(0);

    const reply = await veli.post(`/api/messages/${convId}`, { body: 'Aleykümselam!' });
    expect(reply.status).toBe(201);
    expect((await ali.get('/api/me/counters')).body.messages).toBe(1);
    // Katılımcı olmayan göremez
    expect((await ayse.get(`/api/messages/${convId}`)).status).toBe(404);
    expect((await ayse.post(`/api/messages/${convId}`, { body: 'x' })).status).toBe(404);
  });

  it('respects the "no messages" privacy setting and self-messages', async () => {
    expect((await ali.post('/api/messages', { recipientIds: [ids.MesajAli], body: 'kendime' })).status).toBe(422);
    const privacy = await ayse.put('/api/me/privacy', { showOnline: true, birthdateVisibility: 'day_month', profileVisibility: 'everyone', showAchievements: true, allowMessages: 'nobody' });
    expect(privacy.status).toBe(200);
    const res = await ali.post('/api/messages', { recipientIds: [ids.MesajAyse], body: 'Selam' });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('kabul etmiyor');
  });

  it('lets the starter invite, and deletes the conversation when everyone leaves', async () => {
    await ayse.put('/api/me/privacy', { showOnline: true, birthdateVisibility: 'day_month', profileVisibility: 'everyone', showAchievements: true, allowMessages: 'everyone' });
    expect((await veli.post(`/api/messages/${convId}/invite`, { userIds: [ids.MesajAyse] })).status).toBe(403);
    expect((await ali.post(`/api/messages/${convId}/invite`, { userIds: [ids.MesajAyse] })).status).toBe(200);
    expect((await ayse.get(`/api/messages/${convId}`)).status).toBe(200);

    for (const a of [ali, veli, ayse]) expect((await a.post(`/api/messages/${convId}/leave`)).status).toBe(200);
    const left = await h.db.q.selectFrom('conversations').select('id').where('id', '=', convId).executeTakeFirst();
    expect(left).toBeUndefined();
  });

  it('blocks guests and honours the global switch', async () => {
    expect((await h.agent().get('/api/messages')).status).toBe(401);
    await h.settings.set('messages.enabled', false);
    const res = await ali.post('/api/messages', { recipientIds: [ids.MesajVeli], body: 'kapalı' });
    expect(res.status).toBe(403);
    await h.settings.set('messages.enabled', true);
  });
});
