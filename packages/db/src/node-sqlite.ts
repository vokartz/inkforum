import type { SqliteDatabase, SqliteStatement } from 'kysely';

/**
 * Node'un yerleşik `node:sqlite` modülünü Kysely'nin SqliteDialect arayüzüne uyarlar.
 * Native derleme gerektirmediği için ucuz hostinglerde varsayılan sürücüdür.
 */

interface NodeStatementSync {
  columns(): unknown[];
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  iterate(...params: unknown[]): IterableIterator<unknown>;
}

interface NodeDatabaseSync {
  prepare(sql: string): NodeStatementSync;
  exec(sql: string): void;
  close(): void;
}

const STATEMENT_CACHE_LIMIT = 200;

export class NodeSqliteDatabase implements SqliteDatabase {
  readonly #db: NodeDatabaseSync;
  readonly #cache = new Map<string, NodeStatementSync>();

  constructor(db: NodeDatabaseSync) {
    this.#db = db;
  }

  exec(sql: string): void {
    this.#db.exec(sql);
  }

  prepare(sql: string): SqliteStatement {
    let stmt = this.#cache.get(sql);
    if (!stmt) {
      stmt = this.#db.prepare(sql);
      if (this.#cache.size >= STATEMENT_CACHE_LIMIT) {
        const oldest = this.#cache.keys().next().value;
        if (oldest !== undefined) this.#cache.delete(oldest);
      }
      this.#cache.set(sql, stmt);
    }
    const s = stmt;
    const reader = s.columns().length > 0;
    return {
      reader,
      all: (parameters) => s.all(...parameters),
      run: (parameters) => s.run(...parameters),
      iterate: (parameters) => s.iterate(...parameters),
    };
  }

  close(): void {
    this.#cache.clear();
    this.#db.close();
  }
}

type NodeSqliteModule = {
  DatabaseSync: new (path: string, options?: Record<string, unknown>) => NodeDatabaseSync;
};

/** `process.getBuiltinModule` paketleyici/test çalıştırıcılarının modül çözümlemesini atlar. */
function loadNodeSqlite(): NodeSqliteModule | null {
  try {
    const getBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
    return (getBuiltin?.('node:sqlite') as NodeSqliteModule | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function openNodeSqlite(path: string): Promise<NodeSqliteDatabase> {
  const mod = loadNodeSqlite();
  if (!mod) throw new Error('node:sqlite bu Node sürümünde kullanılamıyor (Node 22.13+ gerekli).');
  return new NodeSqliteDatabase(new mod.DatabaseSync(path));
}

export async function isNodeSqliteAvailable(): Promise<boolean> {
  return loadNodeSqlite() !== null;
}
