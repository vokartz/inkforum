import type { Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, ref, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  await h
    .table('forum_categories')
    .addColumn('name', 'text', notNull)
    .addColumn('description', 'text', textDefault(''))
    .addColumn('is_collapsible', 'smallint', flag(1))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();

  await h
    .table('boards')
    .addColumn('category_id', 'integer', ref('forum_categories.id'))
    .addColumn('parent_id', 'integer', ref('boards.id', 'set null', false))
    .addColumn('type', 'text', textDefault('forum'))
    .addColumn('name', 'text', notNull)
    .addColumn('slug', 'text', notNull)
    .addColumn('description', 'text', textDefault(''))
    .addColumn('icon_kind', 'text', textDefault('lucide'))
    .addColumn('icon_name', 'text')
    .addColumn('icon_color', 'text')
    .addColumn('icon_file_id', 'integer', ref('files.id', 'set null', false))
    .addColumn('redirect_url', 'text')
    .addColumn('redirect_clicks', 'integer', intDefault(0))
    .addColumn('permission_profile_id', 'integer', ref('permission_profiles.id', 'set null', false))
    .addColumn('count_posts', 'smallint', flag(1))
    .addColumn('require_approval_topics', 'smallint', flag(0))
    .addColumn('require_approval_posts', 'smallint', flag(0))
    .addColumn('is_hidden', 'smallint', flag(0))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('topic_count', 'integer', intDefault(0))
    .addColumn('post_count', 'integer', intDefault(0))
    .addColumn('last_post_id', 'bigint')
    .addColumn('last_post_at', 'bigint')
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('boards_category_idx').on('boards').columns(['category_id', 'sort_order']).execute();

  await h
    .table('board_moderators')
    .addColumn('board_id', 'integer', ref('boards.id'))
    .addColumn('user_id', 'integer', ref('users.id', 'cascade', false))
    .addColumn('group_id', 'integer', ref('member_groups.id', 'cascade', false))
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('board_moderators_board_idx').on('board_moderators').column('board_id').execute();
  await db.schema.createIndex('board_moderators_user_idx').on('board_moderators').column('user_id').execute();

  await h
    .table('topic_prefixes')
    .addColumn('name', 'text', notNull)
    .addColumn('color', 'text')
    .addColumn('board_ids_json', 'text')
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .execute();

  await h
    .table('topics', { big: true })
    .addColumn('board_id', 'integer', ref('boards.id'))
    .addColumn('title', 'text', notNull)
    .addColumn('slug', 'text', notNull)
    .addColumn('prefix_id', 'integer', ref('topic_prefixes.id', 'set null', false))
    .addColumn('user_id', 'integer', ref('users.id', 'set null', false))
    .addColumn('author_name', 'text', notNull)
    .addColumn('first_post_id', 'bigint')
    .addColumn('last_post_id', 'bigint')
    .addColumn('last_post_at', 'bigint', notNull)
    .addColumn('last_poster_id', 'integer')
    .addColumn('last_poster_name', 'text')
    .addColumn('reply_count', 'integer', intDefault(0))
    .addColumn('view_count', 'integer', intDefault(0))
    .addColumn('is_pinned', 'smallint', flag(0))
    .addColumn('is_locked', 'smallint', flag(0))
    .addColumn('is_featured', 'smallint', flag(0))
    .addColumn('is_approved', 'smallint', flag(1))
    .addColumn('moved_to_topic_id', 'bigint')
    .addColumn('deleted_at', 'bigint')
    .addColumn('deleted_by', 'integer')
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('topics_board_idx').on('topics').columns(['board_id', 'is_pinned', 'last_post_at']).execute();
  await db.schema.createIndex('topics_user_idx').on('topics').columns(['user_id', 'created_at']).execute();
  await db.schema.createIndex('topics_last_post_idx').on('topics').column('last_post_at').execute();

  await h
    .table('posts', { big: true })
    .addColumn('topic_id', 'bigint', ref('topics.id'))
    .addColumn('board_id', 'integer', notNull)
    .addColumn('user_id', 'integer', ref('users.id', 'set null', false))
    .addColumn('author_name', 'text', notNull)
    .addColumn('body_bbcode', 'text', notNull)
    .addColumn('body_html', 'text', notNull)
    .addColumn('render_version', 'integer', intDefault(1))
    .addColumn('ip', 'text')
    .addColumn('is_approved', 'smallint', flag(1))
    .addColumn('deleted_at', 'bigint')
    .addColumn('deleted_by', 'integer')
    .addColumn('edited_at', 'bigint')
    .addColumn('edited_by', 'integer')
    .addColumn('edit_reason', 'text')
    .addColumn('edit_count', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('posts_topic_idx').on('posts').columns(['topic_id', 'id']).execute();
  await db.schema.createIndex('posts_user_idx').on('posts').columns(['user_id', 'id']).execute();
  await db.schema.createIndex('posts_board_idx').on('posts').columns(['board_id', 'id']).execute();

  await h
    .table('post_revisions', { big: true })
    .addColumn('post_id', 'bigint', ref('posts.id'))
    .addColumn('user_id', 'integer')
    .addColumn('body_bbcode', 'text', notNull)
    .addColumn('reason', 'text')
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('post_revisions_post_idx').on('post_revisions').columns(['post_id', 'id']).execute();

  await db.schema
    .createTable('topic_reads')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('topic_id', 'bigint', ref('topics.id'))
    .addColumn('last_read_post_id', 'bigint', notNull)
    .addColumn('read_at', 'bigint', notNull)
    .addPrimaryKeyConstraint('topic_reads_pk', ['user_id', 'topic_id'])
    .execute();

  await db.schema
    .createTable('board_reads')
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('board_id', 'integer', ref('boards.id'))
    .addColumn('read_at', 'bigint', notNull)
    .addPrimaryKeyConstraint('board_reads_pk', ['user_id', 'board_id'])
    .execute();

  await db.schema.alterTable('users').addColumn('mark_read_at', 'bigint').execute();
  await db.schema.alterTable('permission_profiles').addColumn('key', 'text').execute();
  await db.schema.alterTable('permission_profiles').addColumn('description', 'text', textDefault('')).execute();
  await db.schema.createIndex('permission_profiles_key_uq').on('permission_profiles').column('key').unique().execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('permission_profiles_key_uq').execute();
  await db.schema.alterTable('permission_profiles').dropColumn('description').execute();
  await db.schema.alterTable('permission_profiles').dropColumn('key').execute();
  await db.schema.alterTable('users').dropColumn('mark_read_at').execute();
  for (const t of [
    'board_reads',
    'topic_reads',
    'post_revisions',
    'posts',
    'topics',
    'topic_prefixes',
    'board_moderators',
    'boards',
    'forum_categories',
  ]) {
    await db.schema.dropTable(t).execute();
  }
}
