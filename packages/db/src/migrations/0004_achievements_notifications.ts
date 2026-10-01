import type { Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, ref, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  await h
    .table('achievement_categories')
    .addColumn('name', 'text', notNull)
    .addColumn('description', 'text', textDefault(''))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .execute();

  await h
    .table('achievements')
    .addColumn('key', 'text', (c) => c.notNull().unique())
    .addColumn('category_id', 'integer', ref('achievement_categories.id', 'set null', false))
    .addColumn('name', 'text', notNull)
    .addColumn('description', 'text', textDefault(''))
    .addColumn('icon_file_id', 'integer', ref('files.id', 'set null', false))
    .addColumn('tier', 'integer', intDefault(1))
    .addColumn('series_key', 'text')
    .addColumn('points', 'integer', intDefault(10))
    .addColumn('is_hidden', 'smallint', flag(0))
    .addColumn('is_active', 'smallint', flag(1))
    .addColumn('criteria_type', 'text')
    .addColumn('criteria_json', 'text')
    .addColumn('awarded_count', 'integer', intDefault(0))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
  await db.schema
    .createIndex('achievements_criteria_idx')
    .on('achievements')
    .columns(['criteria_type', 'is_active'])
    .execute();

  await h
    .table('user_achievements')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('achievement_id', 'integer', ref('achievements.id'))
    .addColumn('source', 'text', notNull)
    .addColumn('awarded_by', 'integer')
    .addColumn('reason', 'text')
    .addColumn('is_featured', 'smallint', flag(0))
    .addColumn('awarded_at', 'bigint', notNull)
    .addUniqueConstraint('user_achievements_uq', ['user_id', 'achievement_id'])
    .execute();
  await db.schema
    .createIndex('user_achievements_achievement_idx')
    .on('user_achievements')
    .column('achievement_id')
    .execute();
  await db.schema
    .createIndex('user_achievements_user_idx')
    .on('user_achievements')
    .columns(['user_id', 'awarded_at'])
    .execute();

  await h
    .table('notifications', { big: true })
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('type', 'text', notNull)
    .addColumn('actor_id', 'integer')
    .addColumn('data_json', 'text', notNull)
    .addColumn('read_at', 'bigint')
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('notifications_user_idx').on('notifications').columns(['user_id', 'created_at']).execute();
  await db.schema.createIndex('notifications_unread_idx').on('notifications').columns(['user_id', 'read_at']).execute();

  await db.schema
    .createTable('notification_preferences')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('type', 'text', notNull)
    .addColumn('channel', 'text', notNull)
    .addColumn('enabled', 'smallint', flag(1))
    .addPrimaryKeyConstraint('notification_preferences_pk', ['user_id', 'type', 'channel'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const t of [
    'notification_preferences',
    'notifications',
    'user_achievements',
    'achievements',
    'achievement_categories',
  ]) {
    await db.schema.dropTable(t).execute();
  }
}
