import type { Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  await h
    .table('wiki_pages')
    .addColumn('parent_id', 'integer')
    .addColumn('slug', 'text', notNull)
    .addColumn('title', 'text', notNull)
    .addColumn('icon', 'text')
    .addColumn('summary', 'text')
    .addColumn('body', 'text', textDefault(''))
    .addColumn('body_html', 'text', textDefault(''))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('is_published', 'smallint', flag(1))
    .addColumn('is_locked', 'smallint', flag(0))
    .addColumn('view_count', 'integer', intDefault(0))
    .addColumn('created_by', 'integer')
    .addColumn('updated_by', 'integer')
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('wiki_pages_parent_idx').on('wiki_pages').columns(['parent_id', 'sort_order']).execute();

  await h
    .table('wiki_revisions')
    .addColumn('page_id', 'integer', notNull)
    .addColumn('title', 'text', notNull)
    .addColumn('body', 'text', textDefault(''))
    .addColumn('note', 'text')
    .addColumn('user_id', 'integer')
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('wiki_revisions_page_idx').on('wiki_revisions').columns(['page_id', 'created_at']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('wiki_revisions').execute();
  await db.schema.dropTable('wiki_pages').execute();
}
