import type { Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, ref, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  // ---------- Yasaklar ----------
  await h
    .table('bans')
    .addColumn('name', 'text', notNull)
    .addColumn('reason_public', 'text')
    .addColumn('notes_private', 'text')
    .addColumn('cannot_access', 'smallint', flag(0))
    .addColumn('cannot_login', 'smallint', flag(0))
    .addColumn('cannot_register', 'smallint', flag(0))
    .addColumn('cannot_post', 'smallint', flag(0))
    .addColumn('expires_at', 'bigint')
    .addColumn('lifted_at', 'bigint')
    .addColumn('lifted_by', 'integer')
    .addColumn('source', 'text', textDefault('manual'))
    .addColumn('source_ref', 'integer')
    .addColumn('created_by', 'integer')
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('bans_expires_idx').on('bans').column('expires_at').execute();

  await h
    .table('ban_triggers')
    .addColumn('ban_id', 'integer', ref('bans.id'))
    .addColumn('type', 'text', notNull)
    .addColumn('value', 'text', notNull)
    .addColumn('ip_low', 'text')
    .addColumn('ip_high', 'text')
    .addColumn('user_id', 'integer', ref('users.id', 'cascade', false))
    .addColumn('hits', 'integer', intDefault(0))
    .addColumn('last_hit_at', 'bigint')
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('ban_triggers_ban_idx').on('ban_triggers').column('ban_id').execute();
  await db.schema.createIndex('ban_triggers_type_idx').on('ban_triggers').columns(['type', 'value']).execute();
  await db.schema.createIndex('ban_triggers_user_idx').on('ban_triggers').column('user_id').execute();

  await h
    .table('ban_log', { big: true })
    .addColumn('ban_id', 'integer', ref('bans.id'))
    .addColumn('trigger_id', 'integer')
    .addColumn('user_id', 'integer')
    .addColumn('ip', 'text')
    .addColumn('email', 'text')
    .addColumn('context', 'text', notNull)
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('ban_log_created_idx').on('ban_log').column('created_at').execute();

  // ---------- Uyarılar ----------
  await h
    .table('warning_templates')
    .addColumn('title', 'text', notNull)
    .addColumn('reason_template', 'text', notNull)
    .addColumn('points', 'integer', notNull)
    .addColumn('expiry_days', 'integer')
    .addColumn('is_active', 'smallint', flag(1))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();

  await h
    .table('user_warnings')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('issued_by', 'integer', ref('users.id', 'set null', false))
    .addColumn('template_id', 'integer', ref('warning_templates.id', 'set null', false))
    .addColumn('points', 'integer', notNull)
    .addColumn('reason', 'text', notNull)
    .addColumn('message_to_user', 'text')
    .addColumn('notes', 'text')
    .addColumn('content_type', 'text')
    .addColumn('content_id', 'integer')
    .addColumn('expires_at', 'bigint')
    .addColumn('expired_at', 'bigint')
    .addColumn('revoked_at', 'bigint')
    .addColumn('revoked_by', 'integer')
    .addColumn('revoke_reason', 'text')
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('user_warnings_user_idx').on('user_warnings').columns(['user_id', 'created_at']).execute();
  await db.schema.createIndex('user_warnings_expires_idx').on('user_warnings').column('expires_at').execute();

  await h
    .table('warning_actions')
    .addColumn('threshold_points', 'integer', notNull)
    .addColumn('action', 'text', notNull)
    .addColumn('mode', 'text', notNull)
    .addColumn('duration_ms', 'bigint')
    .addColumn('is_active', 'smallint', flag(1))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();

  await h
    .table('warning_action_applications')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('action_id', 'integer', ref('warning_actions.id'))
    .addColumn('warning_id', 'integer', ref('user_warnings.id', 'set null', false))
    .addColumn('applied_at', 'bigint', notNull)
    .addColumn('expires_at', 'bigint')
    .addColumn('reverted_at', 'bigint')
    .execute();
  await db.schema
    .createIndex('warning_action_applications_user_idx')
    .on('warning_action_applications')
    .column('user_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const t of [
    'warning_action_applications',
    'warning_actions',
    'user_warnings',
    'warning_templates',
    'ban_log',
    'ban_triggers',
    'bans',
  ]) {
    await db.schema.dropTable(t).execute();
  }
}
