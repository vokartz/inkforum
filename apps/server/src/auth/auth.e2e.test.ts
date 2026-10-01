import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, createHarness, registrationPolicyIds, type Harness } from '../testing/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});

afterAll(async () => {
  await h.close();
});

describe('bootstrap', () => {
  it('reports health', async () => {
    const res = await h.agent().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe(process.env.TEST_DB_DRIVER ?? 'sqlite');
  });

  it('exposes guest viewer with public settings', async () => {
    const res = await h.agent().get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
    expect(res.body.settings['general.forumName']).toBe('Forum');
    expect(res.body.permissions).toContain('profile.view');
    expect(res.body.permissions).not.toContain('admin.access');
  });

  it('seeds the default admin with all permissions', async () => {
    const agent = h.agent();
    const login = await agent.post('/api/auth/login', { identifier: ADMIN.username, password: ADMIN.password });
    expect(login.status).toBe(200);
    expect(login.body.status).toBe('ok');
    const me = await agent.get('/api/auth/me');
    expect(me.body.user.username).toBe(ADMIN.username);
    expect(me.body.isAdmin).toBe(true);
    expect(me.body.permissions).toContain('admin.access');
    expect(me.body.flags.pendingPolicies).toEqual([]);
    expect(me.body.user.primaryGroup.name).toBe('Yönetici');
    expect(me.body.user.color).toBe('#dc2626');
  });

  it('rejects mutating requests without a matching Origin', async () => {
    const { default: request } = await import('supertest');
    const bad = await request(h.app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', 'http://evil.test')
      .send({ identifier: 'x', password: 'y' });
    expect(bad.status).toBe(403);
    expect(bad.body.error.code).toBe('BAD_ORIGIN');
  });
});

describe('registration with email verification', () => {
  it('registers, verifies email and logs in', async () => {
    await h.settings.set('registration.mode', 'email');
    const agent = h.agent();
    const policyIds = await registrationPolicyIds(agent);
    expect(policyIds.length).toBe(3);

    const missing = await agent.post('/api/auth/register', {
      username: 'Ayşe',
      email: 'ayse@forum.test',
      password: 'Password123',
      acceptedPolicyVersionIds: [],
    });
    expect(missing.status).toBe(422);
    expect(Object.keys(missing.body.error.fields)).toContain('policy_terms');

    const res = await agent.post('/api/auth/register', {
      username: 'Ayşe',
      email: 'ayse@forum.test',
      password: 'Password123',
      acceptedPolicyVersionIds: policyIds,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_email');
    expect(agent.hasSession()).toBe(false);

    const early = await agent.post('/api/auth/login', { identifier: 'AYŞE', password: 'Password123' });
    expect(early.status).toBe(403);
    expect(early.body.error.code).toBe('ACCOUNT_PENDING_EMAIL');

    const mail = await agent.get('/api/_test/mail/last?to=ayse@forum.test');
    expect(mail.status).toBe(200);
    const token = /verify-email\/([\w-]+)/.exec(mail.body.link)![1];

    const verify = await agent.post('/api/auth/verify-email', { token });
    expect(verify.status).toBe(200);
    expect(verify.body.status).toBe('active');
    expect(agent.hasSession()).toBe(true);

    const reuse = await agent.post('/api/auth/verify-email', { token });
    expect(reuse.body.error.code).toBe('TOKEN_INVALID');

    const me = await agent.get('/api/auth/me');
    expect(me.body.user.displayName).toBe('Ayşe');
    expect(me.body.user.emailVerified).toBe(true);
    expect(me.body.flags.pendingPolicies).toEqual([]);
    expect(me.body.user.primaryGroup.name).toBe('Yeni Üye');

    await agent.post('/api/auth/logout');
    const after = await agent.get('/api/auth/me');
    expect(after.body.user).toBeNull();
  });

  it('treats Turkish dotted/dotless i names as the same', async () => {
    await h.settings.set('registration.mode', 'open');
    const agent = h.agent();
    const policyIds = await registrationPolicyIds(agent);
    const first = await agent.post('/api/auth/register', {
      username: 'Ilker',
      email: 'ilker1@forum.test',
      password: 'Password123',
      acceptedPolicyVersionIds: policyIds,
    });
    expect(first.status).toBe(201);
    const second = await h.agent().post('/api/auth/register', {
      username: 'İlker',
      email: 'ilker2@forum.test',
      password: 'Password123',
      acceptedPolicyVersionIds: policyIds,
    });
    expect(second.status).toBe(422);
    expect(second.body.error.fields.username).toMatch(/alınmış/);
  });

  it('blocks reserved names and weak passwords', async () => {
    const res = await h.agent().post('/api/auth/register', {
      username: 'SuperAdmin',
      email: 'sa@forum.test',
      password: 'short',
      acceptedPolicyVersionIds: await registrationPolicyIds(h.agent()),
    });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.username).toBeDefined();
    expect(res.body.error.fields.password).toBeDefined();
  });

  it('holds accounts for approval in approval mode', async () => {
    await h.settings.set('registration.mode', 'approval');
    const agent = h.agent();
    const res = await agent.post('/api/auth/register', {
      username: 'Bekleyen',
      email: 'bekleyen@forum.test',
      password: 'Password123',
      acceptedPolicyVersionIds: await registrationPolicyIds(agent),
    });
    expect(res.body.status).toBe('pending_approval');
    const login = await agent.post('/api/auth/login', { identifier: 'bekleyen', password: 'Password123' });
    expect(login.body.error.code).toBe('ACCOUNT_PENDING_APPROVAL');
  });

  it('refuses registration when closed', async () => {
    await h.settings.set('registration.mode', 'closed');
    const res = await h.agent().post('/api/auth/register', {
      username: 'Kapali',
      email: 'kapali@forum.test',
      password: 'Password123',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('REGISTRATION_CLOSED');
    await h.settings.set('registration.mode', 'open');
  });
});

describe('login security', () => {
  it('locks the account after repeated failures', async () => {
    await h.settings.set('security.loginMaxAttempts', 3);
    const agent = h.agent();
    for (let i = 0; i < 3; i++) {
      const r = await agent.post('/api/auth/login', { identifier: 'ilker', password: 'wrong-password' });
      expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
    }
    const locked = await agent.post('/api/auth/login', { identifier: 'ilker', password: 'Password123' });
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    h.clock.advance(16 * 60_000);
    const ok = await agent.post('/api/auth/login', { identifier: 'İLKER', password: 'Password123' });
    expect(ok.status).toBe(200);
    await h.settings.set('security.loginMaxAttempts', 5);
  });

  it('resets the password and revokes existing sessions', async () => {
    const session = h.agent();
    expect((await session.post('/api/auth/login', { identifier: 'ilker', password: 'Password123' })).status).toBe(200);

    const anon = h.agent();
    const forgot = await anon.post('/api/auth/password/forgot', { email: 'ilker1@forum.test' });
    expect(forgot.status).toBe(200);
    const unknown = await anon.post('/api/auth/password/forgot', { email: 'yok@forum.test' });
    expect(unknown.status).toBe(200);

    const mail = await anon.get('/api/_test/mail/last?to=ilker1@forum.test');
    const token = /reset-password\/([\w-]+)/.exec(mail.body.link)![1];
    expect((await anon.post('/api/auth/password/reset/check', { token })).body.valid).toBe(true);

    const weak = await anon.post('/api/auth/password/reset', { token, password: 'abc' });
    expect(weak.status).toBe(422);
    const reset = await anon.post('/api/auth/password/reset', { token, password: 'NewPassword456' });
    expect(reset.status).toBe(200);

    const me = await session.get('/api/auth/me');
    expect(me.body.user).toBeNull();

    const login = await h.agent().post('/api/auth/login', { identifier: 'ilker', password: 'NewPassword456' });
    expect(login.status).toBe(200);
  });
});

describe('forced flows', () => {
  it('forces a password change when flagged', async () => {
    await h.db.q.updateTable('users').set({ must_change_password: 1 }).where('username', '=', 'Ilker').execute();
    const agent = h.agent();
    await agent.post('/api/auth/login', { identifier: 'ilker', password: 'NewPassword456' });
    const me = await agent.get('/api/auth/me');
    expect(me.body.flags.mustChangePassword).toBe(true);
    const change = await agent.post('/api/auth/password/change', { newPassword: 'Changed789' });
    expect(change.status).toBe(200);
    const after = await agent.get('/api/auth/me');
    expect(after.body.flags.mustChangePassword).toBe(false);
  });

  it('requires re-acceptance after a policy update', async () => {
    const admin = h.agent();
    await admin.post('/api/auth/login', { identifier: ADMIN.username, password: ADMIN.password });

    const user = h.agent();
    await user.post('/api/auth/login', { identifier: 'ilker', password: 'Changed789' });
    expect((await user.get('/api/auth/me')).body.flags.pendingPolicies).toEqual([]);

    const policies = h.app.get((await import('../policies/policies.service.js')).PoliciesService);
    const rules = (await policies.adminList()).find((p) => p.key === 'rules')!;
    const versionId = await policies.createVersion(
      rules.id,
      { title: 'Forum Kuralları', bodyMd: 'Yeni kurallar', requiresReacceptance: true, changeNote: 'Güncellendi' },
      null,
    );
    await policies.publish(versionId);

    const me = await user.get('/api/auth/me');
    expect(me.body.flags.pendingPolicies.map((p: { key: string }) => p.key)).toEqual(['rules']);

    const accept = await user.post('/api/auth/policies/accept', { policyVersionIds: [versionId] });
    expect(accept.status).toBe(200);
    expect((await user.get('/api/auth/me')).body.flags.pendingPolicies).toEqual([]);
  });
});
