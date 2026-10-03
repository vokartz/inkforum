import type { ColumnDefinitionBuilder, CreateTableBuilder, Kysely } from 'kysely';
import { isSqlite } from '../dialect.js';

type Builder = (col: ColumnDefinitionBuilder) => ColumnDefinitionBuilder;

export function helpers(db: Kysely<any>) {
  const sqlite = isSqlite(db);

  return {
    sqlite,

    table(name: string, opts: { big?: boolean } = {}): CreateTableBuilder<string, 'id'> {
      const type = sqlite ? 'integer' : opts.big ? 'bigint' : 'integer';
      return db.schema
        .createTable(name)
        .addColumn('id', type, (c) =>
          sqlite ? c.primaryKey().autoIncrement() : c.primaryKey().generatedByDefaultAsIdentity(),
        );
    },

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
