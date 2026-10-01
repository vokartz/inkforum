import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, type Harness } from '../testing/harness.js';
import { UpdatesService } from '../updates/updates.service.js';

const CODE = 'ABCD-2345';

const validInstall = {
  code: CODE,
  site: { name: 'Mürekkep Topluluğu', description: 'Deneme', theme: 'community', accent: '#10b981', mode: 'light' },
  admin: { username: 'Kurucu', email: 'kurucu@forum.test', password: 'GucluSifre123' },
  community: { registration: 'open', sampleContent: false, plugins: ['wiki', 'tickets'] },
  mail: null,
  mailFrom: null,
};

describe('install wizard', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness({ ADMIN_PASSWORD: '', INSTALL_CODE: CODE });
  });
  afterAll(async () => {
    await h.close();
  });

  it('locks the API until installed and requires the setup code', async () => {
    const a = h.agent();
    expect((await a.get('/api/install/status')).body).toMatchObject({ installed: false });
    const blocked = await a.get('/api/forum');
    expect(blocked.status).toBe(503);
    expect(blocked.body.error.code).toBe('INSTALL_REQUIRED');
    expect((await a.post('/api/auth/register', {})).status).toBe(503);
    // Sihirbazın ihtiyaç duyduğu uç noktalar açık
    expect((await a.get('/api/auth/me')).status).toBe(200);
    expect((await a.get('/api/health')).status).toBe(200);

    const wrong = await a.post('/api/install/verify', { code: 'WXYZ-9999' });
    expect(wrong.status).toBe(422);
    expect((await a.post('/api/install', { ...validInstall, code: 'WXYZ-9999' })).status).toBe(422);

    const ok = await a.post('/api/install/verify', { code: 'abcd 2345' });
    expect(ok.status).toBe(200);
    expect(ok.body.checks.some((c: { key: string }) => c.key === 'db')).toBe(true);
  });

  it('validates the admin account', async () => {
    const weak = await h.agent().post('/api/install', { ...validInstall, admin: { ...validInstall.admin, password: 'kisasifre12' } });
    expect(weak.status).toBe(422);
    expect(Object.keys(weak.body.error.fields)).toContain('admin.password');
  });

  it('creates the admin, applies choices, logs in and closes the wizard', async () => {
    const a = h.agent();
    const res = await a.post('/api/install', validInstall);
    expect(res.status).toBe(201);
    expect(a.hasSession()).toBe(true);

    const me = await a.get('/api/auth/me');
    expect(me.body.user.username).toBe('Kurucu');
    expect(me.body.isAdmin).toBe(true);
    expect(me.body.settings['general.forumName']).toBe('Mürekkep Topluluğu');
    expect(me.body.settings['appearance.themeStyle']).toBe('community');
    expect(h.settings.get('registration.mode')).toBe('open');
    expect(h.settings.get('plugins.enabled')).toMatchObject({ wiki: true, tickets: true, applications: false, landing: false });

    expect((await h.agent().get('/api/forum')).status).toBe(200);
    expect((await h.agent().get('/api/install/status')).body.installed).toBe(true);
    expect((await h.agent().post('/api/install', validInstall)).status).toBe(409);
    expect((await h.agent().post('/api/install/verify', { code: CODE })).status).toBe(409);
  });
});

describe('updates and backups', () => {
  let h: Harness;
  let github: Server;
  let requests = 0;
  const dir = mkdtempSync(join(tmpdir(), 'inkforum-backup-'));

  beforeAll(async () => {
    github = createServer((req, res) => {
      requests++;
      if (req.url?.startsWith('/repos/vokartz/inkforum/releases')) {
        res.writeHead(200, { 'content-type': 'application/json', etag: '"v1"' });
        res.end(
          JSON.stringify([
            { tag_name: 'v99.1.0', name: 'Büyük güncelleme', body: '## Yeni\n\n- **Wiki** geliştirildi\n- <script>x</script>', draft: false, prerelease: false, published_at: '2026-10-01T10:00:00Z', html_url: 'https://github.com/vokartz/inkforum/releases/tag/v99.1.0', assets: [] },
            { tag_name: 'v99.2.0-beta.1', name: 'Beta', body: 'deneme', draft: false, prerelease: true, published_at: '2026-10-02T10:00:00Z', html_url: 'https://github.com/vokartz/inkforum/releases/tag/v99.2.0-beta.1', assets: [] },
            { tag_name: 'v99.3.0', name: 'Taslak', body: '', draft: true, prerelease: false, published_at: null, html_url: 'https://github.com/x', assets: [] },
            { tag_name: 'nightly', name: 'geçersiz', body: '', draft: false, prerelease: false, published_at: null, html_url: 'https://github.com/x', assets: [] },
          ]),
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((r) => github.listen(0, '127.0.0.1', r));
    const port = (github.address() as AddressInfo).port;
    h = await createHarness({ UPDATE_API_URL: `http://127.0.0.1:${port}`, UPDATES_DISABLED: 'false', DB_SQLITE_PATH: join(dir, 'forum.db'), STORAGE_DIR: dir });
  });
  afterAll(async () => {
    await h.close();
    github.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads releases from GitHub, picks the channel-appropriate latest and renders safe notes', async () => {
    const admin = await adminAgent(h);
    const res = await admin.get('/api/admin/updates?refresh=1');
    expect(res.status).toBe(200);
    expect(requests).toBeGreaterThan(0);
    expect(res.body.available).toBe(true);
    expect(res.body.latest.version).toBe('99.1.0');
    expect(res.body.kind).toBe('major');
    expect(res.body.latest.notesHtml).toContain('<strong>Wiki</strong>');
    expect(res.body.latest.notesHtml).not.toContain('<script');
    expect(res.body.releases.map((r: { version: string }) => r.version)).toEqual(['99.1.0']);
    // Kaynak koddan çalışırken kurulum yapılmaz
    expect(res.body.canInstall).toBe(false);
    expect((await admin.post('/api/admin/updates/install', { version: '99.1.0' })).status).toBe(400);

    // Beta kanalında ön sürüm de görünür
    expect((await admin.put('/api/admin/updates/settings', { autoCheck: true, channel: 'beta', autoInstall: 'off', installHour: 4, notifyAdmins: true })).status).toBe(200);
    const beta = await admin.get('/api/admin/updates');
    expect(beta.body.latest.version).toBe('99.2.0-beta.1');

    expect((await admin.get('/api/admin/access')).body.version.available).toBe('99.2.0-beta.1');
  });

  it('notifies admins once per new version', async () => {
    const admin = await adminAgent(h);
    const updates = h.app.get(UpdatesService);
    await updates.tick();
    await updates.tick();
    const list = await admin.get('/api/me/notifications');
    const updateNotes = (list.body.items as Array<{ type: string }>).filter((n) => n.type === 'system.update');
    expect(updateNotes).toHaveLength(1);
  });

  // Yedekleme SQLite dosyası (VACUUM INTO) ya da pg_dump ister; PGlite (bellek içi) test sürücüsünde yok
  it.skipIf(process.env.TEST_DB_DRIVER === 'pglite')('creates, lists, downloads and deletes database backups', async () => {
    const admin = await adminAgent(h);
    const created = await admin.post('/api/admin/backups', {});
    expect(created.status).toBe(201);
    expect(created.body.name).toMatch(/^inkforum-\d{8}-\d{6}-manual\.db$/);
    const list = await admin.get('/api/admin/backups');
    expect(list.body.supported).toBe(true);
    expect(list.body.items[0].name).toBe(created.body.name);
    const dl = await admin.get(`/api/admin/backups/${created.body.name}/download`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toContain(created.body.name);
    // Yol geçişi denemesi
    expect((await admin.get('/api/admin/backups/..%2F..%2Fforum.db/download')).status).toBe(404);
    expect((await admin.delete(`/api/admin/backups/${created.body.name}`)).status).toBe(200);
    expect((await admin.get('/api/admin/backups')).body.items).toHaveLength(0);
  });

  it('keeps update and backup endpoints admin-only', async () => {
    const guest = h.agent();
    expect((await guest.get('/api/admin/updates')).status).toBe(401);
    expect((await guest.get('/api/admin/backups')).status).toBe(401);
    expect((await guest.get('/api/admin/updates/summary')).status).toBe(401);
  });
});
