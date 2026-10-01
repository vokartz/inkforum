import { createHash, createHmac } from 'node:crypto';
import { requiredScope } from '../auth/token-auth.service.js';
import { isPrivateAddress } from '../security/safe-fetch.js';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let admin: Agent;
let ali: Agent;
let chat: number;

/** Tarayıcı olmayan istemci: çerez ya da Origin göndermez. */
const raw = () => request(h.app.getHttpServer());

beforeAll(async () => {
  h = await createHarness();
  await h.settings.set('forum.floodSeconds', 0);
  admin = await adminAgent(h);
  ali = await registerActive(h, 'Ali');
  const index = await h.agent().get('/api/forum');
  for (const c of index.body.categories) for (const b of c.boards) if (b.name === 'Genel Sohbet') chat = b.id;
});

afterAll(async () => {
  await h.close();
});

const b64 = (s: string) => Buffer.from(s).toString('base64');

describe('OAuth 2.0 provider', () => {
  let clientId = '';
  let secret = '';

  it('lets admins register apps and members authorize them', async () => {
    const res = await admin.post('/api/admin/developers/clients', {
      name: 'Oyun UCP',
      redirectUris: ['https://ucp.test/callback'],
      scopes: ['profile', 'email', 'read', 'write', 'admin'],
    });
    expect(res.status).toBe(201);
    expect(res.body.client.scopes).toEqual(['profile', 'email', 'read', 'write']); // admin OAuth'a verilemez
    clientId = res.body.client.clientId;
    secret = res.body.secret;
    expect(secret).toMatch(/^fcs_/);

    const q = `client_id=${clientId}&redirect_uri=${encodeURIComponent('https://ucp.test/callback')}&response_type=code&scope=profile%20email%20read%20write&state=xyz`;
    const bad = await ali.get(`/api/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent('https://evil.test/cb')}&response_type=code`);
    expect(bad.status).toBe(400);
    const info = await ali.get(`/api/oauth/authorize?${q}`);
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ client: { name: 'Oyun UCP' }, redirectHost: 'ucp.test', alreadyApproved: false });
    expect(info.body.scopes.map((s: { key: string }) => s.key)).toEqual(['profile', 'email', 'read', 'write']);
  });

  it('issues, uses, refreshes and revokes tokens', async () => {
    const params = { client_id: clientId, redirect_uri: 'https://ucp.test/callback', response_type: 'code', scope: 'profile email read write', state: 'xyz' };
    const decided = await ali.post('/api/oauth/authorize', { ...params, approve: true });
    expect(decided.status).toBe(200);
    const url = new URL(decided.body.redirect);
    expect(url.searchParams.get('state')).toBe('xyz');
    const code = url.searchParams.get('code')!;

    const noAuth = await raw().post('/api/oauth/token').type('form').send({ grant_type: 'authorization_code', code, redirect_uri: params.redirect_uri, client_id: clientId });
    expect(noAuth.status).toBe(401);
    expect(noAuth.body.error).toBe('invalid_client');

    const tok = await raw()
      .post('/api/oauth/token')
      .set('authorization', `Basic ${b64(`${clientId}:${secret}`)}`)
      .type('form')
      .send({ grant_type: 'authorization_code', code, redirect_uri: params.redirect_uri });
    expect(tok.status).toBe(200);
    expect(tok.body).toMatchObject({ token_type: 'Bearer', scope: 'profile email read write' });
    const access = tok.body.access_token as string;

    // Kod ikinci kez kullanılamaz
    const again = await raw().post('/api/oauth/token').set('authorization', `Basic ${b64(`${clientId}:${secret}`)}`).type('form').send({ grant_type: 'authorization_code', code, redirect_uri: params.redirect_uri });
    expect(again.body.error).toBe('invalid_grant');

    const me = await raw().get('/api/oauth/userinfo').set('authorization', `Bearer ${access}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ username: 'Ali', email: 'ali@forum.test', email_verified: false });

    // Okuma ve yazma (Origin olmadan)
    expect((await raw().get('/api/forum').set('authorization', `Bearer ${access}`)).status).toBe(200);
    const topic = await raw().post(`/api/boards/${chat}/topics`).set('authorization', `Bearer ${access}`).send({ title: 'API ile açılan konu', body: 'UCP üzerinden' });
    expect(topic.status).toBe(201);
    // Yasak alanlar
    expect((await raw().get('/api/admin/users').set('authorization', `Bearer ${access}`)).status).toBe(403);
    expect((await raw().put('/api/me/privacy').set('authorization', `Bearer ${access}`).send({})).status).toBe(403);
    expect((await raw().get('/api/messages').set('authorization', `Bearer ${access}`)).status).toBe(403);
    expect((await raw().get('/api/forum').set('authorization', 'Bearer fat_yanlisbelirtecyanlisbelirtec')).status).toBe(401);

    // Yenileme: eski çift iptal olur
    const ref = await raw().post('/api/oauth/token').type('form').send({ grant_type: 'refresh_token', refresh_token: tok.body.refresh_token, client_id: clientId, client_secret: secret });
    expect(ref.status).toBe(200);
    expect((await raw().get('/api/forum').set('authorization', `Bearer ${access}`)).status).toBe(401);
    const reuse = await raw().post('/api/oauth/token').type('form').send({ grant_type: 'refresh_token', refresh_token: tok.body.refresh_token, client_id: clientId, client_secret: secret });
    expect(reuse.body.error).toBe('invalid_grant');

    // Üye bağlı uygulamayı görür ve iptal eder
    const apps = await ali.get('/api/me/apps');
    expect(apps.body.map((a: { name: string }) => a.name)).toEqual(['Oyun UCP']);
    expect((await ali.delete(`/api/me/apps/${clientId}`)).status).toBe(200);
    expect((await raw().get('/api/forum').set('authorization', `Bearer ${ref.body.access_token}`)).status).toBe(401);
  });

  it('requires PKCE for public clients', async () => {
    const pub = await admin.post('/api/admin/developers/clients', { name: 'Mobil', redirectUris: ['http://localhost:5555/cb'], scopes: ['profile'], isConfidential: false });
    const id = pub.body.client.clientId;
    expect(pub.body.secret).toBeNull();
    const base = { client_id: id, redirect_uri: 'http://localhost:5555/cb', response_type: 'code', scope: 'profile' };
    expect((await ali.post('/api/oauth/authorize', { ...base, approve: true })).status).toBe(400);
    const verifier = 'v'.repeat(50);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const ok = await ali.post('/api/oauth/authorize', { ...base, approve: true, code_challenge: challenge, code_challenge_method: 'S256' });
    const code = new URL(ok.body.redirect).searchParams.get('code')!;
    const wrong = await raw().post('/api/oauth/token').type('form').send({ grant_type: 'authorization_code', code, redirect_uri: base.redirect_uri, client_id: id, code_verifier: 'x'.repeat(50) });
    expect(wrong.body.error).toBe('invalid_grant');
    const ok2 = await ali.post('/api/oauth/authorize', { ...base, approve: true, code_challenge: challenge, code_challenge_method: 'S256' });
    const code2 = new URL(ok2.body.redirect).searchParams.get('code')!;
    const good = await raw().post('/api/oauth/token').type('form').send({ grant_type: 'authorization_code', code: code2, redirect_uri: base.redirect_uri, client_id: id, code_verifier: verifier });
    expect(good.status).toBe(200);
  });
});

describe('API keys', () => {
  it('authenticate server-to-server calls with scoped access', async () => {
    const k = await admin.post('/api/admin/developers/keys', { name: 'UCP sunucusu', scopes: ['read', 'admin'] });
    expect(k.status).toBe(201);
    const key = k.body.key as string;
    expect(key).toMatch(/^fk_/);
    const users = await raw().get('/api/admin/users').set('authorization', `Bearer ${key}`);
    expect(users.status).toBe(200);
    expect((await raw().post(`/api/boards/${chat}/topics`).set('authorization', `Bearer ${key}`).send({ title: 'Olmaz', body: 'x' })).status).toBe(403);
    const list = (await admin.get('/api/admin/developers')).body.keys;
    expect(list[0]).toMatchObject({ name: 'UCP sunucusu', prefix: key.slice(0, 10) });
    expect(list[0].lastUsedAt).toBeTruthy();
    await admin.delete(`/api/admin/developers/keys/${k.body.id}`);
    expect((await raw().get('/api/forum').set('authorization', `Bearer ${key}`)).status).toBe(401);
  });
});

describe('webhooks', () => {
  let server: Server;
  const received: Array<{ headers: Record<string, string | string[] | undefined>; body: string }> = [];
  let url = '';

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.writeHead(req.url === '/fail' ? 500 : 200).end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('delivers signed events and records deliveries', async () => {
    const hook = await admin.post('/api/admin/developers/webhooks', { name: 'UCP', url: `${url}/hook`, events: ['topic.created', 'user.registered'] });
    expect(hook.status).toBe(201);
    const secret = hook.body.secret as string;

    const ping = await admin.post(`/api/admin/developers/webhooks/${hook.body.hook.id}/ping`);
    expect(ping.body).toMatchObject({ status: 'success', responseCode: 200, event: 'webhook.ping' });

    await ali.post(`/api/boards/${chat}/topics`, { title: 'Webhook konusu', body: 'merhaba dünya' });
    await registerActive(h, 'Yenigelen');
    await h.jobs.drain();

    const topic = received.find((r) => r.headers['x-forum-event'] === 'topic.created')!;
    expect(topic).toBeTruthy();
    const sig = String(topic.headers['x-forum-signature']);
    const [, t, v1] = /^t=(\d+),v1=([a-f0-9]+)$/.exec(sig)!;
    expect(createHmac('sha256', secret).update(`${t}.${topic.body}`).digest('hex')).toBe(v1);
    const payload = JSON.parse(topic.body);
    expect(payload.data).toMatchObject({ topic: { title: 'Webhook konusu' }, board: { name: 'Genel Sohbet' }, author: { username: 'Ali' } });
    expect(received.some((r) => r.headers['x-forum-event'] === 'user.registered' && JSON.parse(r.body).data.user.username === 'Yenigelen')).toBe(true);

    const log = await admin.get(`/api/admin/developers/webhooks/${hook.body.hook.id}/deliveries`);
    expect(log.body.total).toBe(3);

    const failing = await admin.post('/api/admin/developers/webhooks', { name: 'Bozuk', url: `${url}/fail`, events: ['topic.created'] });
    const p2 = await admin.post(`/api/admin/developers/webhooks/${failing.body.hook.id}/ping`);
    expect(p2.body).toMatchObject({ status: 'failed', responseCode: 500 });
  });
});

describe('social login config', () => {
  it('stores provider credentials without exposing secrets', async () => {
    expect((await h.agent().get('/api/auth/social/providers')).body).toEqual([]);
    const bad = await admin.put('/api/admin/developers/social', { discord: { enabled: true, clientId: '123' } });
    expect(bad.status).toBe(422);
    const ok = await admin.put('/api/admin/developers/social', { discord: { enabled: true, clientId: '123', clientSecret: 'gizli' } });
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).not.toContain('gizli');
    expect((await h.agent().get('/api/auth/social/providers')).body).toEqual([{ key: 'discord', label: 'Discord' }]);
    const start = await h.agent().get('/api/auth/social/discord/start?next=/t/1');
    expect(start.status).toBe(302);
    const loc = new URL(start.headers.location as string);
    expect(loc.host).toBe('discord.com');
    expect(loc.searchParams.get('redirect_uri')).toMatch(/\/api\/auth\/social\/discord\/callback$/);
    const cb = await h.agent().get('/api/auth/social/discord/callback?code=x&state=y');
    expect(cb.headers.location).toBe('/login?social_error=state&provider=discord');
    expect((await h.agent().get('/api/auth/social/pending')).status).toBe(404);
  });
});

describe('security hardening', () => {
  it('matches token scopes regardless of path case', async () => {
    expect(requiredScope('GET', '/api/Messages')).toBe('messages');
    expect(requiredScope('POST', '/api/Auth/password/change')).toBe('deny');
    expect(requiredScope('POST', '/api/ME/2fa/setup')).toBe('deny');
    expect(requiredScope('POST', '/api/mod/bans')).toBe('admin');
    const k = await admin.post('/api/admin/developers/keys', { name: 'Okuma', scopes: ['read'] });
    const key = k.body.key as string;
    // Büyük harfli yol ya bulunmaz ya da izin ister; asla özel mesajları döndürmez
    const res = await raw().get('/api/Messages').set('authorization', `Bearer ${key}`);
    expect([403, 404]).toContain(res.status);
    await admin.delete(`/api/admin/developers/keys/${k.body.id}`);
  });

  it('refuses admin-scoped API keys for other users', async () => {
    const someone = (await h.db.q.selectFrom('users').select('id').where('username', '!=', 'admin').executeTakeFirstOrThrow()).id;
    const bad = await admin.post('/api/admin/developers/keys', { name: 'Kaçak', userId: someone, scopes: ['read', 'admin'] });
    expect(bad.status).toBe(422);
    const ok = await admin.post('/api/admin/developers/keys', { name: 'Okuyucu', userId: someone, scopes: ['read'] });
    expect(ok.status).toBe(201);
  });

  it('blocks private network targets for outgoing requests', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.1.1', '172.20.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) expect(isPrivateAddress(ip)).toBe(false);
  });
});
