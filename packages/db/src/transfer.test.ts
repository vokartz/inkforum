import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from './dialect.js';
import { migrateToLatest } from './migrator.js';
import { transferDatabase } from './transfer.js';

const open: Database[] = [];
afterEach(async () => {
  for (const d of open.splice(0)) await d.destroy();
});

async function db(driver: 'sqlite' | 'pglite') {
  const d = await createDatabase({ driver, sqlitePath: ':memory:' });
  open.push(d);
  return d;
}

async function seed(d: Database) {
  await migrateToLatest(d.db);
  const now = Date.now();
  const user = await d.db
    .insertInto('users')
    .values({ username: 'Ayşe', username_canonical: 'ayse', display_name: 'Ayşe', display_name_canonical: 'ayse', email: 'ayse@example.com', email_canonical: 'ayse@example.com', password_hash: 'x', status: 'active', registered_at: now, created_at: now, updated_at: now } as never)
    .returning('id')
    .executeTakeFirstOrThrow();
  const cat = await d.db.insertInto('forum_categories').values({ name: 'Genel', sort_order: 0, created_at: now, updated_at: now } as never).returning('id').executeTakeFirstOrThrow();
  // Kendine başvuru: alt bölüm üst bölümden önce eklenmiş (daha küçük id)
  const child = await d.db.insertInto('boards').values({ category_id: cat.id, name: 'Alt', slug: 'alt', sort_order: 1, created_at: now, updated_at: now } as never).returning('id').executeTakeFirstOrThrow();
  const parent = await d.db.insertInto('boards').values({ category_id: cat.id, name: 'Üst', slug: 'ust', sort_order: 0, created_at: now, updated_at: now } as never).returning('id').executeTakeFirstOrThrow();
  await d.db.updateTable('boards').set({ parent_id: parent.id }).where('id', '=', child.id).execute();
  return { userId: user.id };
}

describe('transferDatabase', () => {
  it('copies every table from SQLite to PostgreSQL (PGlite) and keeps ids and sequences', async () => {
    const src = await db('sqlite');
    const { userId } = await seed(src);
    const dst = await db('pglite');
    const r = await transferDatabase({ db: src.db, driver: 'sqlite' }, { db: dst.db, driver: 'pglite' });
    expect(r.totalRows).toBeGreaterThan(0);
    const users = await dst.db.selectFrom('users').select(['id', 'username']).execute();
    expect(users).toEqual([{ id: userId, username: 'Ayşe' }]);
    const boards = await dst.db.selectFrom('boards').select(['name', 'parent_id']).orderBy('id').execute();
    expect(boards.map((b) => b.name)).toEqual(['Alt', 'Üst']);
    // Yeni kayıtlar kopyalanan en büyük id'den sonra gelir
    const now = Date.now();
    const next = await dst.db.insertInto('forum_categories').values({ name: 'Yeni', sort_order: 1, created_at: now, updated_at: now } as never).returning('id').executeTakeFirstOrThrow();
    expect(next.id).toBe(2);
  }, 60_000);

  it('refuses to overwrite a database that already has members', async () => {
    const src = await db('sqlite');
    await seed(src);
    const dst = await db('pglite');
    await seed(dst);
    await expect(transferDatabase({ db: src.db, driver: 'sqlite' }, { db: dst.db, driver: 'pglite' })).rejects.toThrow(/zaten üye var/);
  }, 60_000);
});
