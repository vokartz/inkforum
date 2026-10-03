import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registrationPolicyIds, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let admin: Agent;

beforeAll(async () => {
  h = await createHarness();
  await h.settings.set('registration.mode', 'open');
  admin = await adminAgent(h);
});

afterAll(async () => {
  await h.close();
});

async function solve(agent: Agent): Promise<string> {
  const { token, question } = (await agent.get('/api/auth/captcha')).body as { token: string; question: string };
  const [a, op, b] = question.split(' ');
  return `${token}|${op === '+' ? Number(a) + Number(b) : Number(a) - Number(b)}`;
}

describe('captcha', () => {
  it('is off by default', async () => {
    const res = await h.agent().post('/api/auth/password/forgot', { email: 'yok@example.com' });
    expect(res.status).toBe(200);
  });

  it('requires external providers to have keys', async () => {
    const res = await admin.put('/api/admin/captcha', { provider: 'turnstile', siteKey: '' });
    expect(res.status).toBe(422);
  });

  it('protects the chosen forms with the built-in question', async () => {
    const saved = await admin.put('/api/admin/captcha', { provider: 'builtin', forms: { register: true, login: true, forgot: false } });
    expect(saved.status).toBe(200);
    const guest = h.agent();
    expect((await guest.post('/api/auth/login', { identifier: 'x', password: 'y' })).body.error.fields.captcha).toBeTruthy();
    const wrong = (await solve(guest)).replace(/\|.*/, '|999');
    expect((await guest.post('/api/auth/login', { identifier: 'x', password: 'y', captcha: wrong })).body.error.fields?.captcha).toBeTruthy();
    const ok = await solve(guest);
    const res = await guest.post('/api/auth/login', { identifier: 'x', password: 'y', captcha: ok });
    expect(res.body.error.fields?.captcha).toBeUndefined();
    expect((await guest.post('/api/auth/login', { identifier: 'x', password: 'y', captcha: ok })).body.error.fields?.captcha).toBeTruthy();
    const reg = await guest.post('/api/auth/register', { username: 'Robot', email: 'r@example.com', password: 'Password123', acceptedPolicyVersionIds: await registrationPolicyIds(guest) });
    expect(reg.body.error.fields.captcha).toBeTruthy();
    const human = await guest.post('/api/auth/register', {
      username: 'Insan',
      email: 'i@example.com',
      password: 'Password123',
      acceptedPolicyVersionIds: await registrationPolicyIds(guest),
      captcha: await solve(guest),
    });
    expect(human.status).toBe(201);
    expect((await guest.post('/api/auth/password/forgot', { email: 'i@example.com' })).status).toBe(200);
    const me = await h.agent().get('/api/auth/me');
    expect(me.body.settings['captcha.config'].provider).toBe('builtin');
    expect(me.body.settings['captcha.secretEnc']).toBeUndefined();
  });
});
