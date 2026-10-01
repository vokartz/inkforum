import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, type Agent, type Harness } from '../testing/harness.js';

/** Docker'da güncelleyici kapsayıcısı yokken anlaşılır hata ve Coolify Deploy Webhook ile güncelleme */
describe('updates on Coolify', () => {
  let h: Harness;
  let admin: Agent;
  let server: Server;
  let base: string;
  const deploys: Array<{ url: string; auth: string | undefined }> = [];
  const dir = mkdtempSync(join(tmpdir(), 'inkforum-coolify-'));

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url?.startsWith('/repos/vokartz/inkforum/releases')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify([{ tag_name: 'v99.1.0', name: 'Yeni', body: 'not', draft: false, prerelease: false, published_at: '2026-10-01T10:00:00Z', html_url: 'https://github.com/vokartz/inkforum/releases/tag/v99.1.0', assets: [] }]));
        return;
      }
      if (req.url?.startsWith('/api/v1/deploy')) {
        deploys.push({ url: req.url, auth: req.headers.authorization });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ deployments: [{ message: 'Deployment request queued.' }] }));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    // Açılıp hemen kapatılan port: güncelleyici kapsayıcısı yok (bağlantı reddedilir)
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
    const closedPort = (closed.address() as { port: number }).port;
    await new Promise<void>((r) => closed.close(() => r()));
    h = await createHarness({
      UPDATE_API_URL: base,
      UPDATES_DISABLED: 'false',
      INKFORUM_DEPLOY: 'docker',
      COOLIFY_FQDN: 'forum.example.com',
      UPDATER_URL: `http://127.0.0.1:${closedPort}`,
      UPDATER_TOKEN: 'test-updater-token-123456',
      DB_SQLITE_PATH: join(dir, 'forum.db'),
      STORAGE_DIR: dir,
    });
    admin = await adminAgent(h);
  });

  afterAll(async () => {
    await h.close();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('explains why the updater cannot be reached', async () => {
    const res = await admin.get('/api/admin/updates?refresh=1');
    expect(res.status).toBe(200);
    expect(res.body.latest.version).toBe('99.1.0');
    expect(res.body.coolify).toMatchObject({ detected: true, configured: false });
    expect(res.body.updater.reachable).toBe(false);
    expect(res.body.updater.error).toContain('Güncelleyici kapsayıcısı çalışmıyor');
    const install = await admin.post('/api/admin/updates/install', { version: '99.1.0' });
    expect(install.status).toBe(400);
    expect(JSON.stringify(install.body)).not.toContain('fetch failed');
    expect(JSON.stringify(install.body)).toContain('Coolify');
  });

  it('validates the Coolify connection', async () => {
    expect((await admin.put('/api/admin/updates/coolify', { webhookUrl: 'https://example.com/hook', token: 'x' })).status).toBe(422);
    expect((await admin.put('/api/admin/updates/coolify', { webhookUrl: `${base}/api/v1/deploy?uuid=abc&force=false`, token: '' })).status).toBe(422);
    expect((await admin.put('/api/admin/updates/coolify', { webhookUrl: `${base}/api/v1/deploy?uuid=abc&force=false`, token: 'coolify-secret' })).status).toBe(200);
    const res = await admin.get('/api/admin/updates');
    expect(res.body.coolify).toMatchObject({ configured: true, hasToken: true });
    expect(JSON.stringify(res.body)).not.toContain('coolify-secret');
  });

  it('installs by triggering a Coolify redeploy', async () => {
    const res = await admin.post('/api/admin/updates/install', { version: '99.1.0' });
    expect(res.status).toBe(202);
    expect(res.body.state).toBe('restart');
    expect(deploys).toEqual([{ url: '/api/v1/deploy?uuid=abc&force=false', auth: 'Bearer coolify-secret' }]);
    // Yeniden dağıtım sürerken ikinci kurulum reddedilir
    expect((await admin.post('/api/admin/updates/install', { version: '99.1.0' })).status).toBe(409);
  });
});
