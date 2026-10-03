import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';
import { GroupCacheService } from '../groups/group-cache.service.js';

let h: Harness;
let admin: Agent;
let alice: Agent;
let bob: Agent;
let staffGroup: number;
let reviewerGroup: number;

beforeAll(async () => {
  h = await createHarness();
  admin = await adminAgent(h);
  alice = await registerActive(h, 'Basvuran');
  bob = await registerActive(h, 'Inceleyici');
  const g1 = await admin.post('/api/admin/groups', { name: 'Ekip', kind: 'regular' });
  const g2 = await admin.post('/api/admin/groups', { name: 'İnceleme', kind: 'regular' });
  staffGroup = g1.body.id;
  reviewerGroup = g2.body.id;
  await h.app.get(GroupCacheService).invalidate();
  const bobId = (await h.db.q.selectFrom('users').select('id').where('username', '=', 'Inceleyici').executeTakeFirstOrThrow()).id;
  await admin.post(`/api/admin/groups/${reviewerGroup}/members`, { userId: bobId, asPrimary: false, expiresAt: null });
});

afterAll(async () => {
  await h.close();
});

const form = () => ({
  slug: 'ekip-basvurusu',
  title: 'Ekip başvurusu',
  description: '[b]Ekibe katıl[/b]',
  questions: [
    { id: 'yas', type: 'number', label: 'Kaç yaşındasın?' },
    { id: 'neden', type: 'textarea', label: 'Neden katılmak istiyorsun?', minLength: 10 },
    { id: 'rol', type: 'select', label: 'Rol', options: ['Moderatör', 'Etkinlik'] },
    { id: 'kurallar', type: 'yesno', label: 'Kuralları okudun mu?' },
  ],
  requirements: { emailVerified: false, minPosts: 0, cooldownDays: 3 },
  targetGroupId: staffGroup,
  reviewerGroupIds: [reviewerGroup],
  rejectMessage: 'Şimdilik uygun değil.',
});

describe('applications', () => {
  it('lets admins build forms and validates questions', async () => {
    const bad = await admin.post('/api/admin/application-forms', { ...form(), questions: [{ id: 'x', type: 'select', label: 'Seç', options: ['tek'] }] });
    expect(bad.status).toBe(422);
    expect((await alice.post('/api/admin/application-forms', form())).status).toBe(403);
    const ok = await admin.post('/api/admin/application-forms', form());
    expect(ok.status).toBe(201);
    expect(ok.body.questions).toHaveLength(4);

    const list = (await alice.get('/api/applications')).body;
    expect(list[0]).toMatchObject({ slug: 'ekip-basvurusu', eligibility: { ok: true, blocker: null } });
    const view = (await alice.get('/api/applications/forms/ekip-basvurusu')).body;
    expect(view.descriptionHtml).toContain('<strong>Ekibe katıl</strong>');
    expect(view.canReview).toBe(false);
  });

  it('validates answers, blocks duplicates, and runs the review flow', async () => {
    const invalid = await alice.post('/api/applications/forms/ekip-basvurusu', { answers: { yas: 'on sekiz', neden: 'kısa', rol: 'Admin' } });
    expect(invalid.status).toBe(422);
    expect(Object.keys(invalid.body.error.fields).sort()).toEqual(['answers.kurallar', 'answers.neden', 'answers.rol', 'answers.yas']);

    const sent = await alice.post('/api/applications/forms/ekip-basvurusu', { answers: { yas: 21, neden: 'Topluluğa katkı sağlamak istiyorum.', rol: 'Etkinlik', kurallar: true } });
    expect(sent.status).toBe(201);
    const dup = await alice.post('/api/applications/forms/ekip-basvurusu', { answers: { yas: 21, neden: 'Topluluğa katkı sağlamak istiyorum.', rol: 'Etkinlik', kurallar: true } });
    expect(dup.status).toBe(403);

    const queue = (await bob.get('/api/applications/review?status=open')).body;
    expect(queue.items.map((i: { id: number }) => i.id)).toEqual([sent.body.id]);
    const outsider = await registerActive(h, 'Yabanci');
    expect((await outsider.get(`/api/applications/${sent.body.id}`)).status).toBe(404);
    expect((await outsider.get('/api/applications/review')).status).toBe(403);

    await bob.post(`/api/applications/${sent.body.id}/claim`);
    await bob.post(`/api/applications/${sent.body.id}/notes`, { body: 'İç not: iyi görünüyor', internal: true });
    await bob.post(`/api/applications/${sent.body.id}/notes`, { body: 'Mülakat için Discord’a gel.' });
    const mine = (await alice.get(`/api/applications/${sent.body.id}`)).body;
    expect(mine.status).toBe('reviewing');
    expect(mine.notes.map((n: { body: string }) => n.body)).toEqual(['Mülakat için Discord’a gel.']);
    expect(mine.applicant).toBeNull();
    const full = (await bob.get(`/api/applications/${sent.body.id}`)).body;
    expect(full.notes).toHaveLength(2);
    expect(full.answers.find((a: { question: { id: string } }) => a.question.id === 'rol').value).toBe('Etkinlik');

    expect((await alice.post(`/api/applications/${sent.body.id}/decide`, { decision: 'approve' })).status).toBe(403);
    expect((await bob.post(`/api/applications/${sent.body.id}/decide`, { decision: 'approve', reason: 'Hoş geldin!' })).status).toBe(200);
    const after = (await alice.get(`/api/applications/${sent.body.id}`)).body;
    expect(after).toMatchObject({ status: 'approved', decisionReason: 'Hoş geldin!' });
    const aliceId = (await h.db.q.selectFrom('users').select('id').where('username', '=', 'Basvuran').executeTakeFirstOrThrow()).id;
    const member = await h.db.q.selectFrom('group_members').select('group_id').where('user_id', '=', aliceId).where('group_id', '=', staffGroup).executeTakeFirst();
    expect(member).toBeTruthy();
    const el = (await alice.get('/api/applications/forms/ekip-basvurusu')).body.eligibility;
    expect(el.ok).toBe(false);
  });

  it('enforces the cooldown after a rejection', async () => {
    const carol = await registerActive(h, 'Reddedilen');
    const sent = await carol.post('/api/applications/forms/ekip-basvurusu', { answers: { yas: 30, neden: 'Deneyimliyim ve yardımcı olmak isterim.', rol: 'Moderatör', kurallar: false } });
    await admin.post(`/api/applications/${sent.body.id}/decide`, { decision: 'reject' });
    const detail = (await carol.get(`/api/applications/${sent.body.id}`)).body;
    expect(detail).toMatchObject({ status: 'rejected', decisionReason: 'Şimdilik uygun değil.' });
    const again = await carol.post('/api/applications/forms/ekip-basvurusu', { answers: { yas: 30, neden: 'Deneyimliyim ve yardımcı olmak isterim.', rol: 'Moderatör', kurallar: true } });
    expect(again.status).toBe(403);
    expect(again.body.error.message).toContain('gün sonra');
  });
});
