import { Db } from '../database/db.service.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let admin: Agent;
let member: Agent;

beforeAll(async () => {
  h = await createHarness();
  admin = await adminAgent(h);
  member = await registerActive(h, 'Okur');
});

afterAll(async () => {
  await h.close();
});

describe('wiki', () => {
  it('builds nested pages with paths, breadcrumbs, headings and neighbours', async () => {
    const root = await admin.post('/api/wiki/pages', { title: 'Başlangıç Rehberi', slug: 'baslangic', body: '[h2]Kurulum[/h2]\nMetin\n[h3]Adım 1[/h3]' });
    expect(root.status).toBe(201);
    expect(root.body.path).toBe('baslangic');
    const child = await admin.post('/api/wiki/pages', { title: 'Karakter Oluşturma', slug: 'karakter', parentId: root.body.id, body: 'x' });
    const grand = await admin.post('/api/wiki/pages', { title: 'İsim Kuralları', slug: 'isim', parentId: child.body.id, body: 'y' });
    expect(grand.body.path).toBe('baslangic/karakter/isim');

    const dup = await admin.post('/api/wiki/pages', { title: 'Tekrar', slug: 'karakter', parentId: root.body.id });
    expect(dup.status).toBe(422);
    expect(dup.body.error.fields.slug).toBeTruthy();
    // Aynı adres farklı üst sayfada serbest
    expect((await admin.post('/api/wiki/pages', { title: 'Karakter (kök)', slug: 'karakter' })).status).toBe(201);

    const page = (await member.get('/api/wiki/page?path=baslangic/karakter/isim')).body;
    expect(page.title).toBe('İsim Kuralları');
    expect(page.breadcrumbs.map((b: { path: string }) => b.path)).toEqual(['baslangic', 'baslangic/karakter']);
    expect(page.prev.path).toBe('baslangic/karakter');
    expect(page.canEdit).toBe(false);
    expect(page.body).toBeNull();

    const top = (await member.get('/api/wiki/page?path=baslangic')).body;
    expect(top.html).toContain('<h2 class="bb-h" id="kurulum">');
    expect(top.children.map((c: { title: string }) => c.title)).toEqual(['Karakter Oluşturma']);

    const index = (await h.agent().get('/api/wiki')).body;
    expect(index.tree[0].children[0].children[0].path).toBe('baslangic/karakter/isim');

    // Kendi altına taşıma engellenir
    const cycle = await admin.put(`/api/wiki/pages/${root.body.id}`, { title: 'Başlangıç Rehberi', slug: 'baslangic', parentId: grand.body.id });
    expect(cycle.status).toBe(422);
  });

  it('enforces edit permissions, drafts, locks and keeps revisions', async () => {
    expect((await member.post('/api/wiki/pages', { title: 'Yetkisiz', slug: 'yetkisiz' })).status).toBe(403);
    const draft = await admin.post('/api/wiki/pages', { title: 'Taslak', slug: 'taslak', isPublished: false, body: 'ilk' });
    expect((await member.get('/api/wiki/page?path=taslak')).status).toBe(404);
    expect((await admin.get('/api/wiki/page?path=taslak')).status).toBe(200);

    await admin.put(`/api/wiki/pages/${draft.body.id}`, { title: 'Taslak', slug: 'taslak', isPublished: true, body: 'ikinci', note: 'Güncellendi' });
    const revs = (await member.get(`/api/wiki/pages/${draft.body.id}/revisions`)).body.items;
    expect(revs).toHaveLength(2);
    expect(revs[0].note).toBe('Güncellendi');
    const old = (await member.get(`/api/wiki/pages/${draft.body.id}/revisions/${revs[1].id}`)).body;
    expect(old.html).toContain('ilk');
    expect(old.body).toBe('');

    const search = (await member.get('/api/wiki/search?q=ikinci')).body.items;
    expect(search.map((s: { path: string }) => s.path)).toEqual(['taslak']);

    expect((await member.put('/api/wiki/order', { items: [] })).status).toBe(403);
    expect((await member.delete(`/api/wiki/pages/${draft.body.id}`)).status).toBe(403);
    expect((await admin.delete(`/api/wiki/pages/${draft.body.id}`)).status).toBe(200);
  });

  it('reorders the tree and rejects cycles', async () => {
    const idx = (await admin.get('/api/wiki')).body;
    const root = idx.tree.find((n: { slug: string }) => n.slug === 'baslangic');
    const child = root.children[0];
    const bad = await admin.put('/api/wiki/order', { items: [{ id: root.id, parentId: child.id, sortOrder: 0 }] });
    expect(bad.status).toBe(400);
    const ok = await admin.put('/api/wiki/order', { items: [{ id: child.id, parentId: null, sortOrder: 0 }] });
    expect(ok.status).toBe(400); // kökte "karakter" adresi zaten var
    const idx2 = (await admin.get('/api/wiki')).body;
    expect(idx2.tree.find((n: { slug: string }) => n.slug === 'baslangic').children).toHaveLength(1);
  });
});

describe('page builder', () => {
  it('validates blocks, resolves dynamic data and sets the landing page', async () => {
    const doc = {
      blocks: [
        { id: 'a', type: 'hero', title: 'Merhaba', buttons: [{ label: 'Forum', url: '/forum' }] },
        { id: 'b', type: 'text', body: '[b]kalın[/b]' },
        { id: 'c', type: 'stats' },
        { id: 'd', type: 'latest', limit: 3 },
        { id: 'e', type: 'cta', title: 'Üyelere özel', visibility: 'members' },
      ],
    };
    // Görsel düzenleyici kaldırıldı: yeni blok sayfası oluşturulamaz, eski sayfalar görünmeye devam eder
    const blocked = await admin.post('/api/admin/pages', { slug: 'giris', title: 'Giriş', format: 'builder', body: JSON.stringify(doc) });
    expect(blocked.status).toBe(422);
    const now = Date.now();
    const id = (
      await h.app
        .get(Db)
        .q.insertInto('custom_pages')
        .values({ slug: 'giris', title: 'Giriş', format: 'builder', body: JSON.stringify({ version: 1, css: '', ...doc }), created_at: now, updated_at: now })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
    const created = { body: { id } };

    const guest = (await h.agent().get('/api/pages/giris')).body;
    expect(guest.blocks.map((b: { type: string }) => b.type)).toEqual(['hero', 'text', 'stats', 'latest']);
    expect(guest.blocks[1].html).toContain('<strong>kalın</strong>');
    expect(typeof guest.blocks[2].stats.members).toBe('number');
    expect(Array.isArray(guest.blocks[3].topics)).toBe(true);
    expect((await member.get('/api/pages/giris')).body.blocks).toHaveLength(5);

    expect((await member.put('/api/admin/pages/landing', { id: created.body.id })).status).toBe(403);
    expect((await admin.put('/api/admin/pages/landing', { id: created.body.id })).status).toBe(200);
    expect((await admin.get('/api/admin/pages')).body.landingSlug).toBe('giris');
    // Sayfa silinince forum dizini yeniden ana sayfa olur
    await admin.delete(`/api/admin/pages/${created.body.id}`);
    expect((await admin.get('/api/admin/pages')).body.landingSlug).toBeNull();
  });
});
