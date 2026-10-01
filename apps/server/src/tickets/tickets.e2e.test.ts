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
    expect(list.map((p: { key: string }) => p.key)).toEqual(['landing', 'wiki', 'applications', 'tickets', 'discord']);
    // Sonradan eklenen eklentiler kapalı başlar
    expect(list.filter((p: { enabled: boolean }) => !p.enabled).map((p: { key: string }) => p.key)).toEqual(['discord']);
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

describe('automatic assignment', () => {
  it('assigns new tickets in turn, by load or to a fixed staff member', async () => {
    // İkinci yetkili
    const ikinci = await registerActive(h, 'Deniz');
    const ids = Object.fromEntries((await h.db.q.selectFrom('users').select(['id', 'username']).where('username', 'in', ['Burak', 'Deniz', 'Ahmet']).execute()).map((u) => [u.username, u.id])) as Record<'Burak' | 'Deniz' | 'Ahmet', number>;
    await admin.post(`/api/admin/groups/${staffGroup}/members`, { userId: ids.Deniz, asPrimary: false, expiresAt: null });
    await h.app.get(GroupCacheService).invalidate();
    const cats = (await admin.get('/api/admin/ticket-categories')).body.items as Array<Record<string, unknown> & { id: number; name: string }>;
    const cat = cats[1]!;
    const save = (patch: Record<string, unknown>) => {
      const { id: _id, openCount: _o, totalCount: _t, autoAssignUser: _u, ...rest } = cat;
      return admin.put(`/api/admin/ticket-categories/${cat.id}`, { ...rest, handlerGroupIds: [staffGroup], ...patch });
    };
    const open = async (subject: string) => {
      await h.db.q.updateTable('tickets').set({ status: 'closed' }).where('user_id', '=', ids.Ahmet).execute();
      const r = await user.post('/api/tickets', { categoryId: cat.id, subject, body: 'Ayrıntılı bir açıklama metni.' });
      expect(r.status).toBe(201);
      return (await h.db.q.selectFrom('tickets').select('assignee_id').where('id', '=', r.body.id).executeTakeFirstOrThrow()).assignee_id;
    };

    expect((await save({ autoAssign: 'none' })).status).toBe(200);
    expect(await open('Atamasız')).toBeNull();

    await save({ autoAssign: 'round_robin' });
    const a = await open('Sıra 1');
    const b = await open('Sıra 2');
    const c = await open('Sıra 3');
    expect(new Set([a, b])).toEqual(new Set([ids.Burak, ids.Deniz]));
    expect(c).toBe(a);

    // En az yük: Deniz'in açık talebi yokken ona gider
    await h.db.q.updateTable('tickets').set({ status: 'open', assignee_id: ids.Burak }).where('assignee_id', '=', ids.Deniz).execute();
    await h.db.q.updateTable('tickets').set({ status: 'open' }).where('assignee_id', '=', ids.Burak).execute();
    await save({ autoAssign: 'least_open' });
    const before = await h.db.q.selectFrom('tickets').select('id').where('user_id', '=', ids.Ahmet).execute();
    await h.db.q.updateTable('tickets').set({ user_id: ids.Burak }).where('id', 'in', before.map((x) => x.id)).execute();
    expect(await open('Yük')).toBe(ids.Deniz);

    expect((await save({ autoAssign: 'fixed', autoAssignUserId: null })).status).toBe(422);
    expect((await save({ autoAssign: 'fixed', autoAssignUserId: ids.Ahmet })).status).toBe(422);
    const cands = await admin.get(`/api/admin/ticket-categories/handlers?groups=${staffGroup}`);
    expect(cands.body.items.map((u: { id: number }) => u.id).sort()).toEqual([ids.Burak, ids.Deniz].sort());
    await save({ autoAssign: 'fixed', autoAssignUserId: ids.Burak });
    const listed = (await admin.get('/api/admin/ticket-categories')).body.items.find((x: { id: number }) => x.id === cat.id);
    expect(listed.autoAssignUser.id).toBe(ids.Burak);
    expect(await open('Sabit')).toBe(ids.Burak);
    // Sorumlu yetkili bildirimi alır
    const notes = await h.db.q.selectFrom('notifications').select(['user_id', 'data_json']).where('type', '=', 'ticket.new').execute();
    const sabit = notes.filter((n) => String(n.data_json).includes('Sabit'));
    expect(sabit.map((n) => n.user_id)).toEqual([ids.Burak]);
    expect(ikinci).toBeTruthy();
  });
});
