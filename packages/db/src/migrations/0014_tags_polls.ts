import type { Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, ref, textDefault } from './_helpers.js';

/** Konu etiketleri, anketler ve konu takibi. */
export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  await h
    .table('tags')
    .addColumn('name', 'text', notNull)
    .addColumn('slug', 'text', notNull)
    .addColumn('color', 'text')
    .addColumn('topic_count', 'integer', intDefault(0))
    .addColumn('is_official', 'smallint', flag(0))
    .addColumn('created_by', 'integer', ref('users.id', 'set null', false))
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('tags_slug_uq').on('tags').column('slug').unique().execute();

  await db.schema
    .createTable('topic_tags')
    .addColumn('topic_id', 'bigint', ref('topics.id'))
    .addColumn('tag_id', 'integer', ref('tags.id'))
    .addPrimaryKeyConstraint('topic_tags_pk', ['topic_id', 'tag_id'])
    .execute();
  await db.schema.createIndex('topic_tags_tag_idx').on('topic_tags').columns(['tag_id', 'topic_id']).execute();

  await h
    .table('polls')
    .addColumn('topic_id', 'bigint', ref('topics.id'))
    .addColumn('question', 'text', notNull)
    .addColumn('max_choices', 'integer', intDefault(1))
    .addColumn('allow_change', 'smallint', flag(1))
    .addColumn('public_votes', 'smallint', flag(0))
    .addColumn('show_results', 'text', textDefault('always'))
    .addColumn('closes_at', 'bigint')
    .addColumn('closed_at', 'bigint')
    .addColumn('voter_count', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('polls_topic_uq').on('polls').column('topic_id').unique().execute();

  await h
    .table('poll_options')
    .addColumn('poll_id', 'integer', ref('polls.id'))
    .addColumn('label', 'text', notNull)
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('vote_count', 'integer', intDefault(0))
    .execute();
  await db.schema.createIndex('poll_options_poll_idx').on('poll_options').columns(['poll_id', 'sort_order']).execute();

  await db.schema
    .createTable('poll_votes')
    .addColumn('poll_id', 'integer', ref('polls.id'))
    .addColumn('option_id', 'integer', ref('poll_options.id'))
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('created_at', 'bigint', notNull)
    .addPrimaryKeyConstraint('poll_votes_pk', ['poll_id', 'user_id', 'option_id'])
    .execute();
  await db.schema.createIndex('poll_votes_option_idx').on('poll_votes').columns(['option_id', 'created_at']).execute();

  await db.schema
    .createTable('topic_subscriptions')
    .addColumn('topic_id', 'bigint', ref('topics.id'))
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('created_at', 'bigint', notNull)
    .addPrimaryKeyConstraint('topic_subscriptions_pk', ['topic_id', 'user_id'])
    .execute();
  await db.schema.createIndex('topic_subscriptions_user_idx').on('topic_subscriptions').columns(['user_id', 'created_at']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('topic_subscriptions').execute();
  await db.schema.dropTable('poll_votes').execute();
  await db.schema.dropTable('poll_options').execute();
  await db.schema.dropTable('polls').execute();
  await db.schema.dropTable('topic_tags').execute();
  await db.schema.dropTable('tags').execute();
}
