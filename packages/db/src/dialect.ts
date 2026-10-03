import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Kysely, PGliteDialect, PostgresDialect, SqliteDialect, SqliteAdapter, type SqliteDatabase } from 'kysely';
import type { DB } from './schema.js';
import { BooleanToIntPlugin } from './plugins.js';
import { isNodeSqliteAvailable, openNodeSqlite, type NodeSqliteDatabase } from './node-sqlite.js';

export type DbDriver = 'sqlite' | 'postgres' | 'pglite';

export interface DatabaseConfig {
  driver: DbDriver;
  sqlitePath?: string;
  sqliteDriver?: 'auto' | 'node' | 'better';
  sqliteJournalMode?: 'WAL' | 'DELETE';
  postgresUrl?: string;
  postgresPoolSize?: number;
  log?: (sql: string, durationMs: number) => void;
}

export interface Database {
  db: Kysely<DB>;
  driver: DbDriver;
  destroy(): Promise<void>;
}

const PRAGMAS = (journal: string) => [
  'PRAGMA busy_timeout = 5000',
  `PRAGMA journal_mode = ${journal}`,
  'PRAGMA synchronous = NORMAL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA cache_size = -8000',
  'PRAGMA temp_store = MEMORY',
];

async function openSqlite(config: DatabaseConfig): Promise<SqliteDatabase> {
  const path = config.sqlitePath ?? 'storage/forum.db';
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const journal = path === ':memory:' ? 'MEMORY' : (config.sqliteJournalMode ?? 'WAL');
  const pref = config.sqliteDriver ?? 'auto';

  if (pref === 'node' || (pref === 'auto' && (await isNodeSqliteAvailable()))) {
    const db: NodeSqliteDatabase = await openNodeSqlite(path);
    for (const p of PRAGMAS(journal)) db.exec(p);
    return db;
  }

  const modName = 'better-sqlite3';
  const mod = (await import(modName)) as {
    default: new (path: string) => SqliteDatabase & { pragma(sql: string): unknown };
  };
  const db = new mod.default(path);
  for (const p of PRAGMAS(journal)) db.pragma(p.replace(/^PRAGMA /, ''));
  return db;
}

async function createPostgresPool(config: DatabaseConfig) {
  const pg = await import('pg');
  const types = pg.default.types;
  types.setTypeParser(20, (v: string) => Number(v));
  types.setTypeParser(1700, (v: string) => Number(v));
  return new pg.default.Pool({
    connectionString: config.postgresUrl,
    max: config.postgresPoolSize ?? 5,
  });
}

export async function createDatabase(config: DatabaseConfig): Promise<Database> {
  const log = config.log
    ? (event: { level: string; query: { sql: string }; queryDurationMillis: number }) =>
        config.log!(event.query.sql, event.queryDurationMillis)
    : undefined;

  if (config.driver === 'pglite') {
    const modName = '@electric-sql/pglite';
    const { PGlite } = (await import(modName)) as {
      PGlite: new (opts?: object) => ConstructorParameters<typeof PGliteDialect>[0]['pglite'];
    };
    const toNumber = (v: string) => Number(v);
    const pglite = new PGlite({ parsers: { 20: toNumber, 1700: toNumber } });
    const db = new Kysely<DB>({
      dialect: new PGliteDialect({ pglite }),
      plugins: [new BooleanToIntPlugin()],
      log,
    });
    return { db, driver: 'pglite', destroy: () => db.destroy() };
  }

  if (config.driver === 'postgres') {
    if (!config.postgresUrl) throw new Error('DATABASE_URL (PostgreSQL) ayarlanmamış.');
    const pool = await createPostgresPool(config);
    const db = new Kysely<DB>({
      dialect: new PostgresDialect({ pool }),
      plugins: [new BooleanToIntPlugin()],
      log,
    });
    return { db, driver: 'postgres', destroy: () => db.destroy() };
  }

  const database = await openSqlite(config);
  const db = new Kysely<DB>({
    dialect: new SqliteDialect({ database }),
    plugins: [new BooleanToIntPlugin()],
    log,
  });
  return { db, driver: 'sqlite', destroy: () => db.destroy() };
}

export function isSqlite(db: Kysely<unknown>): boolean {
  return db.getExecutor().adapter instanceof SqliteAdapter;
}
