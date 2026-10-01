import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from './dialect.js';
import { migrateDown, migrateToLatest, pendingMigrations } from './migrator.js';
import { migrations } from './migrations/index.js';

let database: Database | undefined;

async function freshDb(driver: 'sqlite' | 'pglite') {
  database = await createDatabase({ driver, sqlitePath: ':memory:' });
  return database;
}

afterEach(async () => {
  await database?.destroy();
  database = undefined;
});

describe.each(['sqlite', 'pglite'] as const)('migrations (%s)', (driver) => {
  it('applies all migrations and can roll them back', async () => {
    const { db } = await freshDb(driver);
    const up = await migrateToLatest(db);
    expect(up.error).toBeUndefined();
    expect(up.applied).toEqual(Object.keys(migrations));
    expect(await pendingMigrations(db)).toEqual([]);

    for (let i = 0; i < Object.keys(migrations).length; i++) {
      const down = await migrateDown(db);
      expect(down.error).toBeUndefined();
    }
    expect(await pendingMigrations(db)).toEqual(Object.keys(migrations));
    // PGlite (WebAssembly) 20+ migration'ı ileri-geri uygularken yavaş makinelerde 5 sn'yi aşabilir
  }, 60_000);

  it('converts booleans to integers and enforces foreign keys', async () => {
    const { db } = await freshDb(driver);
    await migrateToLatest(db);
    const now = Date.now();
    const group = await db
      .insertInto('member_groups')
      .values({ name: 'Test', kind: 'regular', is_protected: true, created_at: now, updated_at: now })
      .returning(['id', 'is_protected'])
      .executeTakeFirstOrThrow();
    expect(group.is_protected).toBe(1);

    const found = await db
      .selectFrom('member_groups')
      .select('id')
      .where('is_protected', '=', true as unknown as number)
      .execute();
    expect(found).toHaveLength(1);

    await expect(
      db.insertInto('group_permissions').values({ group_id: 9999, permission: 'x', value: 1 }).execute(),
    ).rejects.toThrow();
  });

  it('enforces the pending join request partial unique index', async () => {
    const { db } = await freshDb(driver);
    await migrateToLatest(db);
    const now = Date.now();
    const g = await db
      .insertInto('member_groups')
      .values({ name: 'G', kind: 'regular', created_at: now, updated_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    const u = await db
      .insertInto('users')
      .values({
        username: 'a',
        username_canonical: 'a',
        display_name: 'a',
        display_name_canonical: 'a',
        email: 'a@x.test',
        email_canonical: 'a@x.test',
        password_hash: 'x',
        status: 'active',
        registered_at: now,
        created_at: now,
        updated_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const req = { group_id: g.id, user_id: u.id, created_at: now };
    await db.insertInto('group_join_requests').values(req).execute();
    await expect(db.insertInto('group_join_requests').values(req).execute()).rejects.toThrow();
    await db.updateTable('group_join_requests').set({ status: 'rejected' }).execute();
    await db.insertInto('group_join_requests').values(req).execute();
  });
});
