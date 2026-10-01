import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let admin: Agent;
let member: Agent;
let chat: number;

const PNG = Buffer.concat([
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64'),
  Buffer.alloc(32),
]);

beforeAll(async () => {
  h = await createHarness();
  await h.settings.set('forum.floodSeconds', 0);
  admin = await adminAgent(h);
  member = await registerActive(h, 'Emojici');
  const index = await h.agent().get('/api/forum');
  for (const c of index.body.categories) for (const b of c.boards) if (b.name === 'Genel Sohbet') chat = b.id;
});

afterAll(async () => {
  await h.close();
});

describe('custom emojis', () => {
  it('uploads emojis, renders :shortcode: and re-renders on rename', async () => {
    const up = await admin.upload('/api/admin/emojis', 'file', PNG, 'Mutlu Kedi.png');
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ shortcode: 'mutlu_kedi', category: 'Özel', isEnabled: true });
    const dup = await admin.upload('/api/admin/emojis', 'file', PNG, 'mutlu_kedi.png');
    expect(dup.status).toBe(422);
    expect((await member.upload('/api/admin/emojis', 'file', PNG, 'x.png')).status).toBe(403);

    const list = await h.agent().get('/api/emojis');
    expect(list.body.map((e: { shortcode: string }) => e.shortcode)).toEqual(['mutlu_kedi']);

    const t = await member.post(`/api/boards/${chat}/topics`, { title: 'Emoji denemesi', body: 'Selam :mutlu_kedi: ve :yok_boyle: `:mutlu_kedi:`' });
    const page = (await h.agent().get(`/api/topics/${t.body.topicId}`)).body;
    const html = page.posts.items[0].html as string;
    expect(html).toContain(`class="bb-emoji bb-emoji-custom" src="${up.body.url}" alt=":mutlu_kedi:"`);
    expect(html).toContain(':yok_boyle:');

    const ren = await admin.put(`/api/admin/emojis/${up.body.id}`, { shortcode: 'kedi', name: 'Kedi', category: 'Hayvanlar', isEnabled: true });
    expect(ren.status).toBe(200);
    await h.jobs.drain();
    const after = (await h.agent().get(`/api/topics/${t.body.topicId}`)).body.posts.items[0].html as string;
    expect(after).not.toContain('bb-emoji-custom');

    expect((await admin.delete(`/api/admin/emojis/${up.body.id}`)).status).toBe(200);
    expect((await h.agent().get('/api/emojis')).body).toEqual([]);
  });
});
