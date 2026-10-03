import type { Kysely } from 'kysely';
import { helpers, notNull, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  await h
    .table('import_runs')
    .addColumn('platform', 'text', textDefault(''))
    .addColumn('version', 'text', textDefault(''))
    .addColumn('source_name', 'text', notNull)
    .addColumn('source_size', 'bigint', (c) => c.notNull().defaultTo(0))
    .addColumn('status', 'text', textDefault('staging'))
    .addColumn('options_json', 'text', textDefault('{}'))
    .addColumn('analysis_json', 'text', textDefault('{}'))
    .addColumn('stats_json', 'text', textDefault('{}'))
    .addColumn('log_json', 'text', textDefault('[]'))
    .addColumn('error', 'text')
    .addColumn('created_by', 'integer')
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('started_at', 'bigint')
    .addColumn('finished_at', 'bigint')
    .execute();

  await h
    .plainTable('import_redirects')
    .addColumn('kind', 'text', notNull)
    .addColumn('old_id', 'text', notNull)
    .addColumn('new_id', 'integer', notNull)
    .addColumn('run_id', 'integer', notNull)
    .addPrimaryKeyConstraint('import_redirects_pk', ['kind', 'old_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('import_redirects').ifExists().execute();
  await db.schema.dropTable('import_runs').ifExists().execute();
}
