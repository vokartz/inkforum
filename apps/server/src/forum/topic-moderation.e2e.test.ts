import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let admin: Agent;
let ali: Agent;
let ayse: Agent;
let boardId: number;
let topicId: number;
let postId: number;

beforeAll(async () => {
  h = await createHarness();
  await h.settings.set('forum.floodSeconds', 0);
  admin = await adminAgent(h);
  ali = await registerActive(h, 'Ali');
  ayse = await registerActive(h, 'Ayse');
  const cat = await admin.post('/api/admin/forum/categories', { name: 'Başvurular', description: '' });
  const res = await admin.post('/api/admin/forum/boards', {
    categoryId: cat.body.id,
    name: 'Yetkili Başvuruları',
    requireApprovalTopics: true,
    privateTopics: true,
    topicTemplate: {
      enabled: true,
      titleTemplate: '{user} — {nick}',
      allowMessage: true,
      fields: [
        { id: 'nick', label: 'Oyundaki adın', type: 'text', required: true },
        { id: 'role', label: 'Rol', type: 'select', options: ['Moderatör', 'Destek'], required: true },
        { id: 'days', label: 'Uygun günler', type: 'checkbox', options: ['Hafta içi', 'Hafta sonu'] },
      ],
    },
  });
  expect(res.status).toBe(201);
  boardId = res.body.id;
});

afterAll(async () => {
  await h.close();
});

describe('topic templates', () => {
  it('exposes the template on the new topic form', async () => {
    const ctx = await ali.get(`/api/boards/${boardId}/new`);
    expect(ctx.status).toBe(200);
    expect(ctx.body.template.enabled).toBe(true);
    expect(ctx.body.template.fields.map((f: { id: string }) => f.id)).toEqual(['nick', 'role', 'days']);
    expect(ctx.body.privateTopics).toBe(true);
  });

  it('rejects missing or invalid answers', async () => {
    const missing = await ali.post(`/api/boards/${boardId}/topics`, { title: '', body: '', answers: { role: 'Destek' } });
    expect(missing.status).toBe(422);
    expect(missing.body.error.fields).toHaveProperty('answers.nick');
    const bad = await ali.post(`/api/boards/${boardId}/topics`, { title: '', body: '', answers: { nick: 'Kral', role: 'Başkan' } });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields).toHaveProperty('answers.role');
  });

  it('builds the title and body from the answers', async () => {
    const res = await ali.post(`/api/boards/${boardId}/topics`, {
      title: '',
      body: 'Ek notum',
      answers: { nick: 'Kral', role: 'Destek', days: ['Hafta sonu', 'Geçersiz'] },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ approved: false, hidden: true });
    topicId = res.body.topicId;
    postId = res.body.postId;
    const topic = await ali.get(`/api/topics/${topicId}`);
    expect(topic.body.topic.title).toBe('Ali — Kral');
    expect(topic.body.topic.isHidden).toBe(true);
    const source = await ali.get(`/api/posts/${postId}/source`);
    expect(source.body.bbcode).toContain('[b]Oyundaki adın[/b]\nKral');
    expect(source.body.bbcode).toContain('[*]Hafta sonu');
    expect(source.body.bbcode).not.toContain('Geçersiz');
    expect(source.body.bbcode).toContain('Ek notum');
  });
});

describe('approval queue and hidden topics', () => {
  it('lists pending content for moderators only', async () => {
    const queue = await admin.get('/api/mod/queue');
    expect(queue.status).toBe(200);
    expect(queue.body.items).toEqual([expect.objectContaining({ postId, topicId, isTopic: true, isHidden: true })]);
    expect((await admin.get('/api/me/counters')).body.modQueue).toBe(1);
    expect((await ayse.get('/api/mod/queue')).body.items).toEqual([]);
    expect((await ayse.get('/api/me/counters')).body.modQueue).toBe(0);
  });

  it('approves from the queue but keeps the topic private', async () => {
    expect((await admin.post(`/api/posts/${postId}/approve`)).status).toBe(200);
    expect((await admin.get('/api/mod/queue')).body.total).toBe(0);
    expect((await ayse.get(`/api/topics/${topicId}`)).status).toBe(404);
    expect((await h.agent().get(`/api/topics/${topicId}`)).status).toBe(404);
    const list = await ayse.get(`/api/boards/${boardId}`);
    expect(list.body.topics.items).toEqual([]);
    const own = await ali.get(`/api/boards/${boardId}`);
    expect(own.body.topics.items.map((t: { id: number }) => t.id)).toContain(topicId);
  });

  it('lets moderators unhide a topic', async () => {
    expect((await ali.post(`/api/mod/topics/${topicId}/unhide`)).status).toBe(403);
    expect((await admin.post(`/api/mod/topics/${topicId}/unhide`)).status).toBe(200);
    const seen = await ayse.get(`/api/topics/${topicId}`);
    expect(seen.status).toBe(200);
    expect(seen.body.topic.isHidden).toBe(false);
    expect((await admin.post(`/api/mod/topics/${topicId}/hide`)).status).toBe(200);
    expect((await ayse.get(`/api/topics/${topicId}`)).status).toBe(404);
  });
});

describe('hidden topic members', () => {
  it('lets moderators add and remove members', async () => {
    const ayseId = (await h.db.q.selectFrom('users').select('id').where('username', '=', 'Ayse').executeTakeFirstOrThrow()).id;
    expect((await ayse.get(`/api/topics/${topicId}`)).status).toBe(404);
    expect((await ali.post(`/api/mod/topics/${topicId}/members`, { userId: ayseId })).status).toBe(403);

    const added = await admin.post(`/api/mod/topics/${topicId}/members`, { userId: ayseId });
    expect(added.status).toBe(200);
    expect(added.body.items.map((m: { user: { id: number } }) => m.user.id)).toEqual([ayseId]);

    expect((await ayse.get(`/api/topics/${topicId}`)).status).toBe(200);
    const list = await ayse.get(`/api/boards/${boardId}`);
    expect(list.body.topics.items.map((t: { id: number }) => t.id)).toContain(topicId);
    const notes = await ayse.get('/api/me/notifications');
    expect(JSON.stringify(notes.body)).toContain('forum.topicAccess');
    expect((await h.agent().get(`/api/topics/${topicId}`)).status).toBe(404);

    const removed = await admin.delete(`/api/mod/topics/${topicId}/members/${ayseId}`);
    expect(removed.status).toBe(200);
    expect(removed.body.items).toEqual([]);
    expect((await ayse.get(`/api/topics/${topicId}`)).status).toBe(404);
  });
});
