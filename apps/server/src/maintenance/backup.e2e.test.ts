import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAgent, createHarness, type Agent, type Harness } from '../testing/harness.js';
import { applyPendingRestore } from './restore.js';

const sqliteOnly = process.env.TEST_DB_DRIVER === 'pglite';

type Sqlite = { prepare(s: string): { get(): Record<string, unknown> }; close(): void };
const openRo = (p: string): Sqlite => {
  const mod = (process as unknown as { getBuiltinModule(n: string): { DatabaseSync: new (p: string, o?: object) => Sqlite } }).getBuiltinModule('node:sqlite');
  return new mod.DatabaseSync(p, { readOnly: true });
};

describe.skipIf(sqliteOnly)('backups and restore', () => {
  let h: Harness;
  let admin: Agent;
  const dir = mkdtempSync(join(tmpdir(), 'inkforum-restore-'));
  const names: Record<string, string> = {};

  beforeAll(async () => {
    h = await createHarness({ DB_SQLITE_PATH: join(dir, 'forum.db'), STORAGE_DIR: dir });
    admin = await adminAgent(h);
    mkdirSync(join(dir, 'uploads', 'avatars'), { recursive: true });
    writeFileSync(join(dir, 'uploads', 'avatars', 'test.png'), 'resim');
  });
  afterAll(async () => {
    await h.close().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates database, SQL and full backups', async () => {
    for (const kind of ['db', 'sql', 'full'] as const) {
      const res = await admin.post('/api/admin/backups', { kind });
      expect(res.status).toBe(201);
      expect(res.body.kind).toBe(kind);
      names[kind] = res.body.name;
    }
    expect(names.sql).toMatch(/\.sql\.gz$/);
    expect(names.full).toMatch(/\.tar\.gz$/);
    const list = await admin.get('/api/admin/backups');
    expect(list.body.items.map((b: { name: string }) => b.name)).toEqual(expect.arrayContaining(Object.values(names)));
  });

  it('accepts uploaded InkForum backups and rejects other files', async () => {
    const good = await admin.upload('/api/admin/backups/upload', 'file', readFileSync(join(dir, 'backups', names.db!)), 'yedek.db');
    expect(good.status).toBe(201);
    expect(good.body.label).toBe('uploaded');
    const bad = await admin.upload('/api/admin/backups/upload', 'file', Buffer.from('merhaba dünya'), 'x.db');
    expect(bad.status).toBe(422);
    const guest = await h.agent().upload('/api/admin/backups/upload', 'file', Buffer.from('x'), 'x.db');
    expect(guest.status).toBe(401);
  });

  it('schedules a restore only after confirmation and takes a safety backup first', async () => {
    const noConfirm = await admin.post(`/api/admin/backups/${names.full}/restore`, {});
    expect(noConfirm.status).toBe(422);
    const res = await admin.post(`/api/admin/backups/${names.full}/restore`, { confirm: 'GERİ YÜKLE' });
    expect(res.status).toBe(202);
    expect(res.body.safety).toMatch(/pre-restore\.db$/);
    expect(existsSync(join(dir, 'restore', 'pending.json'))).toBe(true);
    expect((await admin.get('/api/admin/backups')).body.restorePending).toBe(true);
  });

  it('applies SQL and full backups on the next start', async () => {
    await h.close();
    // Tam yedek (planlanan): veritabanı + yüklenen dosyalar yeni konuma
    const target = join(dir, 'restored');
    mkdirSync(target, { recursive: true });
    const config = { ...h.config, db: { ...h.config.db, sqlitePath: join(target, 'forum.db') }, uploadsDir: join(target, 'uploads') };
    const full = await applyPendingRestore(config, () => undefined);
    expect(full?.ok).toBe(true);
    let db = openRo(join(target, 'forum.db'));
    expect(Number(db.prepare('select count(*) as n from users').get().n)).toBeGreaterThan(0);
    db.close();
    expect(readFileSync(join(target, 'uploads', 'avatars', 'test.png'), 'utf8')).toBe('resim');
    expect(JSON.parse(readFileSync(join(dir, 'restore', 'last.json'), 'utf8')).ok).toBe(true);

    // SQL dökümü: yeni bir SQLite dosyasına deyim deyim uygulanır
    const target2 = join(dir, 'restored2');
    mkdirSync(target2, { recursive: true });
    writeFileSync(join(dir, 'restore', 'pending.json'), JSON.stringify({ file: join(dir, 'backups', names.sql!), name: names.sql, kind: 'sql', requestedAt: Date.now() }));
    const sqlRes = await applyPendingRestore({ ...config, db: { ...config.db, sqlitePath: join(target2, 'forum.db') } }, () => undefined);
    expect(sqlRes?.ok, sqlRes?.message).toBe(true);
    db = openRo(join(target2, 'forum.db'));
    expect(Number(db.prepare("select count(*) as n from settings where key is not null").get().n)).toBeGreaterThanOrEqual(0);
    expect(Number(db.prepare('select count(*) as n from kysely_migration').get().n)).toBeGreaterThan(10);
    db.close();
  });
});
