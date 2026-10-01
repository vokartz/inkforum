import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ORIGIN, adminAgent, createHarness, type Agent, type Harness } from '../testing/harness.js';
import { ipMatches } from './waf.service.js';

let h: Harness;
let admin: Agent;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36';
const raw = () => request(h.app.getHttpServer());

beforeAll(async () => {
  h = await createHarness();
  admin = await adminAgent(h);
});

afterAll(async () => {
  await h.close();
});

const base = { enabled: true, mode: 'all', captcha: 'builtin', rateLimitPerMinute: 1000 };

describe('waf', () => {
  it('matches IP ranges', () => {
    expect(ipMatches('10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(ipMatches('11.1.2.3', '10.0.0.0/8')).toBe(false);
    expect(ipMatches('2001:db8::5', '2001:db8::/32')).toBe(true);
    expect(ipMatches('1.2.3.4', '1.2.3.4')).toBe(true);
  });

  it('challenges guests, lets members and API keys through, and clears after the built-in check', async () => {
    const saved = await admin.put('/api/admin/waf', base);
    expect(saved.status).toBe(200);

    // Misafir: API isteği doğrulama ister, sayfa kapısı doğrulama sayfası döner
    const blocked = await raw().get('/api/forum').set('user-agent', UA);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('WAF_CHALLENGE');
    const gate = await raw().get('/api/waf/gate?path=/').set('user-agent', UA);
    expect(gate.body.action).toBe('challenge');
    expect(gate.body.html).toContain('Bağlantınız kontrol ediliyor');

    // Giriş yapmış yönetici etkilenmez
    expect((await admin.get('/api/forum')).status).toBe(200);

    // Yerleşik doğrulamayı çöz
    const pow = JSON.parse(/const P=(\{[^;]+\});/.exec(gate.body.html)![1]!) as { c: string; d: number; exp: number; sig: string };
    let n = 0;
    while (!createHash('sha256').update(`${pow.c}:${n}`).digest('hex').startsWith('0'.repeat(pow.d))) n++;
    const wrong = await raw().post('/api/waf/verify').set('user-agent', UA).set('origin', ORIGIN).send({ kind: 'pow', c: pow.c, n: String(n + 1), exp: pow.exp, sig: pow.sig });
    expect(wrong.status).toBe(403);
    const ok = await raw().post('/api/waf/verify').set('user-agent', UA).set('origin', ORIGIN).send({ kind: 'pow', c: pow.c, n: String(n), exp: pow.exp, sig: pow.sig });
    expect(ok.status).toBe(200);
    const cookie = (ok.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('forum_waf='))!.split(';')[0]!;
    expect((await raw().get('/api/forum').set('user-agent', UA).set('cookie', cookie)).status).toBe(200);
    // Çerez başka tarayıcıya taşınamaz, çözüm yeniden kullanılamaz
    expect((await raw().get('/api/forum').set('user-agent', 'Other/1.0').set('cookie', cookie)).status).toBe(403);
    const replay = await raw().post('/api/waf/verify').set('user-agent', UA).set('origin', ORIGIN).send({ kind: 'pow', c: pow.c, n: String(n), exp: pow.exp, sig: pow.sig });
    expect(replay.status).toBe(403);
  });

  it('blocks attack patterns and bad tools, and can be turned off', async () => {
    await admin.put('/api/admin/waf', { ...base, mode: 'off' });
    expect((await raw().get('/api/forum').set('user-agent', UA)).status).toBe(200);
    const xss = await raw().get('/api/search?q=%3Cscript%3Ealert(1)%3C/script%3E').set('user-agent', UA);
    expect(xss.status).toBe(403);
    expect(xss.body.error.code).toBe('WAF_BLOCKED');
    expect((await raw().get('/.env').set('user-agent', UA)).status).toBe(403);
    expect((await raw().get('/api/forum').set('user-agent', 'sqlmap/1.7')).status).toBe(403);
    const events = (await admin.get('/api/admin/waf')).body.events;
    expect(events.some((e: { reason: string }) => e.reason.includes('XSS'))).toBe(true);
    await admin.put('/api/admin/waf', { ...base, enabled: false });
    expect((await raw().get('/api/forum').set('user-agent', 'sqlmap/1.7')).status).toBe(200);
  });

  it('requires keys for third-party captchas', async () => {
    const bad = await admin.put('/api/admin/waf', { ...base, captcha: 'turnstile', siteKey: '' });
    expect(bad.status).toBe(422);
    await admin.put('/api/admin/waf', { ...base, enabled: false });
  });
});
