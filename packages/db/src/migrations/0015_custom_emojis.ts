import type { Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, ref, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);
  await h
    .table('custom_emojis')
    .addColumn('shortcode', 'text', notNull)
    .addColumn('name', 'text', notNull)
    .addColumn('category', 'text', textDefault('Özel'))
    .addColumn('file_id', 'integer', ref('files.id', 'set null', false))
    .addColumn('url', 'text', notNull)
    .addColumn('is_enabled', 'smallint', flag(1))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('created_by', 'integer', ref('users.id', 'set null', false))
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('custom_emojis_shortcode_uq').on('custom_emojis').column('shortcode').unique().execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('custom_emojis').execute();
}
