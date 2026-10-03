import { sql, type Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, ref, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  await h
    .table('member_groups')
    .addColumn('system_key', 'text', (c) => c.unique())
    .addColumn('name', 'text', notNull)
    .addColumn('description', 'text', textDefault(''))
    .addColumn('color', 'text')
    .addColumn('icon_file_id', 'integer', ref('files.id', 'set null', false))
    .addColumn('icon_count', 'integer', intDefault(0))
    .addColumn('kind', 'text', notNull)
    .addColumn('min_posts', 'integer')
    .addColumn('join_type', 'text', textDefault('closed'))
    .addColumn('is_protected', 'smallint', flag(0))
    .addColumn('visibility', 'text', textDefault('visible'))
    .addColumn('parent_id', 'integer', ref('member_groups.id', 'set null', false))
    .addColumn('require_2fa', 'smallint', flag(0))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('member_count', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('member_groups_kind_idx').on('member_groups').columns(['kind', 'min_posts']).execute();

  await h
    .table('users')
    .addColumn('username', 'text', notNull)
    .addColumn('username_canonical', 'text', (c) => c.notNull().unique())
    .addColumn('display_name', 'text', notNull)
    .addColumn('display_name_canonical', 'text', (c) => c.notNull().unique())
    .addColumn('email', 'text', notNull)
    .addColumn('email_canonical', 'text', (c) => c.notNull().unique())
    .addColumn('password_hash', 'text', notNull)
    .addColumn('must_change_password', 'smallint', flag(0))
    .addColumn('email_verified_at', 'bigint')
    .addColumn('status', 'text', notNull)
    .addColumn('primary_group_id', 'integer', ref('member_groups.id', 'set null', false))
    .addColumn('primary_group_expires_at', 'bigint')
    .addColumn('post_group_id', 'integer', ref('member_groups.id', 'set null', false))
    .addColumn('post_count', 'integer', intDefault(0))
    .addColumn('warning_points', 'integer', intDefault(0))
    .addColumn('achievement_points', 'integer', intDefault(0))
    .addColumn('unread_notifications', 'integer', intDefault(0))
    .addColumn('is_watched', 'smallint', flag(0))
    .addColumn('moderated_until', 'bigint')
    .addColumn('muted_until', 'bigint')
    .addColumn('policies_epoch', 'integer', intDefault(0))
    .addColumn('timezone', 'text', textDefault('Europe/Istanbul'))
    .addColumn('locale', 'text', textDefault('tr'))
    .addColumn('theme', 'text', textDefault('system'))
    .addColumn('avatar_file_id', 'integer', ref('files.id', 'set null', false))
    .addColumn('custom_title', 'text')
    .addColumn('username_changed_at', 'bigint')
    .addColumn('registered_at', 'bigint', notNull)
    .addColumn('registered_ip', 'text')
    .addColumn('approved_by', 'integer')
    .addColumn('approved_at', 'bigint')
    .addColumn('last_login_at', 'bigint')
    .addColumn('last_active_at', 'bigint')
    .addColumn('last_ip', 'text')
    .addColumn('deleted_at', 'bigint')
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
  for (const col of ['primary_group_id', 'post_group_id', 'status', 'last_active_at', 'registered_at', 'post_count']) {
    await db.schema.createIndex(`users_${col}_idx`).on('users').column(col).execute();
  }

  await db.schema
    .createTable('user_profiles')
    .addColumn('user_id', 'integer', (c) => c.primaryKey().references('users.id').onDelete('cascade'))
    .addColumn('signature', 'text', textDefault(''))
    .addColumn('bio', 'text', textDefault(''))
    .addColumn('birthdate', 'text')
    .addColumn('birth_md', 'text')
    .addColumn('location', 'text', textDefault(''))
    .addColumn('website_url', 'text', textDefault(''))
    .addColumn('privacy_json', 'text', textDefault('{}'))
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('user_profiles_birth_md_idx').on('user_profiles').column('birth_md').execute();

  await h
    .table('user_name_history')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('old_username', 'text', notNull)
    .addColumn('new_username', 'text', notNull)
    .addColumn('old_display_name', 'text', notNull)
    .addColumn('new_display_name', 'text', notNull)
    .addColumn('changed_by', 'integer')
    .addColumn('changed_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('user_name_history_user_idx').on('user_name_history').column('user_id').execute();

  await h
    .table('user_notes')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('author_id', 'integer', ref('users.id', 'set null', false))
    .addColumn('body', 'text', notNull)
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('user_notes_user_idx').on('user_notes').columns(['user_id', 'created_at']).execute();

  await h
    .table('user_tokens')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('type', 'text', notNull)
    .addColumn('token_hash', 'text', (c) => c.notNull().unique())
    .addColumn('payload_json', 'text')
    .addColumn('expires_at', 'bigint', notNull)
    .addColumn('used_at', 'bigint')
    .addColumn('created_ip', 'text')
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('user_tokens_user_idx').on('user_tokens').columns(['user_id', 'type']).execute();

  await h
    .table('sessions')
    .addColumn('token_hash', 'text', (c) => c.notNull().unique())
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('is_persistent', 'smallint', flag(0))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('last_seen_at', 'bigint', notNull)
    .addColumn('expires_at', 'bigint', notNull)
    .addColumn('absolute_expires_at', 'bigint', notNull)
    .addColumn('elevated_until', 'bigint')
    .addColumn('ip', 'text')
    .addColumn('user_agent', 'text')
    .addColumn('device_label', 'text')
    .execute();
  await db.schema.createIndex('sessions_user_idx').on('sessions').column('user_id').execute();
  await db.schema.createIndex('sessions_expires_idx').on('sessions').column('expires_at').execute();

  await h
    .table('login_challenges')
    .addColumn('token_hash', 'text', (c) => c.notNull().unique())
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('is_persistent', 'smallint', flag(0))
    .addColumn('attempts', 'integer', intDefault(0))
    .addColumn('expires_at', 'bigint', notNull)
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('ip', 'text')
    .execute();

  await h
    .table('auth_attempts', { big: true })
    .addColumn('kind', 'text', notNull)
    .addColumn('identifier', 'text', notNull)
    .addColumn('ip', 'text')
    .addColumn('success', 'smallint', flag(0))
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema
    .createIndex('auth_attempts_ident_idx')
    .on('auth_attempts')
    .columns(['kind', 'identifier', 'created_at'])
    .execute();
  await db.schema.createIndex('auth_attempts_ip_idx').on('auth_attempts').columns(['kind', 'ip', 'created_at']).execute();

  await db.schema
    .createTable('user_totp')
    .addColumn('user_id', 'integer', (c) => c.primaryKey().references('users.id').onDelete('cascade'))
    .addColumn('secret_enc', 'text', notNull)
    .addColumn('enabled_at', 'bigint')
    .addColumn('last_used_step', 'bigint')
    .addColumn('created_at', 'bigint', notNull)
    .execute();

  await h
    .table('user_recovery_codes')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('code_hash', 'text', notNull)
    .addColumn('used_at', 'bigint')
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('user_recovery_codes_user_idx').on('user_recovery_codes').column('user_id').execute();

  await db.schema
    .createTable('group_members')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('group_id', 'integer', ref('member_groups.id'))
    .addColumn('source', 'text', notNull)
    .addColumn('added_by', 'integer')
    .addColumn('added_at', 'bigint', notNull)
    .addColumn('expires_at', 'bigint')
    .addPrimaryKeyConstraint('group_members_pk', ['user_id', 'group_id'])
    .execute();
  await db.schema.createIndex('group_members_group_idx').on('group_members').column('group_id').execute();
  await db.schema
    .createIndex('group_members_expires_idx')
    .on('group_members')
    .column('expires_at')
    .where('expires_at', 'is not', null)
    .execute();

  await db.schema
    .createTable('group_moderators')
    .addColumn('group_id', 'integer', ref('member_groups.id'))
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('added_at', 'bigint', notNull)
    .addPrimaryKeyConstraint('group_moderators_pk', ['group_id', 'user_id'])
    .execute();

  await h
    .table('group_join_requests')
    .addColumn('group_id', 'integer', ref('member_groups.id'))
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('reason', 'text', textDefault(''))
    .addColumn('status', 'text', textDefault('pending'))
    .addColumn('handled_by', 'integer')
    .addColumn('handled_at', 'bigint')
    .addColumn('response', 'text')
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema
    .createIndex('group_join_requests_pending_uq')
    .on('group_join_requests')
    .columns(['group_id', 'user_id'])
    .unique()
    .where(sql.ref('status'), '=', 'pending')
    .execute();
  await db.schema
    .createIndex('group_join_requests_status_idx')
    .on('group_join_requests')
    .columns(['status', 'group_id'])
    .execute();

  await db.schema
    .createTable('group_permissions')
    .addColumn('group_id', 'integer', ref('member_groups.id'))
    .addColumn('permission', 'text', notNull)
    .addColumn('value', 'smallint', notNull)
    .addPrimaryKeyConstraint('group_permissions_pk', ['group_id', 'permission'])
    .execute();

  await h
    .table('permission_profiles')
    .addColumn('name', 'text', notNull)
    .addColumn('is_system', 'smallint', flag(0))
    .addColumn('created_at', 'bigint', notNull)
    .execute();

  await db.schema
    .createTable('permission_profile_entries')
    .addColumn('profile_id', 'integer', ref('permission_profiles.id'))
    .addColumn('group_id', 'integer', ref('member_groups.id'))
    .addColumn('permission', 'text', notNull)
    .addColumn('value', 'smallint', notNull)
    .addPrimaryKeyConstraint('permission_profile_entries_pk', ['profile_id', 'group_id', 'permission'])
    .execute();

  await h
    .table('policies')
    .addColumn('key', 'text', (c) => c.notNull().unique())
    .addColumn('is_required', 'smallint', flag(1))
    .addColumn('show_on_register', 'smallint', flag(1))
    .addColumn('is_active', 'smallint', flag(1))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();

  await h
    .table('policy_versions')
    .addColumn('policy_id', 'integer', ref('policies.id'))
    .addColumn('version', 'integer', notNull)
    .addColumn('requires_reacceptance', 'smallint', flag(0))
    .addColumn('change_note', 'text')
    .addColumn('published_at', 'bigint')
    .addColumn('created_by', 'integer')
    .addColumn('created_at', 'bigint', notNull)
    .addUniqueConstraint('policy_versions_uq', ['policy_id', 'version'])
    .execute();

  await db.schema
    .createTable('policy_version_texts')
    .addColumn('policy_version_id', 'integer', ref('policy_versions.id'))
    .addColumn('locale', 'text', notNull)
    .addColumn('title', 'text', notNull)
    .addColumn('body_md', 'text', notNull)
    .addPrimaryKeyConstraint('policy_version_texts_pk', ['policy_version_id', 'locale'])
    .execute();

  await h
    .table('policy_acceptances')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('policy_version_id', 'integer', ref('policy_versions.id'))
    .addColumn('accepted_at', 'bigint', notNull)
    .addColumn('ip', 'text')
    .addColumn('user_agent', 'text')
    .addUniqueConstraint('policy_acceptances_uq', ['user_id', 'policy_version_id'])
    .execute();
  await db.schema
    .createIndex('policy_acceptances_version_idx')
    .on('policy_acceptances')
    .column('policy_version_id')
    .execute();

  await h
    .table('profile_fields')
    .addColumn('key', 'text', (c) => c.notNull().unique())
    .addColumn('name', 'text', notNull)
    .addColumn('description', 'text', textDefault(''))
    .addColumn('type', 'text', notNull)
    .addColumn('options_json', 'text')
    .addColumn('regex', 'text')
    .addColumn('max_length', 'integer', intDefault(255))
    .addColumn('is_required', 'smallint', flag(0))
    .addColumn('show_on_register', 'smallint', flag(0))
    .addColumn('show_in_profile', 'smallint', flag(1))
    .addColumn('show_in_posts', 'smallint', flag(0))
    .addColumn('visibility', 'text', textDefault('public'))
    .addColumn('editable_by', 'text', textDefault('owner'))
    .addColumn('is_active', 'smallint', flag(1))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();

  await db.schema
    .createTable('user_profile_field_values')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('field_id', 'integer', ref('profile_fields.id'))
    .addColumn('value', 'text', notNull)
    .addPrimaryKeyConstraint('user_profile_field_values_pk', ['user_id', 'field_id'])
    .execute();
  await db.schema
    .createIndex('user_profile_field_values_field_idx')
    .on('user_profile_field_values')
    .column('field_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const t of [
    'user_profile_field_values',
    'profile_fields',
    'policy_acceptances',
    'policy_version_texts',
    'policy_versions',
    'policies',
    'permission_profile_entries',
    'permission_profiles',
    'group_permissions',
    'group_join_requests',
    'group_moderators',
    'group_members',
    'user_recovery_codes',
    'user_totp',
    'auth_attempts',
    'login_challenges',
    'sessions',
    'user_tokens',
    'user_notes',
    'user_name_history',
    'user_profiles',
    'users',
    'member_groups',
  ]) {
    await db.schema.dropTable(t).execute();
  }
}
