import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let admin: Agent;
let member: Agent;

const PNG = Buffer.concat([
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64'),
  Buffer.alloc(64),
]);

beforeAll(async () => {
  h = await createHarness();
  admin = await adminAgent(h);
  member = await registerActive(h, 'Blokcu');
});

afterAll(async () => {
  await h.close();
});

describe('home blocks', () => {
  it('seeds the default sidebar widgets', async () => {
    const res = await h.agent().get('/api/home');
    expect(res.status).toBe(200);
    expect(res.body.sidebar.map((b: { kind: string }) => b.kind)).toEqual(['recent', 'stats', 'online', 'birthdays']);
    expect(res.body.top).toEqual([]);
  });

  it('saves announcements, tiles and text blocks with visibility and dates', async () => {
    const img = await admin.upload('/api/admin/home/images', 'file', PNG, 'kart.png');
    expect(img.status).toBe(200);
    const now = Date.now();
    const current = (await admin.get('/api/admin/home')).body.blocks;
    const res = await admin.put('/api/admin/home', {
      blocks: [
        { position: 'top', kind: 'announcement', config: { text: '[b]Sunucu[/b] bakımda!', style: 'warning', icon: 'wrench' } },
        { position: 'top', kind: 'tiles', title: 'Vitrin', config: { columns: 3, items: [{ image: img.body.url, title: 'Discord', url: 'https://discord.gg/ornek', newTab: true }] } },
        { position: 'bottom', kind: 'text', visibility: 'members', config: { body: 'Yalnız üyeler görür' } },
        { position: 'top', kind: 'announcement', startsAt: now + 3_600_000, config: { text: 'Gelecek duyuru' } },
        ...current.filter((b: { kind: string }) => b.kind !== 'birthdays'),
      ],
    });
    expect(res.status).toBe(200);

    const guest = (await h.agent().get('/api/home')).body;
    expect(guest.top.map((b: { kind: string }) => b.kind)).toEqual(['announcement', 'tiles']);
    expect(guest.top[0]).toMatchObject({ style: 'warning', dismissible: true });
    expect(guest.top[0].html).toContain('<strong>Sunucu</strong>');
    expect(guest.top[0].icon.length).toBeGreaterThan(0);
    expect(guest.top[1].items[0]).toMatchObject({ title: 'Discord', image: img.body.url, newTab: true });
    expect(guest.bottom).toEqual([]);
    expect(guest.sidebar.map((b: { kind: string }) => b.kind)).toEqual(['recent', 'stats', 'online']);

    const mine = (await member.get('/api/home')).body;
    expect(mine.bottom[0].html).toContain('Yalnız üyeler görür');
  });

  it('keeps the announcement key when unchanged and validates input', async () => {
    const before = (await h.agent().get('/api/home')).body.top[0].key;
    const blocks = (await admin.get('/api/admin/home')).body.blocks;
    expect((await admin.put('/api/admin/home', { blocks })).status).toBe(200);
    expect((await h.agent().get('/api/home')).body.top[0].key).toBe(before);

    const bad = await admin.put('/api/admin/home', { blocks: [{ position: 'top', kind: 'tiles', config: { items: [{ title: 'x', url: 'javascript:alert(1)' }] } }] });
    expect(bad.status).toBe(422);
    expect((await admin.put('/api/admin/home', { blocks: [{ position: 'top', kind: 'announcement', config: { text: 'x', icon: 'yok-boyle-ikon' } }] })).status).toBe(422);
    expect((await member.put('/api/admin/home', { blocks: [] })).status).toBe(403);
  });
});
