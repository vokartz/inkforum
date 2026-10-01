import { describe, expect, it } from 'vitest';
import { runHandler } from './sandbox.js';

const req = { method: 'GET', path: '/', query: { a: '1' }, user: { id: 5, name: 'Ali' } };

describe('page sandbox', () => {
  it('runs handle(req) and returns its value', async () => {
    const r = await runHandler(`async function handle(req) { return json({ hi: req.user.name, q: req.query.a, s: secrets.KEY }); }`, { req, secrets: { KEY: 'x' } }, {});
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ type: 'json', status: 200, headers: {}, body: { hi: 'Ali', q: '1', s: 'x' } });
  });

  it('has no access to node', async () => {
    const r = await runHandler(`function handle() { return { r: typeof require, p: typeof process, g: typeof globalThis.process, i: typeof import.meta }; }`, { req }, {});
    expect(r.ok).toBe(false); // import.meta bir betikte sözdizimi hatası
    const r2 = await runHandler(`function handle() { return { r: typeof require, p: typeof process, f: typeof setTimeout }; }`, { req }, {});
    expect(r2.value).toEqual({ r: 'undefined', p: 'undefined', f: 'undefined' });
  });

  it('awaits async bridges and captures logs', async () => {
    const r = await runHandler(
      `async function handle() { console.log('başla', { n: 1 }); const res = await fetch('https://api.example.com/x'); const data = await res.json(); await kv.set('k', data); return redirect('/to?' + (await kv.get('k')).id); }`,
      { req },
      {
        fetch: async () => JSON.stringify({ status: 200, headers: {}, body: JSON.stringify({ id: 7 }) }),
        kvSet: async () => undefined,
        kvGet: async () => JSON.stringify({ id: 7 }),
      },
    );
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ type: 'redirect', status: 302, url: '/to?7' });
    expect(r.logs).toEqual(['başla {"n":1}']);
  });

  it('stops infinite loops and reports errors with line numbers', async () => {
    const loop = await runHandler(`function handle() { while (true) {} }`, { req }, {}, { cpuMs: 100, totalMs: 1000, memoryBytes: 16 << 20 });
    expect(loop.ok).toBe(false);
    expect(loop.error).toMatch(/İşlemci/);
    const err = await runHandler(`function handle() {\n  null.x;\n}`, { req }, {});
    expect(err.error).toMatch(/TypeError.*satır 2/);
    const none = await runHandler(`const x = 1;`, { req }, {});
    expect(none.error).toMatch(/handle\(req\)/);
  });

  it('rejects when a bridge throws', async () => {
    const r = await runHandler(`async function handle() { await fetch('http://10.0.0.1'); }`, { req }, { fetch: async () => { throw new Error('Bu adrese izin yok.'); } });
    expect(r.error).toMatch(/izin yok/);
  });
});
