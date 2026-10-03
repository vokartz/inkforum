import type { Kysely } from 'kysely';
import { helpers, notNull, ref } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);
  await h
    .table('shouts')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('body', 'text', notNull)
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('deleted_at', 'bigint')
    .addColumn('deleted_by', 'integer', ref('users.id', 'set null', false))
    .execute();
  await db.schema.createIndex('shouts_created_idx').on('shouts').columns(['created_at']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('shouts').execute();
}
