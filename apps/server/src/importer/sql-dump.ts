import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { StringDecoder } from 'node:string_decoder';

export type SqlValue = string | number | null | Uint8Array;

export interface SqliteStatement {
  run(...params: SqlValue[]): unknown;
  all(...params: SqlValue[]): Array<Record<string, SqlValue>>;
  get(...params: SqlValue[]): Record<string, SqlValue> | undefined;
}

export interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

export function openSqlite(path: string): SqliteDb {
  const mod = (process as unknown as { getBuiltinModule(n: string): { DatabaseSync: new (p: string, o?: object) => never } }).getBuiltinModule('node:sqlite');
  return new mod.DatabaseSync(path);
}

export async function* statements(file: string): AsyncGenerator<string> {
  const input = createReadStream(file, { highWaterMark: 1 << 20 });
  const stream = file.endsWith('.gz') ? input.pipe(createGunzip()) : input;
  const decoder = new StringDecoder('latin1');
  let stmt = '';
  let state: 'n' | "'" | '"' | '`' | '--' | '/*' = 'n';
  let prev = '';
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    const text = decoder.write(chunk);
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;
      switch (state) {
        case 'n':
          if (c === "'" || c === '"' || c === '`') state = c;
          else if (c === '-' && text[i + 1] === '-' && (text[i + 2] === ' ' || text[i + 2] === '\t' || text[i + 2] === '\n' || text[i + 2] === '\r')) {
            stmt += text.slice(start, i);
            state = '--';
          } else if (c === '#') {
            stmt += text.slice(start, i);
            state = '--';
          } else if (c === '/' && text[i + 1] === '*') {
            stmt += text.slice(start, i);
            state = '/*';
            i++;
          } else if (c === ';') {
            stmt += text.slice(start, i);
            start = i + 1;
            const s = stmt.trim();
            stmt = '';
            if (s) yield s;
          }
          break;
        case "'":
        case '"':
          if (c === '\\') i++;
          else if (c === state) state = 'n';
          break;
        case '`':
          if (c === '`') state = 'n';
          break;
        case '--':
          if (c === '\n') {
            state = 'n';
            start = i + 1;
          }
          break;
        case '/*':
          if (c === '/' && prev === '*') {
            state = 'n';
            start = i + 1;
          }
          break;
      }
      prev = c;
      if (state === '--' || state === '/*') start = i + 1;
    }
    if (state !== '--' && state !== '/*') stmt += text.slice(start);
  }
  const last = (stmt + decoder.end()).trim();
  if (last) yield last;
}

const unquoteIdent = (s: string) => s.trim().replace(/^`|`$/g, '').replace(/``/g, '`');

export function parseCreateTable(stmt: string): { table: string; columns: string[] } | null {
  const m = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:`[^`]+`|\w+)(?:\.(?:`[^`]+`|\w+))?)\s*\(([\s\S]*)\)[^)]*$/i.exec(stmt);
  if (!m) return null;
  const table = unquoteIdent(m[1]!.split('.').pop()!);
  const columns: string[] = [];
  for (const line of m[2]!.split('\n')) {
    const l = line.trim();
    const cm = /^(`[^`]+`|[A-Za-z_]\w*)\s+[a-z]/i.exec(l);
    if (!cm) continue;
    if (/^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN|FULLTEXT|SPATIAL|CHECK)\b/i.test(l)) continue;
    columns.push(unquoteIdent(cm[1]!));
  }
  return { table, columns };
}

export function parseInsert(stmt: string): { table: string; columns: string[] | null; rows: SqlValue[][] } | null {
  const head = /^(?:INSERT|REPLACE)\s+(?:LOW_PRIORITY\s+|DELAYED\s+|HIGH_PRIORITY\s+|IGNORE\s+)*(?:INTO\s+)?((?:`[^`]+`|\w+)(?:\.(?:`[^`]+`|\w+))?)\s*(\(([^)]*)\))?\s*VALUES\s*/i.exec(stmt);
  if (!head) return null;
  const table = unquoteIdent(head[1]!.split('.').pop()!);
  const columns = head[3] ? head[3].split(',').map(unquoteIdent) : null;
  const rows: SqlValue[][] = [];
  let i = head[0].length;
  const n = stmt.length;
  while (i < n) {
    while (i < n && stmt[i] !== '(') {
      if (stmt.slice(i, i + 23).toUpperCase().startsWith('ON DUPLICATE')) return { table, columns, rows };
      i++;
    }
    if (i >= n) break;
    i++;
    const row: SqlValue[] = [];
    for (;;) {
      while (stmt[i] === ' ' || stmt[i] === '\n' || stmt[i] === '\r' || stmt[i] === '\t') i++;
      const intro = /^_[a-z0-9]+\s*/i.exec(stmt.slice(i, i + 20));
      if (intro && (stmt[i + intro[0].length] === "'" || stmt[i + intro[0].length] === '"')) i += intro[0].length;
      const c = stmt[i];
      if (c === "'" || c === '"') {
        const q = c;
        let out = '';
        let j = i + 1;
        let segStart = j;
        while (j < n) {
          const ch = stmt[j]!;
          if (ch === '\\') {
            out += stmt.slice(segStart, j);
            const e = stmt[j + 1]!;
            out += e === 'n' ? '\n' : e === 'r' ? '\r' : e === 't' ? '\t' : e === '0' ? '\0' : e === 'Z' ? '\x1a' : e === 'b' ? '\b' : e;
            j += 2;
            segStart = j;
          } else if (ch === q) {
            if (stmt[j + 1] === q) {
              out += stmt.slice(segStart, j + 1);
              j += 2;
              segStart = j;
            } else break;
          } else j++;
        }
        out += stmt.slice(segStart, j);
        row.push(out);
        i = j + 1;
      } else if (/^0x[0-9a-f]*/i.test(stmt.slice(i, i + 3))) {
        const hm = /^0x([0-9a-f]*)/i.exec(stmt.slice(i))!;
        row.push(Buffer.from(hm[1]!, 'hex').toString('latin1'));
        i += hm[0].length;
      } else {
        let j = i;
        while (j < n && stmt[j] !== ',' && stmt[j] !== ')') j++;
        const raw = stmt.slice(i, j).trim();
        if (/^null$/i.test(raw)) row.push(null);
        else if (/^-?\d+$/.test(raw) && raw.length < 16) row.push(Number(raw));
        else if (/^-?\d*\.\d+(e[+-]?\d+)?$/i.test(raw)) row.push(Number(raw));
        else if (/^b'[01]*'$/i.test(raw)) row.push(parseInt(raw.slice(2, -1) || '0', 2));
        else row.push(raw.replace(/^'|'$/g, ''));
        i = j;
      }
      while (stmt[i] === ' ' || stmt[i] === '\n' || stmt[i] === '\r' || stmt[i] === '\t') i++;
      if (stmt[i] === ',') {
        i++;
        continue;
      }
      if (stmt[i] === ')') {
        i++;
        break;
      }
      break;
    }
    rows.push(row);
  }
  return { table, columns, rows };
}

export interface StageResult {
  tables: Record<string, number>;
  skipped: number;
  statements: number;
}

export type RowFilter = (table: string, value: (column: string) => SqlValue) => boolean;

const INT_RE = /^-?(?:0|[1-9]\d{0,14})$/;
// eslint-disable-next-line no-control-regex
const ASCII_RE = /^[\u0000-\u007f]*$/;

export async function stageDump(
  file: string,
  stagePath: string,
  keep: (table: string) => boolean,
  onProgress?: (p: { statements: number; rows: number }) => void,
  rowFilter?: RowFilter,
): Promise<StageResult> {
  const db = openSqlite(stagePath);
  db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;');
  const columns = new Map<string, string[]>();
  const created = new Set<string>();
  const counts: Record<string, number> = {};
  let statementsSeen = 0;
  let skipped = 0;
  let rowsTotal = 0;
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const ensure = (table: string, cols: string[]) => {
    if (created.has(table)) return;
    db.exec(`DROP TABLE IF EXISTS ${q(table)}; CREATE TABLE ${q(table)} (${cols.map((c) => `${q(c)}`).join(', ')});`);
    created.add(table);
    counts[table] = 0;
  };
  db.exec('BEGIN');
  let pending = 0;
  try {
    for await (const stmt of statements(file)) {
      statementsSeen++;
      const kw = stmt.slice(0, 14).toUpperCase();
      if (kw.startsWith('CREATE TABLE')) {
        const ct = parseCreateTable(stmt);
        if (ct && keep(ct.table)) {
          columns.set(ct.table, ct.columns);
          created.delete(ct.table);
          ensure(ct.table, ct.columns);
        }
        continue;
      }
      if (!kw.startsWith('INSERT') && !kw.startsWith('REPLACE')) continue;
      const tableName = /^(?:INSERT|REPLACE)\s+(?:\w+\s+)*?(?:INTO\s+)?(`[^`]+`|\w+)/i.exec(stmt)?.[1];
      if (!tableName || !keep(unquoteIdent(tableName))) {
        skipped++;
        continue;
      }
      const ins = parseInsert(stmt);
      if (!ins || !ins.rows.length) continue;
      const cols = ins.columns ?? columns.get(ins.table);
      if (!cols) {
        skipped++;
        continue;
      }
      if (!created.has(ins.table)) ensure(ins.table, cols);
      const target = columns.get(ins.table) ?? cols;
      const idx = cols.map((c) => target.indexOf(c));
      const insert = db.prepare(`INSERT INTO ${q(ins.table)} (${target.map(q).join(',')}) VALUES (${target.map(() => '?').join(',')})`);
      for (const r of ins.rows) {
        if (rowFilter) {
          const at = (c: string) => {
            const k = cols.indexOf(c);
            return k >= 0 ? (r[k] ?? null) : null;
          };
          if (!rowFilter(ins.table, at)) continue;
        }
        const values: SqlValue[] = target.map(() => null);
        idx.forEach((to, from) => {
          const v = r[from] ?? null;
          if (to >= 0) values[to] = typeof v === 'string' ? (INT_RE.test(v) ? Number(v) : ASCII_RE.test(v) ? v : Buffer.from(v, 'latin1')) : v;
        });
        insert.run(...values);
        counts[ins.table] = (counts[ins.table] ?? 0) + 1;
        rowsTotal++;
      }
      pending += ins.rows.length;
      if (pending > 20_000) {
        db.exec('COMMIT; BEGIN');
        pending = 0;
        onProgress?.({ statements: statementsSeen, rows: rowsTotal });
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
    }
    throw err;
  } finally {
    db.close();
  }
  return { tables: counts, skipped, statements: statementsSeen };
}
