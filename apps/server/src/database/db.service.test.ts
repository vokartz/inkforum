import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, migrateToLatest, type Database } from '@forum/db';
import { Db } from './db.service.js';

let database: Database | undefined;

afterEach(async () => {
  await database?.destroy();
  database = undefined;
});

async function setup() {
  database = await createDatabase({ driver: 'sqlite', sqlitePath: ':memory:' });
  await migrateToLatest(database.db);
  return new Db(database);
}

const withTimeout = <T>(p: Promise<T>, ms = 3000) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('kilitlenme (timeout)')), ms))]);

describe('Db transactions', () => {
  it('reuses the active transaction in nested service calls (no deadlock)', async () => {
    const db = await setup();
    const now = Date.now();
    const inner = async () => {
      await db.q.insertInto('system_state').values({ key: 'inner', value: '1', updated_at: now }).execute();
      return db.q.selectFrom('system_state').selectAll().execute();
    };
    const rows = await withTimeout(
      db.tx(async () => {
        await db.q.insertInto('system_state').values({ key: 'outer', value: '1', updated_at: now }).execute();
        return db.tx(inner);
      }),
    );
    expect(rows.map((r) => r.key).sort()).toEqual(['inner', 'outer']);
  });

  it('rolls back everything and skips afterCommit hooks on error', async () => {
    const db = await setup();
    let hookRan = false;
    await expect(
      db.tx(async () => {
        await db.q.insertInto('system_state').values({ key: 'x', value: '1', updated_at: 1 }).execute();
        db.afterCommit(() => {
          hookRan = true;
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(hookRan).toBe(false);
    expect(await db.q.selectFrom('system_state').selectAll().execute()).toEqual([]);
  });

  it('runs afterCommit hooks after a successful commit', async () => {
    const db = await setup();
    const order: string[] = [];
    await db.tx(async () => {
      db.afterCommit(() => {
        order.push('hook');
      });
      order.push('body');
    });
    expect(order).toEqual(['body', 'hook']);
  });
});
