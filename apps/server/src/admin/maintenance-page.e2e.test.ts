import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, registerActive, type Agent, type Harness } from '../testing/harness.js';

let h: Harness;
let admin: Agent;
let ali: Agent;

beforeAll(async () => {
  h = await createHarness();
  admin = await adminAgent(h);
  ali = await registerActive(h, 'Ali');
});

afterAll(async () => {
  await h.close();
});

describe('maintenance page', () => {
  it('saves the design, closes the site and shows the page settings to visitors', async () => {
    const res = await admin.put('/api/admin/maintenance/page', {
      enabled: true,
      message: 'Yeni sürüm geliyor.',
      title: 'Birazdan döneceğiz',
      layout: 'split',
      background: { kind: 'gradient', from: '#111111', to: '#222222' },
      endsAt: Date.now() + 3_600_000,
      progress: 40,
      buttons: [{ label: 'Discord', url: 'https://discord.gg/abc' }],
      html: '<p>Discord</p>',
    });
    expect(res.status).toBe(200);
    expect(h.settings.get('general.maintenanceMode')).toBe(true);
    const page = h.settings.get('general.maintenancePage');
    expect(page).toMatchObject({ title: 'Birazdan döneceğiz', layout: 'split', progress: 40, icon: 'wrench' });
    expect(page.background).toMatchObject({ kind: 'gradient', from: '#111111', angle: 135 });
    expect((await ali.get('/api/forum')).status).toBe(503);
    const viewer = await h.agent().get('/api/auth/me');
    expect(viewer.body.settings['general.maintenancePage'].title).toBe('Birazdan döneceğiz');
  });

  it('rejects unsafe button links', async () => {
    const res = await admin.put('/api/admin/maintenance/page', { enabled: false, message: '', buttons: [{ label: 'x', url: 'javascript:alert(1)' }] });
    expect(res.status).toBe(422);
  });
});
