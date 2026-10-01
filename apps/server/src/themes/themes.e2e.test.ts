import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let admin: Agent;

beforeAll(async () => {
  h = await createHarness();
  admin = await adminAgent(h);
});

afterAll(async () => {
  await h.close();
});

describe('theme studio', () => {
  it('starts with the two system themes and keeps the old look until saved', async () => {
    const res = await admin.get('/api/admin/themes');
    expect(res.status).toBe(200);
    expect(res.body.items.map((t: { name: string; isSystem: boolean }) => [t.name, t.isSystem])).toEqual([
      ['Modern', true],
      ['Topluluk', true],
    ]);
    expect(res.body.items[0].active).toBe(true);
    expect((await h.agent().get('/api/auth/me')).body.settings['appearance.theme']).toBeNull();
  });

  it('creates from a preset, edits, activates and compiles', async () => {
    const created = await admin.post('/api/admin/themes', { name: 'Gece', preset: 'midnight' });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const t = (await admin.get(`/api/admin/themes/${id}`)).body;
    expect(t.config.dark.background).toBe('#0b1220');

    t.config.accent = '#ff0055';
    t.config.forumList.style = 'cards';
    const saved = await admin.put(`/api/admin/themes/${id}`, {
      name: 'Gece 2',
      description: '',
      config: t.config,
      css: '.x{color:red}',
      html: { ...t.html, afterHeader: '<div id="duyuru">Merhaba</div>' },
    });
    expect(saved.status).toBe(200);
    expect((await admin.post(`/api/admin/themes/${id}/activate`)).status).toBe(200);

    const me = (await h.agent().get('/api/auth/me')).body.settings;
    expect(me['appearance.accentColor']).toBe('#ff0055');
    expect(me['appearance.theme']).toMatchObject({
      id,
      name: 'Gece 2',
      options: { forumList: { style: 'cards' } },
      html: { afterHeader: '<div id="duyuru">Merhaba</div>' },
    });
    expect(me['appearance.theme'].css).toContain('--primary:#ff0055');
    expect(me['appearance.theme'].css).toContain('.x{color:red}');

    // Etkin tema silinemez; sistem temaları silinemez
    expect((await admin.delete(`/api/admin/themes/${id}`)).status).toBe(400);
    const modern = (await admin.get('/api/admin/themes')).body.items[0].id;
    expect((await admin.delete(`/api/admin/themes/${modern}`)).status).toBe(400);
    expect((await admin.post(`/api/admin/themes/${modern}/activate`)).status).toBe(200);
    expect((await admin.delete(`/api/admin/themes/${id}`)).status).toBe(200);
  });

  it('copies, imports and validates', async () => {
    const list = (await admin.get('/api/admin/themes')).body.items;
    const copy = await admin.post('/api/admin/themes', { name: 'Kopya', copyOf: list[1].id });
    expect(copy.status).toBe(201);
    expect((await admin.get(`/api/admin/themes/${copy.body.id}`)).body.config.base).toBe('community');
    const bad = await admin.put(`/api/admin/themes/${copy.body.id}`, {
      name: 'X',
      config: { accent: 'kırmızı' },
    });
    expect(bad.status).toBe(422);
    const imported = await admin.post('/api/admin/themes', {
      name: 'İçe',
      data: { name: 'İçe', config: { base: 'modern', accent: '#00ff00' }, css: 'body{}' },
    });
    expect(imported.status).toBe(201);
    expect((await admin.get(`/api/admin/themes/${imported.body.id}`)).body).toMatchObject({
      css: 'body{}',
      config: { accent: '#00ff00' },
    });
  });

  it('is admin only', async () => {
    const member = await registerActive(h, 'Uye');
    expect((await member.get('/api/admin/themes')).status).toBe(403);
  });
});
