import type { Kysely } from 'kysely';
import { flag, helpers, notNull, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);
  await h
    .plainTable('extensions')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('name', 'text', notNull)
    .addColumn('version', 'text', notNull)
    .addColumn('is_enabled', 'smallint', flag(0))
    .addColumn('source', 'text', textDefault('upload'))
    .addColumn('package_name', 'text')
    .addColumn('manifest_json', 'text', notNull)
    .addColumn('settings_json', 'text', textDefault('{}'))
    .addColumn('error', 'text')
    .addColumn('installed_by', 'integer')
    .addColumn('installed_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();

  await h
    .plainTable('extension_kv')
    .addColumn('ext_id', 'text', notNull)
    .addColumn('key', 'text', notNull)
    .addColumn('value_json', 'text', notNull)
    .addColumn('expires_at', 'bigint')
    .addColumn('updated_at', 'bigint', notNull)
    .addPrimaryKeyConstraint('extension_kv_pk', ['ext_id', 'key'])
    .execute();

  await h
    .plainTable('extension_migrations')
    .addColumn('ext_id', 'text', notNull)
    .addColumn('name', 'text', notNull)
    .addColumn('applied_at', 'bigint', notNull)
    .addPrimaryKeyConstraint('extension_migrations_pk', ['ext_id', 'name'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['extension_migrations', 'extension_kv', 'extensions']) await db.schema.dropTable(t).ifExists().execute();
}
