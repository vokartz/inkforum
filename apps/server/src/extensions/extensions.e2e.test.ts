import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';
import { readArchive, stripRoot } from './archive.js';

function zip(files: Record<string, string>): Buffer {
  const CRC = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const entries = Object.entries(files);
  for (const [name, text] of entries) {
    const data = Buffer.from(text);
    const n = Buffer.from(name);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt16LE(20, 4);
    l.writeUInt16LE(0x800, 6);
    l.writeUInt32LE(crc32(data), 14);
    l.writeUInt32LE(data.length, 18);
    l.writeUInt32LE(data.length, 22);
    l.writeUInt16LE(n.length, 26);
    locals.push(l, n, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8);
    c.writeUInt32LE(crc32(data), 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

const manifest = (version: string) =>
  JSON.stringify({
    id: 'hello',
    name: 'Merhaba',
    version,
    server: 'server.mjs',
    client: { scripts: ['client.js'], styles: [] },
    settings: [
      { key: 'greeting', type: 'text', label: 'Karşılama', default: 'Selam', public: true },
      { key: 'apiKey', type: 'secret', label: 'Anahtar' },
    ],
    permissions: [{ key: 'use', label: 'Kullanma', defaults: { member: 1 } }],
    nav: [{ label: 'Merhaba', url: '/merhaba' }],
    csp: { connect: ['https://api.example.com'] },
  });

const server = `import { defineExtension, html } from '@inkforum/sdk';
export default defineExtension({
  migrations: {
    '001_init': { async up(db, s) { await s.table('ext_hello_notes').addColumn('body', 'text', s.notNull).execute(); } },
  },
  setup(ctx) {
    ctx.routes.get('/ping', (req) => ({ pong: true, user: req.viewer.username, greeting: ctx.settings.get('greeting'), secret: ctx.settings.get('apiKey') }));
    ctx.routes.post('/notes', async (req) => {
      await ctx.db.insertInto('ext_hello_notes').values({ body: String(req.body.body) }).execute();
      return ctx.http.json({ ok: true }, 201);
    }, { permission: 'use' });
    ctx.routes.get('/notes', async () => ctx.db.selectFrom('ext_hello_notes').select('body').execute(), { auth: true });
    ctx.routes.get('/boom', () => { throw ctx.http.error(418, 'Çaydanlık'); });
    ctx.pages.add({ path: '/merhaba/*', title: 'Merhaba', render: (req) => ({ html: html\`<p>\${req.viewer.displayName ?? 'misafir'} \${req.params.rest}</p><i>\${'<x>'}</i>\`, scripts: ['page.js'], data: { a: 1 } }) });
    ctx.admin.page({ key: 'panel', title: 'Panel', render: () => ({ html: '<b>yönetim</b>' }) });
    ctx.slots.add('afterHeader', { render: (req) => (req.viewer.isGuest ? null : '<div class="duyuru">üyelere</div>') });
    ctx.slots.add('profileTab', { title: 'Karakterler', render: (req) => html\`<p>\${req.profile.username}</p>\` });
  },
});
`;

let h: Harness;
let admin: Agent;
let member: Agent;
let storage: string;

beforeAll(async () => {
  storage = mkdtempSync(join(tmpdir(), 'forum-ext-'));
  h = await createHarness({ STORAGE_DIR: storage });
  admin = await adminAgent(h);
  member = await registerActive(h, 'Eklentici');
});

afterAll(async () => {
  await h.close();
  rmSync(storage, { recursive: true, force: true });
});

describe('extension archives', () => {
  it('reads zip and npm-style tgz packages and rejects path traversal', () => {
    const files = stripRoot(readArchive(zip({ 'paket/inkforum.json': '{}', 'paket/public/a.js': 'x' })));
    expect([...files.keys()].sort()).toEqual(['inkforum.json', 'public/a.js']);
    expect(() => readArchive(zip({ '../kaçak.js': 'x' }))).toThrow(/Geçersiz/);

    const header = Buffer.alloc(512);
    header.write('package/inkforum.json', 0);
    header.write('0000644\0', 100);
    header.write(`${(2).toString(8).padStart(11, '0')}\0`, 124);
    header.write('0', 156);
    const body = Buffer.alloc(512);
    body.write('{}');
    const tgz = gzipSync(Buffer.concat([header, body, Buffer.alloc(1024)]));
    expect([...stripRoot(readArchive(tgz)).keys()]).toEqual(['inkforum.json']);
  });
});

describe('extensions', () => {
  it('rejects packages without a manifest and non-admins', async () => {
    const bad = await admin.upload('/api/admin/extensions/upload', 'file', zip({ 'readme.md': 'x' }), 'x.zip');
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/inkforum\.json/);
    expect((await member.upload('/api/admin/extensions/upload', 'file', zip({ 'inkforum.json': manifest('1.0.0') }), 'x.zip')).status).toBe(403);
  });

  it('installs, runs routes, pages, slots, settings and permissions', async () => {
    const pkg = zip({ 'inkforum.json': manifest('1.0.0'), 'server.mjs': server, 'public/client.js': 'export default () => {}', 'public/page.js': 'export function mount() {}', 'README.md': '# Merhaba' });
    const preview = await admin.upload('/api/admin/extensions/upload', 'file', pkg, 'hello.zip');
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ manifest: { id: 'hello', version: '1.0.0' }, hasServer: true, installedVersion: null, compatible: true });

    const installed = await admin.post('/api/admin/extensions/install', { token: preview.body.token, enable: true });
    expect(installed.status).toBe(200);
    expect(installed.body).toMatchObject({ id: 'hello', enabled: true, status: 'active' });

    const ping = await member.get('/api/ext/hello/ping');
    expect(ping.body).toMatchObject({ pong: true, user: 'Eklentici', greeting: 'Selam', secret: '' });
    expect((await h.agent().post('/api/ext/hello/notes', { body: 'x' })).status).toBe(401);
    expect((await member.post('/api/ext/hello/notes', { body: 'not' })).status).toBe(201);
    expect((await member.get('/api/ext/hello/notes')).body).toEqual([{ body: 'not' }]);
    const boom = await member.get('/api/ext/hello/boom');
    expect(boom.status).toBe(418);
    expect(boom.body.error.message).toBe('Çaydanlık');
    expect((await member.get('/api/ext/hello/yok')).status).toBe(404);

    const page = await member.get('/api/page-route?path=merhaba/dunya');
    expect(page.body).toMatchObject({ kind: 'extension', ext: 'hello', title: 'Merhaba', scripts: ['/ext-assets/hello/page.js'], data: { a: 1 } });
    expect(page.body.html).toBe('<p>Eklentici dunya</p><i>&lt;x&gt;</i>');
    expect((await member.get('/api/page-route?path=bilinmeyen')).status).toBe(404);

    expect((await h.agent().get('/ext-assets/hello/page.js')).status).toBe(200);
    expect((await h.agent().get('/ext-assets/hello/../inkforum.json')).status).toBe(404);
    expect((await h.agent().get('/api/nav')).body.some((n: { href: string }) => n.href === '/merhaba')).toBe(true);
    const bundle = (await member.get('/api/extensions/client')).body;
    expect(bundle).toMatchObject({ scripts: [{ ext: 'hello', src: '/ext-assets/hello/client.js' }], settings: { hello: { greeting: 'Selam' } } });
    expect(bundle.csp.connect).toContain('https://api.example.com');
    expect(bundle.slots.afterHeader[0].html).toContain('üyelere');
    expect((await h.agent().get('/api/extensions/client')).body.slots.afterHeader).toBeUndefined();
    const memberId = (await member.get('/api/auth/me')).body.user.id;
    expect((await h.agent().get(`/api/extensions/profile/${memberId}`)).body.tabs[0]).toMatchObject({ title: 'Karakterler', html: '<p>Eklentici</p>' });

    expect((await admin.get('/api/admin/access')).body.extensions).toMatchObject([{ id: 'hello', name: 'Merhaba', icon: 'puzzle-piece', pages: [{ key: 'panel', title: 'Panel', icon: 'puzzle-piece' }], hasSettings: true }]);
    expect((await admin.get('/api/admin/extensions/hello/pages/panel')).body.html).toBe('<b>yönetim</b>');
    const saved = await admin.put('/api/admin/extensions/hello/settings', { greeting: 'Hoş geldin', apiKey: 'gizli-123' });
    expect(saved.status).toBe(200);
    expect(saved.body.values).toEqual({ greeting: 'Hoş geldin', apiKey: '••••••••' });
    expect(saved.body.readmeHtml).toContain('Merhaba');
    await admin.put('/api/admin/extensions/hello/settings', { apiKey: '••••••••' });
    expect((await member.get('/api/ext/hello/ping')).body).toMatchObject({ greeting: 'Hoş geldin', secret: 'gizli-123' });

    const matrix = (await admin.get('/api/admin/permissions')).body;
    expect(matrix.permissions.some((p: { key: string }) => p.key === 'ext.hello.use')).toBe(true);
  });

  it('overrides core pages, fills topic / post / board slots and adds account pages', async () => {
    const hooks = `import { defineExtension, html } from '@inkforum/sdk';
export default defineExtension({
  setup(ctx) {
    ctx.pages.add({ path: '/', override: true, title: 'Özel ana sayfa', render: (req) => ({ html: html\`<p>Selam \${req.viewer.displayName ?? 'misafir'}</p>\` }) });
    ctx.pages.add({ path: '/members', override: true, title: 'Üyeler', render: () => ({ html: '<p>eklenti üyeler</p>' }) });
    ctx.slots.add('topicTop', { render: (req) => html\`<b>\${req.topic.title}</b>\` });
    ctx.slots.add('postActions', { render: (req) => (req.viewer.isGuest ? null : html\`<button data-post="\${req.post.id}">Şikayet et</button>\`) });
    ctx.slots.add('boardTop', { render: (req) => html\`<i>\${req.board.name}</i>\` });
    ctx.account.page({ key: 'karakter', title: 'Karakter ayarları', render: (req) => ({ html: html\`<p>\${req.viewer.username}</p>\` }) });
  },
});
`;
    const bad = zip({ 'inkforum.json': JSON.stringify({ id: 'kotu', name: 'Kötü', version: '1.0.0', server: 'server.mjs' }), 'server.mjs': "export default { setup(ctx) { ctx.pages.add({ path: '/admin', override: true, title: 'x', render: () => ({}) }); } };" });
    const badPreview = await admin.upload('/api/admin/extensions/upload', 'file', bad, 'k.zip');
    const badInstall = await admin.post('/api/admin/extensions/install', { token: badPreview.body.token, enable: true });
    expect(badInstall.status).toBe(500);
    expect(badInstall.body.error.message).toMatch(/yerine geçilemez/);

    const preview = await admin.upload('/api/admin/extensions/upload', 'file', zip({ 'inkforum.json': JSON.stringify({ id: 'kancalar', name: 'Kancalar', version: '1.0.0', server: 'server.mjs' }), 'server.mjs': hooks }), 'k.zip');
    expect((await admin.post('/api/admin/extensions/install', { token: preview.body.token, enable: true })).body.status).toBe('active');

    expect((await h.agent().get('/api/extensions/routes')).body).toEqual([
      { base: '', wildcard: false },
      { base: 'members', wildcard: false },
    ]);
    expect((await member.get('/api/page-route?path=/')).body).toMatchObject({ kind: 'extension', html: '<p>Selam Eklentici</p>' });
    expect((await member.get('/api/page-route?path=members')).body.html).toBe('<p>eklenti üyeler</p>');

    const boards = await h.db.q.selectFrom('boards').select(['id', 'name']).orderBy('id').execute();
    let board = boards[0]!;
    let topic = { status: 0, body: {} as { topicId: number } };
    for (const b of boards) {
      topic = await member.post(`/api/boards/${b.id}/topics`, { title: 'Eklenti konusu', body: 'İlk mesaj gövdesi' });
      board = b;
      if (topic.status === 201) break;
    }
    expect(topic.status).toBe(201);
    const topicId = topic.body.topicId;
    const post = await h.db.q.selectFrom('posts').select('id').where('topic_id', '=', topicId).executeTakeFirstOrThrow();
    const slots = (await member.get(`/api/extensions/topic/${topicId}?posts=${post.id},999999`)).body;
    expect(slots.topicTop[0].html).toBe('<b>Eklenti konusu</b>');
    expect(slots.posts[post.id].postActions[0].html).toBe(`<button data-post="${post.id}">Şikayet et</button>`);
    expect(Object.keys(slots.posts)).toEqual([String(post.id)]);
    expect((await h.agent().get(`/api/extensions/topic/${topicId}?posts=${post.id}`)).body.posts).toEqual({});
    expect((await member.get(`/api/extensions/board/${board.id}`)).body.boardTop[0].html).toBe(`<i>${board.name}</i>`);
    expect((await member.get('/api/extensions/topic/999999')).status).toBe(404);

    expect((await member.get('/api/extensions/account')).body).toMatchObject([{ ext: 'kancalar', key: 'karakter', title: 'Karakter ayarları' }]);
    expect((await member.get('/api/extensions/account/kancalar/karakter')).body.html).toBe('<p>Eklentici</p>');
    expect((await h.agent().get('/api/extensions/account/kancalar/karakter')).status).toBe(401);

    await admin.post('/api/admin/extensions/kancalar/uninstall', { deleteData: true });
    await admin.post('/api/admin/extensions/kotu/uninstall', { deleteData: true });
    expect((await h.agent().get('/api/extensions/routes')).body).toEqual([]);
  });

  it('serves the starter kit and ready-made extensions without npm', async () => {
    const res = await admin.getBuffer('/api/admin/extensions/starter?id=kart-oyunu&name=Kart%20Oyunu');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    const files = readArchive(res.body as Buffer);
    expect(files.get('kart-oyunu/server.mjs')!.toString()).toContain("ext_kart_oyunu_visits");
    expect(JSON.parse(files.get('kart-oyunu/inkforum.json')!.toString())).toMatchObject({ id: 'kart-oyunu', name: 'Kart Oyunu' });
    expect(files.has('kart-oyunu/node_modules/@inkforum/sdk/index.d.ts')).toBe(true);
    expect(files.has('kart-oyunu/tools/inkforum-ext.mjs')).toBe(true);
    expect((await admin.get('/api/admin/extensions/starter?id=Kotu&name=x')).status).toBe(422);
    expect((await member.get('/api/admin/extensions/starter?id=kart&name=x')).status).toBe(403);

    const samples = (await admin.get('/api/admin/extensions/samples')).body;
    expect(samples.map((s: { id: string }) => s.id).sort()).toEqual(['complaints', 'demo-ucp']);
    const preview = await admin.post('/api/admin/extensions/samples/complaints/stage', {});
    expect(preview.body).toMatchObject({ manifest: { id: 'complaints' }, hasServer: true, compatible: true });
    expect((await admin.post('/api/admin/extensions/install', { token: preview.body.token, enable: true })).body.status).toBe('active');
    expect((await admin.get('/api/admin/extensions/samples')).body.find((s: { id: string }) => s.id === 'complaints').installedVersion).toBe('1.0.0');
    await admin.post('/api/admin/extensions/complaints/uninstall', { deleteData: true });
  });

  it('updates in place, disables and uninstalls', async () => {
    const pkg = zip({ 'inkforum.json': manifest('1.1.0'), 'server.mjs': server.replace('pong: true', 'pong: 2'), 'public/client.js': '', 'public/page.js': '' });
    const preview = await admin.upload('/api/admin/extensions/upload', 'file', pkg, 'hello.zip');
    expect(preview.body.installedVersion).toBe('1.0.0');
    const updated = await admin.post('/api/admin/extensions/install', { token: preview.body.token, enable: false });
    expect(updated.body).toMatchObject({ version: '1.1.0', status: 'active' });
    expect((await member.get('/api/ext/hello/ping')).body.pong).toBe(2);
    expect((await member.get('/api/ext/hello/notes')).body).toEqual([{ body: 'not' }]);

    expect((await admin.put('/api/admin/extensions/hello/enabled', { enabled: false })).body.status).toBe('disabled');
    expect((await member.get('/api/ext/hello/ping')).status).toBe(404);
    expect((await h.agent().get('/ext-assets/hello/page.js')).status).toBe(404);
    expect((await member.get('/api/page-route?path=merhaba')).status).toBe(404);

    expect((await admin.post('/api/admin/extensions/hello/uninstall', { deleteData: true })).status).toBe(200);
    expect((await admin.get('/api/admin/extensions')).body.items).toEqual([]);
  });
});
