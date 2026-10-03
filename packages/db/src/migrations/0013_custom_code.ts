import type { Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  await h
    .table('custom_pages')
    .addColumn('slug', 'text', notNull)
    .addColumn('title', 'text', notNull)
    .addColumn('format', 'text', textDefault('bbcode'))
    .addColumn('body', 'text', textDefault(''))
    .addColumn('body_html', 'text', textDefault(''))
    .addColumn('layout', 'text', textDefault('default'))
    .addColumn('show_title', 'smallint', flag(1))
    .addColumn('meta_description', 'text')
    .addColumn('visibility', 'text', textDefault('all'))
    .addColumn('group_ids_json', 'text', textDefault('[]'))
    .addColumn('is_published', 'smallint', flag(1))
    .addColumn('updated_by', 'integer')
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('custom_pages_slug_uq').on('custom_pages').column('slug').unique().execute();

  await h
    .table('custom_snippets')
    .addColumn('name', 'text', notNull)
    .addColumn('placement', 'text', notNull)
    .addColumn('title', 'text')
    .addColumn('html', 'text', textDefault(''))
    .addColumn('visibility', 'text', textDefault('all'))
    .addColumn('group_ids_json', 'text', textDefault('[]'))
    .addColumn('is_enabled', 'smallint', flag(1))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('custom_snippets').execute();
  await db.schema.dropTable('custom_pages').execute();
}
