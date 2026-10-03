import type { Kysely } from 'kysely';
import { flag, notNull, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const add = (col: string, type: 'text' | 'smallint', build: Parameters<ReturnType<Kysely<any>['schema']['alterTable']>['addColumn']>[2]) =>
    db.schema.alterTable('custom_pages').addColumn(col, type, build).execute();
  await db.schema.alterTable('custom_pages').addColumn('route', 'text').execute();
  await add('css', 'text', textDefault(''));
  await add('js', 'text', textDefault(''));
  await add('sidebar', 'text', textDefault('none'));
  await add('sidebar_html', 'text', textDefault(''));
  await add('server_code', 'text', textDefault(''));
  await add('server_enabled', 'smallint', flag(0));
  await add('allowed_hosts_json', 'text', textDefault('[]'));
  await add('secrets_enc', 'text', textDefault(''));
  await db.schema.createIndex('custom_pages_route_uq').on('custom_pages').column('route').unique().execute();

  await db.schema
    .createTable('page_kv')
    .addColumn('page_id', 'integer', (c) => c.notNull().references('custom_pages.id').onDelete('cascade'))
    .addColumn('key', 'text', notNull)
    .addColumn('value_json', 'text', notNull)
    .addColumn('expires_at', 'bigint')
    .addColumn('updated_at', 'bigint', notNull)
    .addPrimaryKeyConstraint('page_kv_pk', ['page_id', 'key'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('page_kv').execute();
  await db.schema.dropIndex('custom_pages_route_uq').execute();
  for (const col of ['secrets_enc', 'allowed_hosts_json', 'server_enabled', 'server_code', 'sidebar_html', 'sidebar', 'js', 'css', 'route']) {
    await db.schema.alterTable('custom_pages').dropColumn(col).execute();
  }
}
