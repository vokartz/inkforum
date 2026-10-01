import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let admin: Agent;
let member: Agent;

/** 1×1 PNG */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64');
/** 24 baytlık başlık kontrolünü geçmesi için büyütülmüş PNG (boyut okunur) */
const IMG = Buffer.concat([PNG, Buffer.alloc(64)]);

beforeAll(async () => {
  h = await createHarness();
  await h.settings.set('forum.floodSeconds', 0);
  admin = await adminAgent(h);
  member = await registerActive(h, 'Menuci');
});

afterAll(async () => {
  await h.close();
});

describe('navigation menu', () => {
  it('seeds a default menu filtered by viewer', async () => {
    const guest = await h.agent().get('/api/nav');
    const labels = guest.body.map((e: { label: string }) => e.label);
    expect(labels).toContain('Forum');
    expect(labels).not.toContain('Okunmamış'); // yalnız üyeler
    expect(guest.body[0].icon).toBeTruthy();
    const mine = await member.get('/api/nav');
    expect(mine.body.map((e: { label: string }) => e.label)).toContain('Okunmamış');
  });

  it('saves a menu tree with dropdowns and validates input', async () => {
    const bad = await admin.put('/api/admin/appearance/nav', { items: [{ kind: 'link', label: 'Kötü', url: 'javascript:alert(1)' }] });
    expect(bad.status).toBe(422);
    const res = await admin.put('/api/admin/appearance/nav', {
      items: [
        { kind: 'builtin', builtinKey: 'forum', label: 'Ana sayfa', icon: 'house' },
        {
          kind: 'dropdown',
          label: 'Topluluk',
          icon: 'users',
          children: [
            { kind: 'link', label: 'Discord', url: 'https://discord.gg/ornek', newTab: true },
            { kind: 'link', label: 'Gizli', url: '/gizli', visibility: 'members' },
          ],
        },
        { kind: 'link', label: 'Yönetim', url: '/admin', permission: 'admin.access' },
      ],
    });
    expect(res.status).toBe(200);
    const guest = await h.agent().get('/api/nav');
    expect(guest.body.map((e: { label: string }) => e.label)).toEqual(['Ana sayfa', 'Topluluk']);
    expect(guest.body[1].children.map((c: { label: string }) => c.label)).toEqual(['Discord']);
    const asAdmin = await admin.get('/api/nav');
    expect(asAdmin.body.map((e: { label: string }) => e.label)).toContain('Yönetim');
  });
});

describe('branding and appearance', () => {
  it('uploads and removes branding images', async () => {
    const up = await admin.upload('/api/admin/appearance/assets/logo', 'file', IMG, 'logo.png');
    expect(up.status).toBe(200);
    expect(up.body.url).toMatch(/^\/uploads\/branding\//);
    const me = await h.agent().get('/api/auth/me');
    expect(me.body.settings['appearance.logoUrl']).toBe(up.body.url);
    expect((await admin.delete('/api/admin/appearance/assets/logo')).status).toBe(200);
    expect((await h.agent().get('/api/auth/me')).body.settings['appearance.logoUrl']).toBeNull();
    expect((await member.upload('/api/admin/appearance/assets/logo', 'file', IMG, 'x.png')).status).toBe(403);
  });

  it('exposes appearance settings and saves social links', async () => {
    const bad = await admin.put('/api/admin/settings', { 'appearance.accentColor': 'red' });
    expect(bad.status).toBe(422);
    await admin.put('/api/admin/settings', { 'appearance.accentColor': '#22c55e', 'appearance.defaultMode': 'light' });
    const res = await admin.put('/api/admin/appearance/social', { links: [{ platform: 'discord', url: 'https://discord.gg/abc' }] });
    expect(res.status).toBe(200);
    const me = await h.agent().get('/api/auth/me');
    expect(me.body.settings).toMatchObject({
      'appearance.accentColor': '#22c55e',
      'appearance.defaultMode': 'light',
      'appearance.socialLinks': [{ platform: 'discord', url: 'https://discord.gg/abc' }],
    });
    expect((await admin.put('/api/admin/appearance/social', { links: [{ platform: 'myspace', url: 'https://x.y' }] })).status).toBe(422);

    const footer = await admin.put('/api/admin/appearance/footer', { links: [{ label: 'Oyun Kuralları', url: '/policies/rules' }, { label: 'Market', url: 'https://ornek.com', newTab: true }] });
    expect(footer.status).toBe(200);
    expect((await h.agent().get('/api/auth/me')).body.settings['appearance.footerLinks']).toEqual([
      { label: 'Oyun Kuralları', url: '/policies/rules', newTab: false },
      { label: 'Market', url: 'https://ornek.com', newTab: true },
    ]);
    expect((await admin.put('/api/admin/appearance/footer', { links: [{ label: 'Kötü', url: 'javascript:alert(1)' }] })).status).toBe(422);
    expect((await admin.put('/api/admin/settings', { 'appearance.fontFamily': 'comic-sans' })).status).toBe(422);
    expect((await admin.put('/api/admin/settings', { 'appearance.fontFamily': 'rubik' })).status).toBe(200);
  });
});

describe('backgrounds and icons', () => {
  it('sets page and category backgrounds', async () => {
    const bg = await admin.upload('/api/admin/appearance/assets/background', 'file', IMG, 'bg.png');
    expect(bg.status).toBe(200);
    expect((await h.agent().get('/api/auth/me')).body.settings['appearance.backgroundUrl']).toBe(bg.body.url);

    const tree = await admin.get('/api/admin/forum');
    const cat = tree.body.categories[0];
    const up = await admin.upload(`/api/admin/forum/categories/${cat.id}/background`, 'file', IMG, 'cat.png');
    expect(up.status).toBe(200);
    const index = await h.agent().get('/api/forum');
    expect(index.body.categories.find((c: { id: number }) => c.id === cat.id).background).toBe(up.body.url);
    expect((await member.upload(`/api/admin/forum/categories/${cat.id}/background`, 'file', IMG, 'x.png')).status).toBe(403);
    expect((await admin.delete(`/api/admin/forum/categories/${cat.id}/background`)).status).toBe(200);
    expect((await h.agent().get('/api/forum')).body.categories.find((c: { id: number }) => c.id === cat.id).background).toBeNull();
  });

  it('searches the icon catalog and accepts legacy icon names', async () => {
    const res = await admin.get('/api/admin/icons?q=chat');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(3);
    expect(res.body[0].nodes.length).toBeGreaterThan(0);
    expect((await member.get('/api/admin/icons?q=chat')).status).toBe(403);
    // Eski (lucide) adıyla kaydedilen menü ikonu Phosphor karşılığına çözülür.
    const saved = await admin.put('/api/admin/appearance/nav', { items: [{ kind: 'builtin', builtinKey: 'forum', label: 'Forum', icon: 'messages-square' }] });
    expect(saved.status).toBe(200);
    expect((await h.agent().get('/api/nav')).body[0].icon.length).toBeGreaterThan(0);
  });
});

describe('profile cover and search', () => {
  it('uploads, positions and removes a cover photo', async () => {
    const id = (await h.db.q.selectFrom('users').select('id').where('username', '=', 'Menuci').executeTakeFirstOrThrow()).id;
    const up = await member.upload('/api/me/cover', 'file', IMG, 'cover.png');
    expect(up.status).toBe(200);
    await member.put('/api/me/cover', { offset: 30 });
    let profile = await h.agent().get(`/api/users/${id}`);
    expect(profile.body.cover).toMatchObject({ url: up.body.url, offset: 30 });
    await member.delete('/api/me/cover');
    profile = await h.agent().get(`/api/users/${id}`);
    expect(profile.body.cover).toBeNull();
  });

  it('searches topic titles case-insensitively (Turkish) and lists member content', async () => {
    const index = await member.get('/api/forum');
    const board = index.body.categories[0].boards.find((b: { name: string }) => b.name === 'Genel Sohbet');
    const t = await member.post(`/api/boards/${board.id}/topics`, { title: 'İstanbul buluşması', body: 'Kim gelir?' });
    expect(t.status).toBe(201);
    const res = await h.agent().get(`/api/search?q=${encodeURIComponent('istanbul')}`);
    expect(res.body.topics.map((x: { id: number }) => x.id)).toContain(t.body.topicId);
    const id = (await h.db.q.selectFrom('users').select('id').where('username', '=', 'Menuci').executeTakeFirstOrThrow()).id;
    const topics = await h.agent().get(`/api/users/${id}/topics`);
    expect(topics.body.items[0].title).toBe('İstanbul buluşması');
    const posts = await h.agent().get(`/api/users/${id}/posts`);
    expect(posts.body.items[0]).toMatchObject({ isFirst: true, topic: { title: 'İstanbul buluşması' } });
  });
});
