import type { Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, textDefault } from './_helpers.js';

/** Başvuru formları, başvurular ve inceleme notları. */
export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  await h
    .table('application_forms')
    .addColumn('slug', 'text', notNull)
    .addColumn('title', 'text', notNull)
    .addColumn('description', 'text', textDefault(''))
    .addColumn('description_html', 'text', textDefault(''))
    .addColumn('icon', 'text')
    .addColumn('is_open', 'smallint', flag(1))
    .addColumn('questions_json', 'text', textDefault('[]'))
    .addColumn('requirements_json', 'text', textDefault('{}'))
    .addColumn('target_group_id', 'integer')
    .addColumn('set_primary', 'smallint', flag(0))
    .addColumn('reviewer_group_ids_json', 'text', textDefault('[]'))
    .addColumn('accept_message', 'text', textDefault(''))
    .addColumn('reject_message', 'text', textDefault(''))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('application_forms_slug_uq').on('application_forms').column('slug').unique().execute();

  await h
    .table('applications')
    .addColumn('form_id', 'integer', notNull)
    .addColumn('user_id', 'integer', notNull)
    .addColumn('status', 'text', textDefault('pending'))
    .addColumn('answers_json', 'text', textDefault('{}'))
    .addColumn('reviewer_id', 'integer')
    .addColumn('decided_by', 'integer')
    .addColumn('decision_reason', 'text')
    .addColumn('decided_at', 'bigint')
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('applications_form_status_idx').on('applications').columns(['form_id', 'status', 'created_at']).execute();
  await db.schema.createIndex('applications_user_idx').on('applications').columns(['user_id', 'form_id']).execute();

  await h
    .table('application_notes')
    .addColumn('application_id', 'integer', notNull)
    .addColumn('user_id', 'integer')
    .addColumn('body', 'text', notNull)
    .addColumn('is_internal', 'smallint', flag(0))
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('application_notes_app_idx').on('application_notes').columns(['application_id', 'created_at']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('application_notes').execute();
  await db.schema.dropTable('applications').execute();
  await db.schema.dropTable('application_forms').execute();
}
