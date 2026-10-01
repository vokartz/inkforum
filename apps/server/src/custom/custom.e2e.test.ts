import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';
import { GroupCacheService } from '../groups/group-cache.service.js';

let h: Harness;
let admin: Agent;
let member: Agent;
let adminGroup: number;

beforeAll(async () => {
  h = await createHarness();
  admin = await adminAgent(h);
  member = await registerActive(h, 'Kodcu');
  adminGroup = (await h.app.get(GroupCacheService).bySystemKey('admin')).id;
});

afterAll(async () => {
  await h.close();
});

describe('custom code snippets', () => {
  it('delivers snippets by placement and visibility', async () => {
    const a = await admin.post('/api/admin/custom/snippets', { name: 'Analiz', placement: 'head', html: '<meta name="x-test" content="1">' });
    expect(a.status).toBe(201);
    await admin.post('/api/admin/custom/snippets', { name: 'Üye kutusu', placement: 'afterHeader', visibility: 'members', html: '<div>Merhaba {{viewer.username}}</div>' });
    await admin.post('/api/admin/custom/snippets', { name: 'Yönetim', placement: 'beforeFooter', visibility: 'groups', groupIds: [adminGroup], html: '<b>gizli</b>' });
    await admin.post('/api/admin/custom/snippets', { name: 'Kapalı', placement: 'bodyEnd', isEnabled: false, html: '<script>1</script>' });

    const bad = await admin.post('/api/admin/custom/snippets', { name: 'Sekme', placement: 'profileTab', html: '<p>x</p>' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields.title).toBeTruthy();
    const denied = await member.post('/api/admin/custom/snippets', { name: 'x', placement: 'head', html: '<p>x</p>' });
    expect(denied.status).toBe(403);

    const guest = (await h.agent().get('/api/custom')).body;
    expect(guest.snippets.map((s: { placement: string }) => s.placement)).toEqual(['head']);
    const mine = (await member.get('/api/custom')).body;
    expect(mine.snippets.map((s: { placement: string }) => s.placement).sort()).toEqual(['afterHeader', 'head']);
    const adm = (await admin.get('/api/custom')).body;
    expect(adm.snippets).toHaveLength(3);

    const upd = await admin.put(`/api/admin/custom/snippets/${a.body.id}`, { name: 'Analiz', placement: 'head', isEnabled: false, html: '<meta>' });
    expect(upd.body.isEnabled).toBe(false);
    expect((await h.agent().get('/api/custom')).body.snippets).toEqual([]);
    expect((await admin.delete(`/api/admin/custom/snippets/${a.body.id}`)).status).toBe(200);
  });

  it('saves CSS and CSP sources, and the kill switch hides everything', async () => {
    const bad = await admin.put('/api/admin/custom/settings', { enabled: true, css: '', csp: { script: ['javascript:alert(1)'], connect: [], style: [], font: [] } });
    expect(bad.status).toBe(422);
    const ok = await admin.put('/api/admin/custom/settings', {
      enabled: true,
      css: '.x{color:red}',
      csp: { script: ['https://cdn.ucp.test', 'https://CDN.ucp.test'], connect: ['https://api.ucp.test', 'wss://*.ucp.test'], style: [], font: [] },
      tokenTtl: 120,
    });
    expect(ok.status).toBe(200);
    const view = (await member.get('/api/custom')).body;
    expect(view.css).toBe('.x{color:red}');
    expect(view.csp.script).toEqual(['https://cdn.ucp.test']);
    expect(view.csp.connect).toEqual(['https://api.ucp.test', 'wss://*.ucp.test']);

    await admin.put('/api/admin/custom/settings', { enabled: false, css: '.x{}', csp: view.csp, tokenTtl: 120 });
    const off = (await member.get('/api/custom')).body;
    expect(off).toMatchObject({ enabled: false, css: '', snippets: [] });
    await admin.put('/api/admin/custom/settings', { enabled: true, css: '', csp: view.csp, tokenTtl: 120 });
  });
});

describe('integration token', () => {
  it('issues verifiable HS256 tokens once a secret exists', async () => {
    expect((await member.post('/api/me/integration-token')).status).toBe(404);
    expect((await h.agent().post('/api/me/integration-token')).status).toBe(401);

    const rot = await admin.post('/api/admin/custom/secret');
    expect(rot.status).toBe(200);
    const secret = rot.body.secret as string;
    expect(secret.length).toBeGreaterThan(30);
    const info = (await admin.get('/api/admin/custom')).body.integration;
    expect(info.hasSecret).toBe(true);
    expect(JSON.stringify(info)).not.toContain(secret);

    const res = await member.post('/api/me/integration-token');
    expect(res.status).toBe(200);
    const [head, body, sig] = (res.body.token as string).split('.');
    expect(createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')).toBe(sig);
    const claims = JSON.parse(Buffer.from(body!, 'base64url').toString());
    expect(claims).toMatchObject({ username: 'Kodcu', name: 'Kodcu' });
    expect(claims.exp - claims.iat).toBe(120);

    await admin.delete('/api/admin/custom/secret');
    expect((await member.post('/api/me/integration-token')).status).toBe(404);
  });
});

describe('custom pages', () => {
  it('creates BBCode and HTML pages with visibility and publishing', async () => {
    const p = await admin.post('/api/admin/pages', { slug: 'Kurallar-Rehberi', title: 'Rehber', body: '[b]Merhaba[/b]' });
    expect(p.status).toBe(201);
    expect(p.body.slug).toBe('kurallar-rehberi');
    const view = await h.agent().get('/api/pages/kurallar-rehberi');
    expect(view.status).toBe(200);
    expect(view.body.html).toContain('<strong>Merhaba</strong>');

    const dup = await admin.post('/api/admin/pages', { slug: 'kurallar-rehberi', title: 'X' });
    expect(dup.status).toBe(422);
    expect(dup.body.error.fields.slug).toBeTruthy();

    const ucp = await admin.post('/api/admin/pages', { slug: 'ucp', title: 'UCP', format: 'html', layout: 'blank', visibility: 'members', body: '<div id="ucp"></div><script>1</script>' });
    expect(ucp.status).toBe(201);
    expect((await h.agent().get('/api/pages/ucp')).status).toBe(404);
    const mine = await member.get('/api/pages/ucp');
    expect(mine.body).toMatchObject({ format: 'html', layout: 'blank', html: '<div id="ucp"></div><script>1</script>' });

    await admin.put(`/api/admin/pages/${p.body.id}`, { slug: 'kurallar-rehberi', title: 'Rehber', body: 'taslak', isPublished: false });
    expect((await member.get('/api/pages/kurallar-rehberi')).status).toBe(404);
    const preview = await admin.get('/api/pages/kurallar-rehberi');
    expect(preview.body.isPublished).toBe(false);

    expect((await admin.delete(`/api/admin/pages/${p.body.id}`)).status).toBe(200);
    expect((await admin.get('/api/admin/pages')).body.pages.map((x: { slug: string }) => x.slug)).toEqual(['ucp']);
  });

  it('requires the custom code permission for HTML home blocks', async () => {
    const blocks = (await admin.get('/api/admin/home')).body.blocks;
    const res = await admin.put('/api/admin/home', { blocks: [...blocks, { position: 'top', kind: 'html', config: { html: '<div class="srv">Sunucu açık</div>' } }] });
    expect(res.status).toBe(200);
    const home = (await h.agent().get('/api/home')).body;
    expect(home.top.find((b: { kind: string }) => b.kind === 'html').html).toBe('<div class="srv">Sunucu açık</div>');
  });
});
