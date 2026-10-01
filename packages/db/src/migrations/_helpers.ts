import type { ColumnDefinitionBuilder, CreateTableBuilder, Kysely } from 'kysely';
import { isSqlite } from '../dialect.js';

/**
 * Taşınabilir migration yardımcıları (SQLite + PostgreSQL).
 * Kurallar: zaman = bigint ms (DB varsayılanı yok), bayrak = smallint 0/1, JSON = text.
 * Yalnızca yeni tablo / addColumn / createIndex. CHECK kısıtı ve dialect'e özel tip yok.
 */

type Builder = (col: ColumnDefinitionBuilder) => ColumnDefinitionBuilder;

export function helpers(db: Kysely<any>) {
  const sqlite = isSqlite(db);

  return {
    sqlite,

    /** Otomatik artan birincil anahtar. `big` yüksek hacimli tablolar içindir (PG'de bigint). */
    table(name: string, opts: { big?: boolean } = {}): CreateTableBuilder<string, 'id'> {
      const type = sqlite ? 'integer' : opts.big ? 'bigint' : 'integer';
      return db.schema
        .createTable(name)
        .addColumn('id', type, (c) =>
          sqlite ? c.primaryKey().autoIncrement() : c.primaryKey().generatedByDefaultAsIdentity(),
        );
    },

    /** Birincil anahtarı otomatik olmayan tablo. */
    plainTable(name: string): CreateTableBuilder<string, never> {
      return db.schema.createTable(name);
    },
  };
}

export const notNull: Builder = (c) => c.notNull();

export function flag(defaultValue: 0 | 1): Builder {
  return (c) => c.notNull().defaultTo(defaultValue);
}

export function intDefault(defaultValue: number): Builder {
  return (c) => c.notNull().defaultTo(defaultValue);
}

export function textDefault(defaultValue: string): Builder {
  return (c) => c.notNull().defaultTo(defaultValue);
}

export function ref(target: string, onDelete: 'cascade' | 'set null' | 'restrict' = 'cascade', required = true): Builder {
  return (c) => {
    const base = c.references(target).onDelete(onDelete);
    return required ? base.notNull() : base;
  };
}
