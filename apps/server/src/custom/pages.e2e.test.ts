import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let admin: Agent;
let member: Agent;

beforeAll(async () => {
  h = await createHarness();
  admin = await adminAgent(h);
  member = await registerActive(h, 'Oyuncu');
});

afterAll(async () => {
  await h.close();
});

const UCP = `
async function handle(req) {
  if (req.kind === 'api') {
    if (req.path === '/visits' && req.method === 'POST') {
      const n = ((await kv.get('visits')) ?? 0) + 1;
      await kv.set('visits', n);
      return json({ n, by: req.user?.name ?? null, sent: req.body });
    }
    if (req.path === '/secret') return json({ hasKey: !!secrets.UCP_KEY, len: secrets.UCP_KEY.length });
    if (req.path === '/go') return redirect('https://ucp.example.com/login?t=' + req.user.id);
    if (req.path === '/remote') return json(await (await fetch('https://evil.example.com/x')).json());
    return notFound();
  }
  if (!req.user) return redirect('/login?next=/ucp');
  if (req.path === '/karakterler') return html('<h2>Karakterler: ' + req.user.name + '</h2>');
  console.log('ucp açıldı', req.user.id);
  return json({ name: req.user.name, q: req.query.tab ?? null });
}`;

describe('code pages', () => {
  it('serves a page on its own address and runs its server code', async () => {
    const created = await admin.post('/api/admin/pages', {
      slug: 'ucp',
      title: 'UCP',
      format: 'html',
      route: 'ucp',
      body: '<div id="app">{{viewer.name}}</div>',
      css: '#app{color:red}',
      js: 'console.log(forum.page.data)',
      sidebar: 'right',
      sidebarHtml: '<forum-online></forum-online>',
      serverEnabled: true,
      serverCode: UCP,
      secrets: [{ name: 'UCP_KEY', value: 'gizli-anahtar-123' }],
    });
    expect(created.status).toBe(201);
    expect(created.body.secrets).toEqual([{ name: 'UCP_KEY' }]);
    expect(JSON.stringify(created.body)).not.toContain('gizli-anahtar');

    const guest = await h.agent().get('/api/page-route?path=ucp');
    expect(guest.body).toEqual({ redirect: '/login?next=/ucp', status: 302 });

    const view = await member.get('/api/page-route?path=/ucp/&tab=bilgi');
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({ slug: 'ucp', route: 'ucp', css: '#app{color:red}', sidebar: 'right', hasServer: true, data: { name: 'Oyuncu', q: 'bilgi' } });

    const sub = await member.get('/api/page-route?path=ucp/karakterler');
    expect(sub.body.html).toBe('<h2>Karakterler: Oyuncu</h2>');
    expect((await member.get('/api/pages/ucp')).body.data.name).toBe('Oyuncu');
    expect((await member.get('/api/page-route?path=yok')).status).toBe(404);
  });

  it('exposes an API with kv storage, secrets and redirects', async () => {
    const one = await member.post('/api/page-api/ucp/visits', { a: 1 });
    expect(one.body).toEqual({ n: 1, by: 'Oyuncu', sent: { a: 1 } });
    const two = await h.agent().post('/api/page-api/ucp/visits', {});
    expect(two.body.n).toBe(2);
    expect(two.body.by).toBeNull();
    expect((await member.get('/api/page-api/ucp/secret')).body).toEqual({ hasKey: true, len: 17 });
    expect((await member.get('/api/page-api/ucp/nope')).status).toBe(404);
    const go = await member.get('/api/page-api/ucp/go');
    expect(go.status).toBe(302);
    expect(go.headers.location).toMatch(/^https:\/\/ucp\.example\.com\/login\?t=/);
    expect((await member.get('/api/page-api/ucp/remote')).status).toBe(500);
  });

  it('only calls allowed hosts and never private addresses', async () => {
    let server: Server | null = null;
    try {
      server = createServer((_q, r) => r.end('{"ok":true}'));
      await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
      const port = (server.address() as AddressInfo).port;
      const page = (await admin.get('/api/admin/pages')).body.pages.find((p: { slug: string }) => p.slug === 'ucp');
      const test = await admin.post(`/api/admin/pages/${page.id}/test`, {
        method: 'GET',
        path: '/x',
        code: `async function handle() { return json(await (await fetch('http://127.0.0.1:${port}/')).json()); }`,
      });
      expect(test.body.ok).toBe(false);
      expect(test.body.error).toMatch(/izinli alan adları/);
    } finally {
      server?.close();
    }
  });

  it('tests unsaved code with logs and readable errors', async () => {
    const page = (await admin.get('/api/admin/pages')).body.pages.find((p: { slug: string }) => p.slug === 'ucp');
    const ok = await admin.post(`/api/admin/pages/${page.id}/test`, { query: { tab: 'x' } });
    expect(ok.body).toMatchObject({ ok: true, response: { type: 'json', body: { name: 'admin', q: 'x' } }, logs: [expect.stringMatching(/^ucp açıldı \d+$/)] });
    const asGuest = await admin.post(`/api/admin/pages/${page.id}/test`, { as: 'guest' });
    expect(asGuest.body.response).toEqual({ type: 'redirect', status: 302, url: '/login?next=/ucp' });
    const broken = await admin.post(`/api/admin/pages/${page.id}/test`, { code: 'function handle() {\n  return undefinedThing.x;\n}' });
    expect(broken.body).toMatchObject({ ok: false, error: expect.stringMatching(/ReferenceError.*satır 2/) });
    const loop = await admin.post(`/api/admin/pages/${page.id}/test`, { code: 'function handle() { for(;;){} }' });
    expect(loop.body.error).toMatch(/İşlemci süresi/);
    expect((await member.post(`/api/admin/pages/${page.id}/test`, {})).status).toBe(403);
  });

  it('validates addresses and keeps unsafe redirects out', async () => {
    expect((await admin.post('/api/admin/pages', { slug: 'x1', title: 'X', route: 'admin/panel' })).body.error.fields.route).toBeTruthy();
    expect((await admin.post('/api/admin/pages', { slug: 'x2', title: 'X', route: 'ucp' })).body.error.fields.route).toBeTruthy();
    const js = await admin.post('/api/admin/pages', {
      slug: 'kotu',
      title: 'Kötü',
      route: 'kotu',
      serverEnabled: true,
      serverCode: "function handle() { return redirect('javascript:alert(1)'); }",
    });
    expect(js.status).toBe(201);
    expect((await h.agent().get('/api/page-api/kotu')).status).toBe(500);
  });

  it('gives server code read-only forum data with the visitor permissions', async () => {
    const boards = await h.db.q.selectFrom('boards').select(['id', 'name']).execute();
    let board = boards[0]!;
    let t = { status: 0, body: {} as { topicId: number } };
    for (const b of boards) {
      t = await member.post(`/api/boards/${b.id}/topics`, { title: 'Sunucu kodu konusu', body: 'İlk mesajın [b]metni[/b]' });
      board = b;
      if (t.status === 201) break;
    }
    expect(t.status).toBe(201);
    const code = `
async function handle(req) {
  const [stats, me, them, boards, recent, topic, search, groups, members, online, nobody] = await Promise.all([
    forum.stats(), forum.user(req.user ? req.user.id : 0), forum.user('Oyuncu'), forum.boards(), forum.topics({ limit: 5 }),
    forum.topic(${t.body.topicId}), forum.search('Sunucu'), forum.groups(), forum.members({ limit: 5, sort: 'name', dir: 'asc' }),
    forum.online(), forum.user('boyle-biri-yok'),
  ]);
  const inBoard = await forum.topics({ board: ${board.id}, limit: 3 });
  return json({
    site: forum.site.name, hasUrl: typeof forum.site.url === 'string', version: forum.site.version,
    me: req.user && { name: req.user.name, email: req.user.email, groups: Array.isArray(req.user.groups), groupList: req.user.groupList.length, postCount: req.user.postCount, isStaff: req.user.isStaff },
    stats: { members: stats.members, topics: stats.topics },
    them: them && { name: them.name, url: them.url, hasEmail: 'email' in them },
    meProfile: me && me.name,
    boards: boards.length, recent: recent.map((r) => r.title), inBoard: inBoard.map((r) => r.title),
    topic: topic && { title: topic.title, text: topic.text, author: topic.author.name },
    search: search.map((s) => s.title), groups: groups.length > 0, members: members.items.map((m) => m.name), onlineTotal: typeof online.total,
    nobody,
  });
}`;
    const created = await admin.post('/api/admin/pages', { slug: 'veri', title: 'Veri', format: 'html', route: 'veri', body: '<p>x</p>', serverEnabled: true, serverCode: code });
    expect(created.status).toBe(201);
    const res = await member.get('/api/page-api/veri/x');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      hasUrl: true,
      me: { name: 'Oyuncu', email: expect.stringContaining('@'), groups: true, isStaff: false },
      them: { name: 'Oyuncu', hasEmail: false },
      meProfile: 'Oyuncu',
      recent: expect.arrayContaining(['Sunucu kodu konusu']),
      inBoard: expect.arrayContaining(['Sunucu kodu konusu']),
      topic: { title: 'Sunucu kodu konusu', text: 'İlk mesajın metni', author: 'Oyuncu' },
      groups: true,
      onlineTotal: 'number',
      nobody: null,
    });
    expect(res.body.stats.topics).toBeGreaterThan(0);
    expect(res.body.boards).toBeGreaterThan(0);
    const guest = await h.agent().get('/api/page-api/veri/x');
    expect(guest.body.me).toBeNull();
  });
});
