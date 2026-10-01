import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, adminAgent, createHarness, loginAgent, registerActive, type Agent, type Harness } from './testing/harness.js';
import { PermissionsService } from './permissions/permissions.service.js';
import { GroupCacheService } from './groups/group-cache.service.js';
import { DAY } from './common/clock.js';

let h: Harness;
let admin: Agent;

beforeAll(async () => {
  h = await createHarness();
  admin = await adminAgent(h);
});

afterAll(async () => {
  await h.close();
});

async function userId(username: string): Promise<number> {
  const row = await h.db.q.selectFrom('users').select('id').where('username', '=', username).executeTakeFirstOrThrow();
  return row.id;
}

describe('admin access', () => {
  it('requires elevation for admin endpoints', async () => {
    const plain = await loginAgent(h, ADMIN.username, ADMIN.password);
    const res = await plain.get('/api/admin/dashboard');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ELEVATION_REQUIRED');
    expect((await plain.get('/api/admin/access')).body.elevated).toBe(false);

    const bad = await plain.post('/api/auth/elevate', { password: 'wrong' });
    expect(bad.status).toBe(422);
    expect((await plain.post('/api/auth/elevate', { password: ADMIN.password })).status).toBe(200);
    const ok = await plain.get('/api/admin/dashboard');
    expect(ok.status).toBe(200);
    expect(ok.body.stats.total).toBeGreaterThanOrEqual(1);

    h.clock.advance(31 * 60_000);
    expect((await plain.get('/api/admin/dashboard')).body.error.code).toBe('ELEVATION_REQUIRED');
    await plain.post('/api/auth/elevate', { password: ADMIN.password });
    admin = plain;
  });

  it('forbids admin endpoints for regular members', async () => {
    const member = await registerActive(h, 'Uye1');
    const res = await member.get('/api/admin/dashboard');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('updates settings with validation and audit', async () => {
    const bad = await admin.put('/api/admin/settings', { 'registration.minAge': 500 });
    expect(bad.status).toBe(422);
    const res = await admin.put('/api/admin/settings', { 'general.forumName': 'Deneme Forumu' });
    expect(res.status).toBe(200);
    expect(res.body.changed).toEqual(['general.forumName']);
    expect((await h.agent().get('/api/auth/me')).body.settings['general.forumName']).toBe('Deneme Forumu');
    const logs = await admin.get('/api/admin/logs?type=admin&action=settings');
    expect(logs.body.items[0].action).toBe('settings.update');
  });
});

describe('groups and permissions', () => {
  it('resolves allow/deny/inheritance correctly', async () => {
    const perms = h.app.get(PermissionsService);
    const cache = h.app.get(GroupCacheService);
    const member = await cache.bySystemKey('member');

    const g1 = await admin.post('/api/admin/groups', { name: 'VIP', color: '#aa00ff', iconCount: 2 });
    expect(g1.status).toBe(201);
    const vip = g1.body.id as number;
    const g2 = await admin.post('/api/admin/groups', { name: 'VIP Kopya', parentId: vip });
    const child = g2.body.id as number;

    await admin.put(`/api/admin/permissions/${vip}`, { values: { 'profile.customTitle': 1, 'profile.signature': -1 } });
    const r1 = await perms.resolve([member.id, vip]);
    expect(r1.permissions.has('profile.customTitle')).toBe(true);
    expect(r1.permissions.has('profile.signature')).toBe(false); // yasak kazanır

    const r2 = await perms.resolve([member.id, child]);
    expect(r2.permissions.has('profile.customTitle')).toBe(true); // ebeveynden miras

    const inheritEdit = await admin.put(`/api/admin/permissions/${child}`, { values: { 'profile.view': 1 } });
    expect(inheritEdit.status).toBe(400);

    const adminEdit = await admin.put(`/api/admin/permissions/${(await cache.bySystemKey('admin')).id}`, { values: { 'profile.view': -1 } });
    expect(adminEdit.status).toBe(400);

    const matrix = await admin.get('/api/admin/permissions');
    expect(matrix.body.values[vip]['profile.signature']).toBe(-1);
  });

  it('handles requestable groups with leaders and join requests', async () => {
    const g = await admin.post('/api/admin/groups', { name: 'Tasarımcılar', joinType: 'requestable', color: '#0ea5e9' });
    const groupId = g.body.id as number;
    const leader = await registerActive(h, 'Lider');
    const applicant = await registerActive(h, 'Aday');
    await admin.put(`/api/admin/groups/${groupId}/moderators`, { userIds: [await userId('Lider')] });

    const join = await applicant.post(`/api/groups/${groupId}/join`, { reason: 'Katılmak istiyorum' });
    expect(join.body.status).toBe('requested');
    const dup = await applicant.post(`/api/groups/${groupId}/join`, {});
    expect(dup.status).toBe(409);

    const leaderNotifs = await leader.get('/api/me/notifications');
    expect(leaderNotifs.body.items[0].type).toBe('group.request.new');

    const requests = await leader.get(`/api/groups/${groupId}/requests`);
    expect(requests.body).toHaveLength(1);
    const approve = await leader.post(`/api/groups/requests/${requests.body[0].id}`, { approve: true });
    expect(approve.status).toBe(200);

    const me = await applicant.get('/api/auth/me');
    expect(me.body.user.groups.map((x: { name: string }) => x.name)).toContain('Tasarımcılar');
    const detail = await applicant.get(`/api/groups/${groupId}`);
    expect(detail.body.isMember).toBe(true);
    expect(detail.body.memberCount).toBe(1);

    // Ek grubu ana grup yap → rengi isme yansır.
    await applicant.post('/api/me/groups/primary', { groupId });
    expect((await applicant.get('/api/auth/me')).body.user.color).toBe('#0ea5e9');

    const leave = await applicant.post(`/api/groups/${groupId}/leave`);
    expect(leave.status).toBe(200);
    expect((await applicant.get('/api/auth/me')).body.user.primaryGroup.name).toBe('Yeni Üye');
  });

  it('expires temporary memberships', async () => {
    const g = await admin.post('/api/admin/groups', { name: 'Süreli', color: '#f59e0b' });
    const groupId = g.body.id as number;
    await registerActive(h, 'Gecici');
    const uid = await userId('Gecici');
    const add = await admin.post(`/api/admin/groups/${groupId}/members`, { userId: uid, expiresAt: h.clock.now() + DAY });
    expect(add.status).toBe(200);
    const agent = await loginAgent(h, 'Gecici', 'Password123');
    expect((await agent.get('/api/auth/me')).body.user.groups.map((x: { name: string }) => x.name)).toContain('Süreli');

    h.clock.advance(2 * DAY);
    await h.jobs.runDueTasks(true);
    admin = await adminAgent(h);
    const relogged = await loginAgent(h, 'Gecici', 'Password123');
    const me = await relogged.get('/api/auth/me');
    expect(me.body.user.groups.map((x: { name: string }) => x.name)).not.toContain('Süreli');
    const notes = await relogged.get('/api/me/notifications');
    expect(notes.body.items.some((n: { type: string }) => n.type === 'group.removed')).toBe(true);
  });

  it('recalculates post-count groups', async () => {
    await registerActive(h, 'Yazar');
    const uid = await userId('Yazar');
    await admin.put(`/api/admin/users/${uid}`, { postCount: 300 });
    const profile = await admin.get(`/api/users/${uid}`);
    expect(profile.body.user.primaryGroup.name).toBe('Kıdemli Üye');
    expect(profile.body.user.primaryGroup.iconCount).toBe(3);
  });

  it('assigns a full group set from the admin user page', async () => {
    const cache = h.app.get(GroupCacheService);
    const gm = await cache.bySystemKey('global_moderator');
    const uid = await userId('Uye1');
    const res = await admin.put(`/api/admin/users/${uid}/groups`, { primaryGroupId: gm.id, additional: [] });
    expect(res.status).toBe(200);
    const member = await loginAgent(h, 'Uye1', 'Password123');
    const me = await member.get('/api/auth/me');
    expect(me.body.permissions).toContain('mod.warnings.issue');
    expect(me.body.user.color).toBe('#2563eb');
  });
});

describe('profiles', () => {
  it('edits profile, privacy and custom fields', async () => {
    const field = await admin.post('/api/admin/profile-fields', {
      key: 'discord',
      name: 'Discord',
      type: 'text',
      showOnRegister: true,
      visibility: 'members',
    });
    expect(field.status).toBe(201);

    const agent = await registerActive(h, 'Profilci');
    const uid = await userId('Profilci');
    const edit = await agent.put('/api/me/profile', {
      bio: '[b]Merhaba[/b] <script>alert(1)</script>',
      location: 'İstanbul',
      websiteUrl: 'https://ornek.com',
      birthdate: '1995-05-20',
      customFields: { discord: 'profilci#1234' },
    });
    expect(edit.status).toBe(200);

    const guest = await h.agent().get(`/api/users/${uid}`);
    expect(guest.body.bioHtml).toContain('<strong>Merhaba</strong>');
    expect(guest.body.bioHtml).not.toContain('<script>');
    expect(guest.body.customFields).toEqual([]); // yalnız üyelere açık
    expect(guest.body.birthdate).toBe('--05-20');

    const member = await loginAgent(h, 'Uye1', 'Password123');
    const seen = await member.get(`/api/users/${uid}`);
    expect(seen.body.customFields[0].value).toBe('profilci#1234');

    await agent.put('/api/me/privacy', { showOnline: false, birthdateVisibility: 'none', profileVisibility: 'members', showAchievements: true });
    const hidden = await h.agent().get(`/api/users/${uid}`);
    expect(hidden.status).toBe(401);
  });

  it('rejects SVG and oversized avatars', async () => {
    const agent = await loginAgent(h, 'Profilci', 'Password123');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const bad = await agent.upload('/api/me/avatar', 'file', svg, 'a.svg');
    expect(bad.status).toBe(422);

    // 1x1 PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const ok = await agent.upload('/api/me/avatar', 'file', png, 'a.png');
    expect(ok.status).toBe(200);
    expect(ok.body.avatarUrl).toMatch(/^\/uploads\/avatar\//);
    await h.jobs.drain();
    const achievements = await agent.get('/api/me/achievements');
    expect(achievements.body.map((a: { key: string }) => a.key)).toContain('show-your-face');
  });

  it('changes display name with uniqueness rules', async () => {
    const agent = await loginAgent(h, 'Profilci', 'Password123');
    const taken = await agent.post('/api/me/display-name', { displayName: 'uye1' });
    expect(taken.status).toBe(422);
    const ok = await agent.post('/api/me/display-name', { displayName: 'Profil Ustası' });
    expect(ok.status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user.displayName).toBe('Profil Ustası');
  });

  it('lists members and filters by search', async () => {
    const res = await h.agent().get('/api/members?q=profil');
    expect(res.status).toBe(401); // misafirler üye listesini göremez (varsayılan)
    const member = await loginAgent(h, 'Uye1', 'Password123');
    const list = await member.get('/api/members?q=profil');
    expect(list.body.items.map((i: { user: { username: string } }) => i.user.username)).toEqual(['Profilci']);
  });
});

describe('two-factor authentication', () => {
  it('enrolls, requires the code at login and accepts recovery codes', async () => {
    const { totpCode } = await import('./security/totp.js');
    const agent = await registerActive(h, 'Guvenli');
    const setup = await agent.post('/api/me/2fa/setup');
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    const confirm = await agent.post('/api/me/2fa/confirm', { code: totpCode(setup.body.secret, h.clock.now()) });
    expect(confirm.status).toBe(200);
    const codes = confirm.body.recoveryCodes as string[];
    expect(codes).toHaveLength(10);

    const fresh = h.agent();
    const login = await fresh.post('/api/auth/login', { identifier: 'Guvenli', password: 'Password123' });
    expect(login.body.status).toBe('two_factor_required');
    expect(fresh.hasSession()).toBe(false);

    // Aynı kod iki kez kabul edilmez (confirm sırasında kullanıldı).
    const replay = await fresh.post('/api/auth/login/2fa', { challenge: login.body.challenge, code: totpCode(setup.body.secret, h.clock.now()) });
    expect(replay.status).toBe(422);

    const recovery = await fresh.post('/api/auth/login/2fa', { challenge: login.body.challenge, code: codes[0] });
    expect(recovery.status).toBe(200);
    expect(fresh.hasSession()).toBe(true);
  });
});

describe('bans', () => {
  it('blocks registration by email domain and login by user trigger', async () => {
    const ban = await admin.post('/api/mod/bans', {
      name: 'Spam alan adı',
      reasonPublic: 'Spam',
      cannotRegister: true,
      triggers: [{ type: 'email_domain', value: 'spam.test' }],
    });
    expect(ban.status).toBe(201);
    await h.settings.set('registration.mode', 'open');
    const policies = (await h.agent().get('/api/auth/register')).body.policies.map((p: { versionId: number }) => p.versionId);
    const reg = await h.agent().post('/api/auth/register', {
      username: 'Spammer',
      email: 'x@spam.test',
      password: 'Password123',
      acceptedPolicyVersionIds: policies,
    });
    expect(reg.status).toBe(403);
    expect(reg.body.error.code).toBe('BANNED');

    await registerActive(h, 'Yasakli');
    const uid = await userId('Yasakli');
    const userBan = await admin.post('/api/mod/bans', {
      name: 'Yasaklı üye',
      cannotLogin: true,
      expiresAt: h.clock.now() + DAY,
      triggers: [{ type: 'user', value: String(uid) }],
    });
    const blocked = await h.agent().post('/api/auth/login', { identifier: 'Yasakli', password: 'Password123' });
    expect(blocked.body.error.code).toBe('BANNED');

    await admin.post(`/api/mod/bans/${userBan.body.id}/lift`);
    const ok = await h.agent().post('/api/auth/login', { identifier: 'Yasakli', password: 'Password123' });
    expect(ok.status).toBe(200);
  });

  it('matches IP ranges', async () => {
    const { parseIpPattern, ipToHex } = await import('./bans/ip.js');
    const range = parseIpPattern('10.0.0.0/8')!;
    expect(ipToHex('10.20.30.40')! >= range.low && ipToHex('10.20.30.40')! <= range.high).toBe(true);
    expect(ipToHex('11.0.0.1')! > range.high).toBe(true);
    const v6 = parseIpPattern('2001:db8::/32')!;
    expect(ipToHex('2001:db8::1')! >= v6.low && ipToHex('2001:db8::1')! <= v6.high).toBe(true);
    const wild = parseIpPattern('192.168.*.*')!;
    expect(ipToHex('192.168.5.9')! >= wild.low && ipToHex('192.168.5.9')! <= wild.high).toBe(true);
  });
});

describe('warnings', () => {
  it('issues warnings, applies thresholds and expires them', async () => {
    await registerActive(h, 'Kuralsiz');
    const uid = await userId('Kuralsiz');
    let mod = await loginAgent(h, 'Uye1', 'Password123'); // global moderatör

    const first = await mod.post(`/api/mod/users/${uid}/warnings`, { points: 30, reason: 'Hakaret', expiryDays: 10 });
    expect(first.status).toBe(201);
    let status = (await mod.get(`/api/mod/users/${uid}/warnings`)).body.status;
    expect(status.points).toBe(30);
    expect(status.watched).toBe(true);
    expect(status.moderatedUntil).not.toBeNull();

    await mod.post(`/api/mod/users/${uid}/warnings`, { points: 55, reason: 'Spam', expiryDays: 30 });
    status = (await mod.get(`/api/mod/users/${uid}/warnings`)).body.status;
    expect(status.points).toBe(85);
    expect(status.mutedUntil).not.toBeNull();
    // 80 puan eşiği: 7 günlük geçici yasak
    const blocked = await h.agent().post('/api/auth/login', { identifier: 'Kuralsiz', password: 'Password123' });
    expect(blocked.body.error.code).toBe('BANNED');

    const own = await loginAgent(h, 'Uye1', 'Password123');
    expect((await own.get(`/api/mod/users/${await userId('Uye1')}/warnings`)).status).toBe(200);

    h.clock.advance(11 * DAY);
    await h.app.get((await import('./warnings/warnings.service.js')).WarningsService).expireWarnings();
    admin = await adminAgent(h);
    mod = await loginAgent(h, 'Uye1', 'Password123');
    status = (await mod.get(`/api/mod/users/${uid}/warnings`)).body.status;
    expect(status.points).toBe(55);
    expect(status.moderatedUntil).not.toBeNull(); // 30 eşiği hâlâ aşılmış
    const items = (await mod.get(`/api/mod/users/${uid}/warnings`)).body.items;
    await mod.post(`/api/mod/warnings/${items[0].id}/revoke`, { reason: 'Hatalı' });
    status = (await mod.get(`/api/mod/users/${uid}/warnings`)).body.status;
    expect(status.points).toBe(0);
    expect(status.mutedUntil).toBeNull();
  });

  it('refuses to warn administrators', async () => {
    const mod = await loginAgent(h, 'Uye1', 'Password123');
    const res = await mod.post(`/api/mod/users/${await userId(ADMIN.username)}/warnings`, { points: 10, reason: 'Deneme' });
    expect(res.status).toBe(403);
  });
});

describe('achievements', () => {
  it('awards automatically, manually and by backfill', async () => {
    const created = await admin.post('/api/admin/achievements', {
      key: 'bir-gunluk',
      name: 'Bir Günlük',
      description: '1 gündür üye',
      tier: 1,
      points: 5,
      criteriaType: 'membership_days',
      criteria: { days: 1 },
    });
    expect(created.status).toBe(201);
    h.clock.advance(2 * DAY);
    admin = await adminAgent(h);
    await admin.post(`/api/admin/achievements/${created.body.id}/backfill`);
    await h.jobs.drain();
    const holders = await admin.get(`/api/admin/achievements/${created.body.id}/holders`);
    expect(holders.body.total).toBeGreaterThan(3);

    const catalog = await admin.get('/api/admin/achievements');
    const founder = catalog.body.items.find((a: { key: string }) => a.key === 'founder');
    const uid = await userId('Profilci');
    const award = await admin.post(`/api/admin/achievements/${founder.id}/award`, { userId: uid, reason: 'İlk üyelerden' });
    expect(award.status).toBe(200);
    const again = await admin.post(`/api/admin/achievements/${founder.id}/award`, { userId: uid });
    expect(again.status).toBe(409);

    const agent = await loginAgent(h, 'Profilci', 'Password123');
    const notifs = await agent.get('/api/me/notifications');
    expect(notifs.body.items.some((n: { type: string; data: { name: string } }) => n.type === 'achievement.awarded' && n.data.name === 'Kurucu')).toBe(true);
    const me = await agent.get('/api/auth/me');
    expect(me.body.user.achievementPoints).toBeGreaterThanOrEqual(105);

    await agent.put('/api/me/achievements/featured', { achievementIds: [founder.id] });
    const profile = await h.agent().get(`/api/users/${uid}`);
    expect(profile.status).toBe(401); // profil yalnız üyelere açık (önceki test)
    const viewer = await loginAgent(h, 'Uye1', 'Password123');
    const seen = await viewer.get(`/api/users/${uid}`);
    expect(seen.body.achievements.featured.map((a: { key: string }) => a.key)).toEqual(['founder']);
  });

  it('hides hidden achievements from non-earners', async () => {
    await admin.post('/api/admin/achievements', { key: 'gizli', name: 'Sır', description: 'Gizli görev', isHidden: true, criteriaType: null });
    const member = await loginAgent(h, 'Uye1', 'Password123');
    const catalog = await member.get('/api/achievements');
    const hidden = catalog.body.items.find((a: { key: string }) => a.key === 'gizli');
    expect(hidden.name).toBe('Gizli başarı');
  });
});

describe('admin user management', () => {
  it('approves pending members and deletes accounts', async () => {
    await h.settings.set('registration.mode', 'approval');
    const policies = (await h.agent().get('/api/auth/register')).body.policies.map((p: { versionId: number }) => p.versionId);
    await h.agent().post('/api/auth/register', { username: 'Onayli', email: 'onayli@forum.test', password: 'Password123', acceptedPolicyVersionIds: policies });
    await h.agent().post('/api/auth/register', { username: 'Reddedilen', email: 'red@forum.test', password: 'Password123', acceptedPolicyVersionIds: policies });

    const pending = await admin.get('/api/admin/users?status=pending_approval');
    expect(pending.body.items.map((i: { user: { username: string } }) => i.user.username).sort()).toEqual(['Onayli', 'Reddedilen']);

    expect((await admin.post(`/api/admin/users/${await userId('Onayli')}/approve`)).status).toBe(200);
    expect((await h.agent().post('/api/auth/login', { identifier: 'Onayli', password: 'Password123' })).status).toBe(200);

    const rejectId = await userId('Reddedilen');
    expect((await admin.post(`/api/admin/users/${rejectId}/reject`, { reason: 'Uygun değil' })).status).toBe(200);
    // İsim ve e-posta serbest kaldı
    await h.settings.set('registration.mode', 'open');
    const again = await h.agent().post('/api/auth/register', { username: 'Reddedilen', email: 'red@forum.test', password: 'Password123', acceptedPolicyVersionIds: policies });
    expect(again.status).toBe(201);

    const del = await admin.delete(`/api/admin/users/${await userId('Reddedilen')}`);
    expect(del.status).toBe(200);
    const self = await admin.delete(`/api/admin/users/${await userId(ADMIN.username)}`);
    expect(self.status).toBe(400);
  });
});
