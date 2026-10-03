import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let admin: Agent;
let member: Agent;

beforeAll(async () => {
  h = await createHarness();
  admin = await adminAgent(h);
  member = await registerActive(h, 'Kodcu');
});

afterAll(async () => {
  await h.close();
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
