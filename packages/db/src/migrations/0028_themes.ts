import type { Kysely } from 'kysely';
import { flag, helpers, notNull, ref } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  await helpers(db)
    .table('themes')
    .addColumn('name', 'text', notNull)
    .addColumn('description', 'text', (c) => c.notNull().defaultTo(''))
    .addColumn('is_system', 'smallint', flag(0))
    .addColumn('preset', 'text')
    .addColumn('config_json', 'text', notNull)
    .addColumn('css', 'text', (c) => c.notNull().defaultTo(''))
    .addColumn('html_json', 'text', (c) => c.notNull().defaultTo('{}'))
    .addColumn('created_by', 'integer', ref('users.id', 'set null', false))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('themes').execute();
}
