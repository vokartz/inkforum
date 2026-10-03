import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let admin: Agent;
let ali: Agent;

beforeAll(async () => {
  h = await createHarness();
  await h.settings.set('forum.floodSeconds', 0);
  admin = await adminAgent(h);
  ali = await registerActive(h, 'Ali');
});

afterAll(async () => {
  await h.close();
});

describe('discord plugin', () => {
  it('posts new public topics to the webhook and shows the widget', async () => {
    expect((await admin.put('/api/admin/plugins/discord', { enabled: true })).status).toBe(200);
    expect(
      (
        await admin.put('/api/admin/discord', {
          webhookUrl: 'https://example.com/hook',
          boardIds: [],
          replies: false,
          guildId: '',
          inviteUrl: '',
        })
      ).status,
    ).toBe(422);
    const realFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: unknown }> = [];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('https://discord.com/api/webhooks/')) {
        calls.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
        return new Response(null, { status: 204 });
      }
      if (url.startsWith('https://discord.com/api/guilds/')) {
        return Response.json({
          name: 'Lunar',
          presence_count: 321,
          instant_invite: 'https://discord.gg/lunar',
          members: [{ username: 'Bot', status: 'online' }],
        });
      }
      return realFetch(input, init);
    });
    try {
      const saved = await admin.put('/api/admin/discord', {
        webhookUrl: 'https://discord.com/api/webhooks/123456/abc-DEF',
        boardIds: [],
        replies: false,
        guildId: '123456789012345678',
        inviteUrl: '',
      });
      expect(saved.status).toBe(200);
      expect(saved.body.widget).toMatchObject({
        name: 'Lunar',
        online: 321,
        inviteUrl: 'https://discord.gg/lunar',
      });
      expect(JSON.stringify((await admin.get('/api/admin/discord')).body)).not.toContain('abc-DEF');

      const forum = await ali.get('/api/forum');
      const boardId = forum.body.postableBoards[0].id;
      const topic = await ali.post(`/api/boards/${boardId}/topics`, {
        title: 'Discord denemesi',
        body: 'Merhaba [b]Discord[/b]!',
      });
      expect(topic.status, JSON.stringify(topic.body)).toBe(201);
      await h.jobs.drain();
      expect(calls).toHaveLength(1);
      expect(calls[0]!.body).toMatchObject({
        embeds: [{ title: 'Discord denemesi', description: 'Merhaba Discord!', author: { name: 'Ali' } }],
        allowed_mentions: { parse: [] },
      });

      expect((await ali.post(`/api/topics/${topic.body.topicId}/posts`, { body: 'yanıt' })).status).toBe(201);
      await h.jobs.drain();
      expect(calls).toHaveLength(1);

      expect((await h.agent().get('/api/discord/widget')).body.widget.online).toBe(321);
    } finally {
      spy.mockRestore();
    }
  });
});
