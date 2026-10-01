import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ORIGIN, adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';
import { ForumCacheService } from '../forum/forum-cache.service.js';

let h: Harness;
let admin: Agent;
let member: Agent;
const boards: Record<string, number> = {};
let publicTopic = 0;
let privateTopic = 0;

beforeAll(async () => {
  h = await createHarness();
  await h.settings.set('forum.floodSeconds', 0);
  admin = await adminAgent(h);
  member = await registerActive(h, 'Selin');
  const index = await h.agent().get('/api/forum');
  for (const c of index.body.categories) for (const b of c.boards) boards[b.name] = b.id;

  const pub = await member.post(`/api/boards/${boards['Genel Sohbet']}/topics`, { title: 'Herkese açık <b>konu</b> & paylaşım', body: '[b]Kalın[/b] ilk mesaj içeriği burada.' });
  publicTopic = pub.body.topicId;
  // "Tanışma" bölümünü yalnızca üyelere aç
  const profile = await h.db.q.selectFrom('permission_profiles').select('id').where('key', '=', 'members_only').executeTakeFirstOrThrow();
  await h.db.q.updateTable('boards').set({ permission_profile_id: profile.id }).where('id', '=', boards['Tanışma']!).execute();
  await h.app.get(ForumCacheService).invalidate();
  const priv = await member.post(`/api/boards/${boards['Tanışma']}/topics`, { title: 'Üyelere özel konu', body: 'Gizli içerik' });
  privateTopic = priv.body.topicId;
});

afterAll(async () => {
  await h.close();
});

describe('seo', () => {
  it('serves robots.txt with private paths blocked and the sitemap linked', async () => {
    const res = await h.agent().get('/api/seo/robots');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('Disallow: /admin');
    expect(res.text).toContain('Disallow: /api/');
    expect(res.text).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(res.text).not.toContain('GPTBot');

    await admin.put('/api/admin/settings', { 'seo.blockAiCrawlers': true, 'seo.robotsExtra': 'User-agent: Kotubot\nDisallow: /' });
    const withAi = await h.agent().get('/api/seo/robots');
    expect(withAi.text).toContain('User-agent: GPTBot');
    expect(withAi.text).toContain('User-agent: Kotubot');

    await admin.put('/api/admin/settings', { 'seo.indexing': false });
    const closed = await h.agent().get('/api/seo/robots');
    expect(closed.text).toMatch(/User-agent: \*\nDisallow: \/\n?$/);
    expect((await h.agent().get('/api/seo/sitemap/pages')).body).toEqual([]);
    await admin.put('/api/admin/settings', { 'seo.indexing': true, 'seo.blockAiCrawlers': false, 'seo.robotsExtra': '' });
  });

  it('lists only guest-visible content in the sitemap', async () => {
    const pages = await h.agent().get('/api/seo/sitemap/pages');
    const locs = (pages.body as Array<{ loc: string }>).map((u) => u.loc);
    expect(locs).toContain(`${ORIGIN}/`);
    expect(locs.some((l) => l.startsWith(`${ORIGIN}/f/${boards['Genel Sohbet']}/`))).toBe(true);
    expect(locs.some((l) => l.startsWith(`${ORIGIN}/f/${boards['Tanışma']}/`))).toBe(false);
    expect(locs).toContain(`${ORIGIN}/policies/rules`);

    const index = await h.agent().get('/api/seo/sitemap');
    expect(index.body.topicPages).toBe(1);
    const topics = await h.agent().get('/api/seo/sitemap/topics/1');
    const topicLocs = (topics.body as Array<{ loc: string }>).map((u) => u.loc);
    expect(topicLocs.some((l) => l.includes(`/t/${publicTopic}/`))).toBe(true);
    expect(topicLocs.some((l) => l.includes(`/t/${privateTopic}/`))).toBe(false);
  });

  it('provides oEmbed and embed cards only for public topics', async () => {
    const res = await h.agent().get(`/api/oembed?url=${encodeURIComponent(`${ORIGIN}/t/${publicTopic}/x`)}&maxwidth=400`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ version: '1.0', type: 'rich', width: 400, provider_url: ORIGIN });
    expect(res.body.html).toContain(`src="${ORIGIN}/embed/t/${publicTopic}"`);
    // Başlıktaki HTML iframe özniteliğini bozamaz
    expect(res.body.html).toContain('title="Herkese açık &lt;b>konu&lt;/b> &amp; paylaşım"');

    const card = await h.agent().get(`/api/embed/topics/${publicTopic}`);
    expect(card.body.excerpt).toBe('Kalın ilk mesaj içeriği burada.');
    expect(card.body.author.name).toBe('Selin');

    expect((await h.agent().get(`/api/oembed?url=${encodeURIComponent(`${ORIGIN}/t/${privateTopic}`)}`)).status).toBe(404);
    expect((await h.agent().get(`/api/embed/topics/${privateTopic}`)).status).toBe(404);
    expect((await h.agent().get(`/api/oembed?url=${encodeURIComponent(`https://baska-site.test/t/${publicTopic}`)}`)).status).toBe(404);
    expect((await h.agent().get(`/api/oembed?url=x&format=xml`)).status).toBe(501);
  });

  it('falls back to a site image when share images cannot be rendered', async () => {
    const res = await h.agent().get(`/api/og/t/${publicTopic}.png`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/brand/inkforum-icon-512.png');
  });
  it('saves the share card design and rejects outside images', async () => {
    const ok = await admin.put('/api/admin/seo/og-card', { layout: 'split', background: { kind: 'gradient', from: '#000000', to: '#ffffff' }, embedColor: '#ff0000' });
    expect(ok.status).toBe(200);
    const me = await h.agent().get('/api/auth/me');
    expect(me.body.settings['seo.ogCard']).toMatchObject({ layout: 'split', embedColor: '#ff0000', font: 'sans' });
    const bad = await admin.put('/api/admin/seo/og-card', { background: { kind: 'image', image: 'https://evil.example/x.png' } });
    expect(bad.status).toBe(422);
    expect((await h.agent().put('/api/admin/seo/og-card', {})).status).toBe(401);
  });
});
