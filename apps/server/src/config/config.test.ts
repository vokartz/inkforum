import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applySiteUrl, loadConfig } from './config.js';

const storage = mkdtempSync(join(tmpdir(), 'inkforum-config-'));
const prod = (env: Record<string, string>) => loadConfig({}, { NODE_ENV: 'production', STORAGE_DIR: storage, ...env });

describe('config', () => {
  afterAll(() => rmSync(storage, { recursive: true, force: true }));

  it('treats blank .env values as unset and generates the secret keys', () => {
    const c = prod({ APP_URL: '', APP_SECRET: '', UPDATER_TOKEN: '', DEFAULT_LOCALE: '', INKFORUM_DEPLOY: 'docker' });
    expect(c.appUrlMode).toBe('auto');
    expect(c.appUrlPending).toBe(true);
    expect(c.secret.length).toBeGreaterThanOrEqual(32);
    expect(c.updates.updaterToken).toBe(readFileSync(join(storage, '.updater-token'), 'utf8'));
    // İkinci açılışta aynı anahtarlar
    const again = prod({ INKFORUM_DEPLOY: 'docker' });
    expect(again.secret).toBe(c.secret);
    expect(again.updates.updaterToken).toBe(c.updates.updaterToken);
  });

  it('uses the address given by Coolify when APP_URL is not set', () => {
    const c = prod({ COOLIFY_URL: 'https://forum.example.com,https://www.forum.example.com' });
    expect(c.appUrlMode).toBe('env');
    expect(c.appUrl).toBe('https://forum.example.com');
    expect(c.sessionCookieName).toBe('__Host-forum_sid');
    expect(prod({ COOLIFY_FQDN: 'forum.example.com' }).appUrl).toBe('https://forum.example.com');
    expect(prod({ APP_URL: 'https://own.example', COOLIFY_URL: 'https://forum.example.com' }).appUrl).toBe('https://own.example');
  });

  it('applies a detected site address', () => {
    const c = prod({});
    applySiteUrl(c, 'https://forum.example.com/');
    expect(c.appUrl).toBe('https://forum.example.com');
    expect(c.appOrigin).toBe('https://forum.example.com');
    expect(c.secureCookies).toBe(true);
    expect(c.appUrlPending).toBe(false);
  });
});
