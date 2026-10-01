import { createServer as createHttpServer, type Server } from 'node:http';
import { createServer as createTcpServer, type Server as TcpServer } from 'node:net';
import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import type { AddressInfo } from 'node:net';
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

describe('shoutbox plugin', () => {
  it('is off until an admin enables it, then adds its home block', async () => {
    expect((await ali.get('/api/shoutbox')).status).toBe(404);
    const plugins = await admin.get('/api/admin/plugins');
    expect(plugins.body.items.find((p: { key: string }) => p.key === 'shoutbox')).toMatchObject({
      enabled: false,
    });
    expect((await admin.put('/api/admin/plugins/shoutbox', { enabled: true })).status).toBe(200);
    const home = await admin.get('/api/admin/home');
    expect(JSON.stringify(home.body)).toContain('"kind":"shoutbox"');
  });

  it('lets members post, everyone read and authors delete', async () => {
    const posted = await ali.post('/api/shoutbox', { body: '  Selam   millet!  ' });
    expect(posted.status).toBe(201);
    expect(posted.body).toMatchObject({
      body: 'Selam millet!',
      user: { displayName: 'Ali' },
      canDelete: true,
    });
    expect((await h.agent().post('/api/shoutbox', { body: 'misafir' })).status).toBe(401);
    const guest = await h.agent().get('/api/shoutbox');
    expect(guest.body.items.map((s: { body: string }) => s.body)).toEqual(['Selam millet!']);
    expect(guest.body.canPost).toBe(false);
    expect((await ali.post('/api/shoutbox', { body: 'çok hızlı' })).status).toBe(400);

    expect((await ali.delete(`/api/shoutbox/${posted.body.id}`)).status).toBe(200);
    expect((await h.agent().get('/api/shoutbox')).body.items).toEqual([]);
  });

  it('honours its settings', async () => {
    expect(
      (await admin.put('/api/admin/shoutbox', { maxLength: 20, history: 10, guests: false })).status,
    ).toBe(200);
    expect((await h.agent().get('/api/shoutbox')).status).toBe(401);
    await new Promise((r) => setTimeout(r, 3100));
    const long = await ali.post('/api/shoutbox', { body: 'x'.repeat(21) });
    expect(long.status).toBe(422);
  });
});

describe('game server plugin', () => {
  let http: Server;
  let tcp: TcpServer;
  let udp: UdpSocket;

  beforeAll(async () => {
    // FiveM: dynamic.json
    http = createHttpServer((req, res) => {
      if (req.url === '/dynamic.json')
        return void res.end(
          JSON.stringify({ clients: 42, sv_maxclients: 128, hostname: '^1Lunar ^7Roleplay' }),
        );
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
    // Minecraft: Server List Ping yanıtı
    tcp = createTcpServer((sock) => {
      sock.once('data', () => {
        const json = Buffer.from(
          JSON.stringify({
            players: { online: 7, max: 50 },
            description: { text: '§aLunar ', extra: [{ text: 'Survival' }] },
          }),
        );
        const v = (n: number) => {
          const out: number[] = [];
          do {
            let b = n & 0x7f;
            n >>>= 7;
            if (n) b |= 0x80;
            out.push(b);
          } while (n);
          return Buffer.from(out);
        };
        const payload = Buffer.concat([v(0), v(json.length), json]);
        sock.end(Buffer.concat([v(payload.length), payload]));
      });
    });
    await new Promise<void>((r) => tcp.listen(0, '127.0.0.1', () => r()));
    // SA-MP: "i" sorgusu
    udp = createSocket('udp4');
    udp.on('message', (msg, rinfo) => {
      const name = Buffer.from('Lunar SAMP', 'latin1');
      const out = Buffer.alloc(11 + 1 + 4 + 4 + name.length);
      msg.copy(out, 0, 0, 11);
      out.writeUInt8(0, 11);
      out.writeUInt16LE(15, 12);
      out.writeUInt16LE(100, 14);
      out.writeUInt32LE(name.length, 16);
      name.copy(out, 20);
      udp.send(out, rinfo.port, rinfo.address);
    });
    await new Promise<void>((r) => udp.bind(0, '127.0.0.1', () => r()));
  });

  afterAll(() => {
    http.close();
    tcp.close();
    udp.close();
  });

  it('queries FiveM, Minecraft and SA-MP servers', async () => {
    expect((await admin.put('/api/admin/plugins/gameserver', { enabled: true })).status).toBe(200);
    const servers = [
      { name: 'FiveM', type: 'fivem', host: '127.0.0.1', port: (http.address() as AddressInfo).port },
      { name: 'Minecraft', type: 'minecraft', host: '127.0.0.1', port: (tcp.address() as AddressInfo).port },
      { name: 'SA-MP', type: 'samp', host: '127.0.0.1', port: udp.address().port },
      { name: 'Kapalı', type: 'fivem', host: '127.0.0.1', port: 9 },
    ];
    const saved = await admin.put('/api/admin/gameservers', { servers });
    expect(saved.status).toBe(200);
    const res = await h.agent().get('/api/gameservers');
    const by = Object.fromEntries(res.body.items.map((s: { name: string }) => [s.name, s]));
    expect(by.FiveM).toMatchObject({
      online: true,
      players: 42,
      maxPlayers: 128,
      hostname: 'Lunar Roleplay',
    });
    expect(by.FiveM.connectUrl).toMatch(/^fivem:\/\/connect\/127\.0\.0\.1:\d+$/);
    expect(by.Minecraft).toMatchObject({
      online: true,
      players: 7,
      maxPlayers: 50,
      hostname: 'Lunar Survival',
      connectUrl: null,
    });
    expect(by['SA-MP']).toMatchObject({ online: true, players: 15, maxPlayers: 100, hostname: 'Lunar SAMP' });
    expect(by['SA-MP'].connectUrl).toMatch(/^samp:\/\//);
    expect(by['Kapalı']).toMatchObject({ online: false, players: null });
  });

  it('rejects invalid addresses', async () => {
    const bad = await admin.put('/api/admin/gameservers', {
      servers: [{ name: 'X', type: 'fivem', host: 'http://evil/', port: null }],
    });
    expect(bad.status).toBe(422);
  });
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

      // Yanıtlar kapalı: gönderilmez
      expect((await ali.post(`/api/topics/${topic.body.topicId}/posts`, { body: 'yanıt' })).status).toBe(201);
      await h.jobs.drain();
      expect(calls).toHaveLength(1);

      expect((await h.agent().get('/api/discord/widget')).body.widget.online).toBe(321);
    } finally {
      spy.mockRestore();
    }
  });
});
