import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';
import { GroupCacheService } from '../groups/group-cache.service.js';

let h: Harness;
let admin: Agent;
let user: Agent;
let staff: Agent;
let other: Agent;
let staffGroup: number;

beforeAll(async () => {
  h = await createHarness();
  admin = await adminAgent(h);
  user = await registerActive(h, 'Ahmet');
  staff = await registerActive(h, 'Burak');
  other = await registerActive(h, 'Cemre');
  staffGroup = (await admin.post('/api/admin/groups', { name: 'Destek ekibi', kind: 'regular' })).body.id;
  await h.app.get(GroupCacheService).invalidate();
  const staffId = (await h.db.q.selectFrom('users').select('id').where('username', '=', 'Burak').executeTakeFirstOrThrow()).id;
  await admin.post(`/api/admin/groups/${staffGroup}/members`, { userId: staffId, asPrimary: false, expiresAt: null });
});

afterAll(async () => {
  await h.close();
});

describe('plugins', () => {
  it('turns plugin endpoints off and on', async () => {
    const list = (await admin.get('/api/admin/plugins')).body.items;
    expect(list.map((p: { key: string }) => p.key)).toEqual(['landing', 'wiki', 'applications', 'tickets', 'shoutbox', 'discord']);
    // Sonradan eklenen eklentiler kapalı başlar
    expect(list.filter((p: { enabled: boolean }) => !p.enabled).map((p: { key: string }) => p.key)).toEqual(['shoutbox', 'discord']);
    expect((await user.put('/api/admin/plugins/wiki', { enabled: false })).status).toBe(403);
    expect((await admin.put('/api/admin/plugins/wiki', { enabled: false })).status).toBe(200);
    expect((await h.agent().get('/api/wiki')).status).toBe(404);
    await admin.put('/api/admin/plugins/wiki', { enabled: true });
    expect((await h.agent().get('/api/wiki')).status).toBe(200);
  });
});

describe('tickets', () => {
  it('seeds default categories and routes tickets to the handler group', async () => {
    const cats = (await user.get('/api/tickets/categories')).body;
    expect(cats.length).toBeGreaterThanOrEqual(4);
    // Genel destek kategorisini destek ekibine bağla
    const admCats = (await admin.get('/api/admin/ticket-categories')).body.items;
    const general = admCats[0];
    await admin.put(`/api/admin/ticket-categories/${general.id}`, { ...general, handlerGroupIds: [staffGroup] });

    const bad = await user.post('/api/tickets', { categoryId: general.id, subject: 'x', body: 'kısa' });
    expect(bad.status).toBe(422);
    const t = await user.post('/api/tickets', { categoryId: general.id, subject: 'Giriş yapamıyorum', body: 'Şifremi sıfırladım ama giriş olmuyor.', priority: 'urgent' });
    expect(t.status).toBe(201);

    // Sorumlu grup görür, başkası göremez
    const desk = (await staff.get('/api/tickets/desk')).body;
    expect(desk.items.map((i: { id: number }) => i.id)).toContain(t.body.id);
    expect(desk.items[0].priority).toBe('high'); // üye "acil" seçemez
    expect((await other.get(`/api/tickets/${t.body.id}`)).status).toBe(404);
    expect((await other.get('/api/tickets/desk')).status).toBe(403);

    // Yetkili yanıtı: durum "Yanıtlandı", talep yanıtlayana atanır; iç not üyeye görünmez
    await staff.post(`/api/tickets/${t.body.id}/messages`, { body: 'Ekip içi: hesabı kontrol et', internal: true });
    await staff.post(`/api/tickets/${t.body.id}/messages`, { body: 'Hesabınızı kontrol ettik, tekrar dener misiniz?' });
    const mine = (await user.get(`/api/tickets/${t.body.id}`)).body;
    expect(mine.status).toBe('answered');
    expect(mine.assignee.username).toBe('Burak');
    expect(mine.messages).toHaveLength(2);
    expect(mine.canManage).toBe(false);
    expect((await staff.get(`/api/tickets/${t.body.id}`)).body.messages).toHaveLength(3);

    await user.post(`/api/tickets/${t.body.id}/messages`, { body: 'Oldu, teşekkürler!' });
    expect((await user.get(`/api/tickets/${t.body.id}`)).body.status).toBe('customer_reply');

    // Üye yalnızca kapatabilir; önceliği değiştiremez
    expect((await user.patch(`/api/tickets/${t.body.id}`, { priority: 'low' })).status).toBe(403);
    expect((await user.patch(`/api/tickets/${t.body.id}`, { status: 'closed' })).status).toBe(200);
    const closed = (await user.get(`/api/tickets/${t.body.id}`)).body;
    expect(closed).toMatchObject({ status: 'closed', canReply: false, canReopen: true });
    expect((await user.post(`/api/tickets/${t.body.id}/messages`, { body: 'ek' })).status).toBe(403);

    // Kategoriden sorumlu olmayan birine atanamaz
    const otherId = (await h.db.q.selectFrom('users').select('id').where('username', '=', 'Cemre').executeTakeFirstOrThrow()).id;
    expect((await staff.patch(`/api/tickets/${t.body.id}`, { assigneeId: otherId })).status).toBe(422);
  });
});
