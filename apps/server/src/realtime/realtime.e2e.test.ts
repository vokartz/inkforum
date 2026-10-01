import { get, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RealtimeEvent } from '@forum/shared';
import { createHarness, ORIGIN, registerActive, type Agent, type Harness } from '../testing/harness.js';
import { NotificationsService } from '../notifications/notifications.service.js';

let h: Harness;
let base: string;
let ali: Agent;
let ayse: Agent;
let ayseId: number;

/** Olay akışını açar; gelen olayları biriktirir */
function openStream(
  agent: Agent,
): Promise<{
  events: RealtimeEvent[];
  res: IncomingMessage;
  next: (type: string) => Promise<RealtimeEvent>;
}> {
  return new Promise((resolve, reject) => {
    const events: RealtimeEvent[] = [];
    const waiters: Array<{ type: string; fn: (e: RealtimeEvent) => void }> = [];
    const req = get(
      `${base}/api/me/stream`,
      { headers: { cookie: agent.cookieHeader(), origin: ORIGIN, accept: 'text/event-stream' } },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buf += chunk;
          let i: number;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const data = block.split('\n').find((l) => l.startsWith('data: '));
            if (!data) continue;
            const e = JSON.parse(data.slice(6)) as RealtimeEvent;
            events.push(e);
            for (const w of waiters.filter((w) => w.type === e.type)) {
              waiters.splice(waiters.indexOf(w), 1);
              w.fn(e);
            }
          }
        });
        const next = (type: string) =>
          new Promise<RealtimeEvent>((ok, fail) => {
            const found = events.find((e) => e.type === type);
            if (found) {
              events.splice(events.indexOf(found), 1);
              return ok(found);
            }
            const timer = setTimeout(() => fail(new Error(`"${type}" olayı gelmedi`)), 3000);
            waiters.push({
              type,
              fn: (e) => (clearTimeout(timer), events.splice(events.indexOf(e), 1), ok(e)),
            });
          });
        resolve({ events, res, next });
      },
    );
    req.on('error', reject);
  });
}

beforeAll(async () => {
  h = await createHarness();
  await h.settings.set('messages.floodSeconds', 0);
  const server = h.app.getHttpServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ali = await registerActive(h, 'Ali');
  ayse = await registerActive(h, 'Ayse');
  ayseId = (
    await h.db.q.selectFrom('users').select('id').where('username', '=', 'Ayse').executeTakeFirstOrThrow()
  ).id;
});

afterAll(async () => {
  await h.close();
});

describe('realtime stream', () => {
  it('requires a session', async () => {
    const res = await h.agent().get('/api/me/stream');
    expect(res.status).toBe(401);
  });

  it('pushes new messages, read receipts and notifications', async () => {
    const stream = await openStream(ayse);
    expect(stream.res.headers['content-type']).toContain('text/event-stream');
    await stream.next('hello');

    const created = await ali.post('/api/messages', {
      recipientIds: [ayseId],
      title: 'Selam',
      body: 'Merhaba [b]Ayşe[/b], nasılsın?',
    });
    expect(created.status).toBe(201);
    const msg = await stream.next('message');
    expect(msg).toMatchObject({
      type: 'message',
      conversationId: created.body.id,
      title: 'Selam',
      from: { name: 'Ali' },
    });
    expect((msg as Extract<RealtimeEvent, { type: 'message' }>).excerpt).toBe('Merhaba Ayşe, nasılsın?');

    // Ayşe okuyunca Ali'nin açık sekmesi "görüldü" bilgisini alır
    const aliStream = await openStream(ali);
    await aliStream.next('hello');
    expect((await ayse.get(`/api/messages/${created.body.id}`)).status).toBe(200);
    expect(await aliStream.next('conversationRead')).toMatchObject({
      conversationId: created.body.id,
      userId: ayseId,
    });
    await stream.next('counters');

    await h.app
      .get(NotificationsService)
      .notify(ayseId, 'forum.topicAccess', { topicId: 1, title: 'Gizli konu' });
    expect(await stream.next('notification')).toMatchObject({ notificationType: 'forum.topicAccess' });

    stream.res.destroy();
    aliStream.res.destroy();
  });
});
