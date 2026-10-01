import type { Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  await db.schema
    .createTable('settings')
    .addColumn('key', 'text', (c) => c.primaryKey())
    .addColumn('value_json', 'text', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .addColumn('updated_by', 'integer')
    .execute();

  await db.schema
    .createTable('system_state')
    .addColumn('key', 'text', (c) => c.primaryKey())
    .addColumn('value', 'text', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();

  await h
    .table('jobs', { big: true })
    .addColumn('queue', 'text', textDefault('default'))
    .addColumn('type', 'text', notNull)
    .addColumn('payload_json', 'text', notNull)
    .addColumn('status', 'text', textDefault('pending'))
    .addColumn('priority', 'integer', intDefault(0))
    .addColumn('attempts', 'integer', intDefault(0))
    .addColumn('max_attempts', 'integer', intDefault(5))
    .addColumn('run_at', 'bigint', notNull)
    .addColumn('locked_by', 'text')
    .addColumn('locked_until', 'bigint')
    .addColumn('last_error', 'text')
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('finished_at', 'bigint')
    .execute();
  await db.schema.createIndex('jobs_claim_idx').on('jobs').columns(['status', 'run_at', 'priority']).execute();
  await db.schema.createIndex('jobs_type_idx').on('jobs').columns(['type', 'status']).execute();

  await db.schema
    .createTable('scheduled_tasks')
    .addColumn('name', 'text', (c) => c.primaryKey())
    .addColumn('interval_ms', 'bigint', notNull)
    .addColumn('next_run_at', 'bigint', notNull)
    .addColumn('last_run_at', 'bigint')
    .addColumn('last_status', 'text')
    .addColumn('last_error', 'text')
    .addColumn('locked_until', 'bigint')
    .addColumn('is_enabled', 'smallint', flag(1))
    .execute();

  await h
    .table('files')
    .addColumn('owner_user_id', 'integer')
    .addColumn('purpose', 'text', notNull)
    .addColumn('driver', 'text', notNull)
    .addColumn('path', 'text', notNull)
    .addColumn('mime', 'text', notNull)
    .addColumn('size', 'integer', notNull)
    .addColumn('width', 'integer')
    .addColumn('height', 'integer')
    .addColumn('sha256', 'text', notNull)
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('files_owner_idx').on('files').columns(['owner_user_id', 'purpose']).execute();
  await db.schema.createIndex('files_sha_idx').on('files').column('sha256').execute();

  await h
    .table('audit_log', { big: true })
    .addColumn('log_type', 'text', notNull)
    .addColumn('action', 'text', notNull)
    .addColumn('actor_id', 'integer')
    .addColumn('target_type', 'text')
    .addColumn('target_id', 'integer')
    .addColumn('ip', 'text')
    .addColumn('user_agent', 'text')
    .addColumn('data_json', 'text')
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('audit_type_idx').on('audit_log').columns(['log_type', 'created_at']).execute();
  await db.schema.createIndex('audit_actor_idx').on('audit_log').columns(['actor_id', 'created_at']).execute();
  await db.schema.createIndex('audit_target_idx').on('audit_log').columns(['target_type', 'target_id']).execute();
  await db.schema.createIndex('audit_action_idx').on('audit_log').column('action').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['audit_log', 'files', 'scheduled_tasks', 'jobs', 'system_state', 'settings']) {
    await db.schema.dropTable(t).execute();
  }
}
