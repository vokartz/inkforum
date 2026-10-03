import { sql, type Kysely } from 'kysely';
import type { DbDriver } from './dialect.js';
import { migrateToLatest, pendingMigrations } from './migrator.js';

export interface TransferSide {
  db: Kysely<any>;
  driver: DbDriver;
}

export interface TransferResult {
  tables: Array<{ table: string; rows: number }>;
  totalRows: number;
}

const SKIP = new Set(['kysely_migration', 'kysely_migration_lock', 'sqlite_sequence']);
const BATCH = 200;

interface ForeignKey {
  table: string;
  column: string;
  ref: string;
}

async function tableNames(side: TransferSide): Promise<string[]> {
  const tables = await side.db.introspection.getTables();
  return tables.filter((t) => !t.isView && !SKIP.has(t.name) && !t.name.startsWith('sqlite_')).map((t) => t.name);
}

async function columnsOf(side: TransferSide, table: string): Promise<string[]> {
  const tables = await side.db.introspection.getTables();
  return tables.find((t) => t.name === table)?.columns.map((c) => c.name) ?? [];
}

async function foreignKeys(side: TransferSide, tables: string[]): Promise<ForeignKey[]> {
  if (side.driver === 'sqlite') {
    const out: ForeignKey[] = [];
    for (const t of tables) {
      const rows = await sql<{ table: string; from: string }>`select * from pragma_foreign_key_list(${t})`.execute(side.db);
      for (const r of rows.rows) out.push({ table: t, column: r.from, ref: r.table });
    }
    return out;
  }
  const rows = await sql<{ table_name: string; column_name: string; ref_table: string }>`
    select kcu.table_name, kcu.column_name, ccu.table_name as ref_table
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = current_schema()`.execute(side.db);
  return rows.rows.map((r) => ({ table: r.table_name, column: r.column_name, ref: r.ref_table }));
}

function topoOrder(tables: string[], fks: ForeignKey[]): string[] {
  const deps = new Map(tables.map((t) => [t, new Set<string>()]));
  for (const fk of fks) if (fk.table !== fk.ref && deps.has(fk.table) && deps.has(fk.ref)) deps.get(fk.table)!.add(fk.ref);
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (t: string, stack: Set<string>) => {
    if (seen.has(t) || stack.has(t)) return;
    stack.add(t);
    for (const d of deps.get(t) ?? []) visit(d, stack);
    stack.delete(t);
    seen.add(t);
    out.push(t);
  };
  for (const t of [...tables].sort()) visit(t, new Set());
  return out;
}

function orderSelfReferencing(rows: Array<Record<string, unknown>>, columns: string[]): Array<Record<string, unknown>> {
  if (!columns.length || !rows.length || !('id' in rows[0]!)) return rows;
  const pending = [...rows];
  const done = new Set<unknown>();
  const out: Array<Record<string, unknown>> = [];
  while (pending.length) {
    const before = pending.length;
    for (let i = 0; i < pending.length; ) {
      const r = pending[i]!;
      if (columns.every((c) => r[c] === null || r[c] === undefined || r[c] === r.id || done.has(r[c]))) {
        out.push(r);
        done.add(r.id);
        pending.splice(i, 1);
      } else i++;
    }
    if (pending.length === before) return [...out, ...pending];
  }
  return out;
}

async function count(db: Kysely<any>, table: string): Promise<number> {
  const r = await db.selectFrom(table).select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirst();
  return Number(r?.n ?? 0);
}

export async function transferDatabase(
  source: TransferSide,
  target: TransferSide,
  opts: { log?: (message: string) => void } = {},
): Promise<TransferResult> {
  const log = opts.log ?? (() => undefined);
  if ((await pendingMigrations(source.db)).length) throw new Error('Kaynak veritabanında uygulanmamış migration var; önce uygulamayı (ya da "migrate" komutunu) çalıştırın.');

  log('Hedefte şema oluşturuluyor…');
  const migrated = await migrateToLatest(target.db);
  if (migrated.error) throw migrated.error;

  const sourceTables = new Set(await tableNames(source));
  const tables = (await tableNames(target)).filter((t) => sourceTables.has(t));
  const fks = await foreignKeys(target, tables);
  const order = topoOrder(tables, fks);

  if (await count(target.db, 'users').catch(() => 0)) {
    throw new Error('Hedef veritabanında zaten üye var. Veri kaybını önlemek için taşıma yalnızca boş bir veritabanına yapılır.');
  }

  const targetColumns = new Map<string, Set<string>>();
  for (const t of order) targetColumns.set(t, new Set(await columnsOf(target, t)));

  const copy = async (db: Kysely<any>): Promise<TransferResult> => {
    for (const t of [...order].reverse()) await db.deleteFrom(t).execute();
    const result: TransferResult = { tables: [], totalRows: 0 };
    for (const t of order) {
      const targetCols = targetColumns.get(t)!;
      const selfCols = fks.filter((f) => f.table === t && f.ref === t).map((f) => f.column);
      let rows = (await source.db.selectFrom(t).selectAll().execute()) as Array<Record<string, unknown>>;
      rows = orderSelfReferencing(rows, selfCols);
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => targetCols.has(k))));
        await db.insertInto(t).values(batch).execute();
      }
      result.tables.push({ table: t, rows: rows.length });
      result.totalRows += rows.length;
      if (rows.length) log(`${t}: ${rows.length}`);
    }
    if (target.driver !== 'sqlite') {
      for (const t of order) {
        if (!targetColumns.get(t)!.has('id')) continue;
        await sql`select setval(pg_get_serial_sequence(${t}, 'id'), coalesce((select max(id) from ${sql.table(t)}), 1), (select max(id) from ${sql.table(t)}) is not null)`.execute(db);
      }
    }
    return result;
  };
  let result: TransferResult;
  if (target.driver === 'sqlite') {
    await sql`PRAGMA foreign_keys = OFF`.execute(target.db);
    try {
      result = await target.db.transaction().execute(copy);
    } finally {
      await sql`PRAGMA foreign_keys = ON`.execute(target.db);
    }
  } else {
    result = await target.db.transaction().execute(copy);
  }

  for (const { table, rows } of result.tables) {
    const n = await count(target.db, table);
    if (n !== rows) throw new Error(`Doğrulama başarısız: ${table} tablosunda ${rows} yerine ${n} satır var.`);
  }
  log(`Tamamlandı: ${result.tables.length} tablo, ${result.totalRows} satır.`);
  return result;
}
