import type { Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, ref, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  // Üst menü öğeleri (yönetim panelinden düzenlenir).
  await h
    .table('nav_items')
    .addColumn('parent_id', 'integer', ref('nav_items.id', 'cascade', false))
    .addColumn('kind', 'text', textDefault('link'))
    .addColumn('builtin_key', 'text')
    .addColumn('label', 'text', notNull)
    .addColumn('url', 'text')
    .addColumn('icon', 'text')
    .addColumn('new_tab', 'smallint', flag(0))
    .addColumn('visibility', 'text', textDefault('all'))
    .addColumn('permission', 'text')
    .addColumn('is_enabled', 'smallint', flag(1))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();

  // Profil kapak fotoğrafı
  await db.schema.alterTable('users').addColumn('cover_file_id', 'integer').execute();
  await db.schema.alterTable('users').addColumn('cover_offset', 'integer', intDefault(50)).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('users').dropColumn('cover_offset').execute();
  await db.schema.alterTable('users').dropColumn('cover_file_id').execute();
  await db.schema.dropTable('nav_items').execute();
}
