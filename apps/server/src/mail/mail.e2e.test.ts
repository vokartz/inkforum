import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let admin: Agent;
let chat: number;

beforeAll(async () => {
  h = await createHarness();
  await h.settings.set('forum.floodSeconds', 0);
  admin = await adminAgent(h);
  const index = await h.agent().get('/api/forum');
  for (const c of index.body.categories) for (const b of c.boards) if (b.name === 'Genel Sohbet') chat = b.id;
});

afterAll(async () => {
  await h.close();
});

const verify = (username: string) => h.db.q.updateTable('users').set({ email_verified_at: Date.now() }).where('username', '=', username).execute();

describe('mail templates', () => {
  it('lists, previews, customises and resets templates', async () => {
    const list = await admin.get('/api/admin/mail/templates');
    expect(list.status).toBe(200);
    expect(list.body.items.map((t: { key: string }) => t.key)).toContain('welcome');

    const preview = await admin.post('/api/admin/mail/templates/welcome/preview', { subject: 'Selam {{name}}', body: '<p>Merhaba <b>{{name}}</b> <a class="button" href="{{url}}">Git</a></p>' });
    expect(preview.status).toBe(200);
    expect(preview.body.subject).toBe('Selam admin');
    expect(preview.body.html).toContain('style="display:inline-block');
    expect(preview.body.text).toContain('Git: http://forum.test');

    const save = await admin.put('/api/admin/mail/templates/welcome', { subject: '{{forumName}} ailesine katıldın {{name}}', body: '<p>Hoş geldin {{name}} &amp; <script>x</script></p>' });
    expect(save.status).toBe(200);
    await registerActive(h, 'Yeniuye');
    await h.jobs.drain();
    const mail = h.mail.lastTo('yeniuye@forum.test');
    expect(mail?.subject).toBe('Forum ailesine katıldın Yeniuye');

    const bad = await admin.put('/api/admin/mail/templates/bilinmeyen', { subject: 'x', body: 'y' });
    expect(bad.status).toBe(422);
    expect((await admin.delete('/api/admin/mail/templates/welcome')).status).toBe(200);
    const after = (await admin.get('/api/admin/mail/templates')).body.items.find((t: { key: string }) => t.key === 'welcome');
    expect(after.isCustom).toBe(false);
  });
});

describe('notification emails', () => {
  it('emails quoted members and followers once per unread topic, respecting preferences', async () => {
    const a = await registerActive(h, 'Yazar');
    const b = await registerActive(h, 'Okur');
    await verify('Yazar');
    await verify('Okur');
    const t = await a.post(`/api/boards/${chat}/topics`, { title: 'E-posta konusu', body: 'ilk mesaj' });
    await b.put(`/api/topics/${t.body.topicId}/subscription`, { on: true });
    await h.jobs.drain();
    h.mail.outbox.length = 0;

    await a.post(`/api/topics/${t.body.topicId}/posts`, { body: 'birinci yanıt' });
    await a.post(`/api/topics/${t.body.topicId}/posts`, { body: 'ikinci yanıt' });
    await h.jobs.drain();
    const toOkur = h.mail.outbox.filter((m) => m.to === 'okur@forum.test');
    expect(toOkur).toHaveLength(1);
    expect(toOkur[0]!.subject).toBe('Yeni yanıt: E-posta konusu');

    const prefs = (await b.get('/api/me/notifications/preferences')).body as Array<{ type: string; email: boolean | null }>;
    expect(prefs.find((p) => p.type === 'message.new')?.email).toBe(true);
    await b.put('/api/me/notifications/preferences', { 'email:forum.quote': false });
    const quote = (await b.get(`/api/posts/${t.body.postId}/quote`)).body.bbcode;
    h.mail.outbox.length = 0;
    await b.post(`/api/topics/${t.body.topicId}/posts`, { body: `${quote} katılıyorum` });
    await a.put('/api/me/notifications/preferences', { 'email:forum.quote': false });
    await h.jobs.drain();
    expect(h.mail.outbox.some((m) => m.to === 'yazar@forum.test' && m.subject.includes('alıntıladı'))).toBe(true);

    h.mail.outbox.length = 0;
    const users = (await a.get('/api/members?perPage=50')).body.items.map((i: { user: { id: number; username: string } }) => i.user);
    const okurId = users.find((u: { username: string }) => u.username === 'Okur').id;
    const conv = await a.post('/api/messages', { recipientIds: [okurId], body: 'merhaba' });
    expect(conv.status).toBe(201);
    await h.settings.set('messages.floodSeconds', 0);
    await a.post(`/api/messages/${conv.body.id}`, { body: 'orada mısın?' });
    await h.jobs.drain();
    expect(h.mail.outbox.filter((m) => m.to === 'okur@forum.test')).toHaveLength(1);
  });
});

describe('mail transport settings', () => {
  it('stores SMTP settings with an encrypted password and verifies connections', async () => {
    const start = (await admin.get('/api/admin/mail/transport')).body;
    expect(start).toMatchObject({ driver: 'env', effectiveDriver: 'log', hasPassword: false });

    const bad = await admin.put('/api/admin/mail/transport', { driver: 'smtp', host: 'bad host', port: 587 });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.host).toBeTruthy();

    const saved = await admin.put('/api/admin/mail/transport', { driver: 'smtp', host: '127.0.0.1', port: 1, security: 'none', user: 'u@forum.test', password: 'gizli-sifre' });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ driver: 'smtp', effectiveDriver: 'smtp', hasPassword: true });
    expect(JSON.stringify(saved.body)).not.toContain('gizli-sifre');
    const stored = h.settings.get('mail.transport') as { passwordEnc: string };
    expect(stored.passwordEnc).toMatch(/^v1\./);

    const again = await admin.put('/api/admin/mail/transport', { driver: 'smtp', host: '127.0.0.1', port: 1, security: 'none', user: 'u@forum.test' });
    expect(again.body.hasPassword).toBe(true);

    const fail = await admin.post('/api/admin/mail/transport/verify', { driver: 'smtp', host: '127.0.0.1', port: 1, security: 'none', user: '' });
    expect(fail.status).toBe(200);
    expect(fail.body.ok).toBe(false);
    expect(fail.body.message).toContain('bağlanılamadı');

    const log = await admin.post('/api/admin/mail/transport/verify', { driver: 'log' });
    expect(log.body.ok).toBe(true);

    await admin.put('/api/admin/mail/transport', { driver: 'env' });
    expect((await admin.get('/api/admin/mail/transport')).body.effectiveDriver).toBe('log');
  });
});
