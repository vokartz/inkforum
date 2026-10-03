import type { Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);
  await h
    .table('home_blocks')
    .addColumn('position', 'text', textDefault('top'))
    .addColumn('kind', 'text', notNull)
    .addColumn('title', 'text')
    .addColumn('config_json', 'text', textDefault('{}'))
    .addColumn('visibility', 'text', textDefault('all'))
    .addColumn('is_enabled', 'smallint', flag(1))
    .addColumn('starts_at', 'bigint')
    .addColumn('ends_at', 'bigint')
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('home_blocks').execute();
}
