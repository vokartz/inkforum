import type { Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, ref } from './_helpers.js';

/**
 * Tepkiler (beğeni/emoji), itibar puanı ve konu görüntüleyen üyelerin kaydı.
 */
export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  // Yönetimden düzenlenen tepki seti
  await h
    .table('reactions')
    .addColumn('key', 'text', notNull)
    .addColumn('label', 'text', notNull)
    .addColumn('emoji', 'text', notNull)
    .addColumn('points', 'integer', intDefault(1))
    .addColumn('is_enabled', 'smallint', flag(1))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('reactions_key_uq').on('reactions').column('key').unique().execute();

  // Mesaj başına üye başına tek tepki
  await db.schema
    .createTable('post_reactions')
    .addColumn('post_id', 'bigint', ref('posts.id'))
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('reaction_id', 'integer', ref('reactions.id'))
    .addColumn('post_author_id', 'integer')
    .addColumn('created_at', 'bigint', notNull)
    .addPrimaryKeyConstraint('post_reactions_pk', ['post_id', 'user_id'])
    .execute();
  await db.schema.createIndex('post_reactions_author_idx').on('post_reactions').columns(['post_author_id', 'created_at']).execute();
  await db.schema.createIndex('post_reactions_user_idx').on('post_reactions').columns(['user_id', 'created_at']).execute();

  // İtibar: alınan tepkilerin puan toplamı
  await db.schema.alterTable('users').addColumn('reputation', 'integer', intDefault(0)).execute();

  // Konuyu görüntüleyen üyeler (kim, ilk/son ne zaman, kaç kez)
  await db.schema
    .createTable('topic_viewers')
    .addColumn('topic_id', 'bigint', ref('topics.id'))
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('views', 'integer', intDefault(1))
    .addColumn('first_at', 'bigint', notNull)
    .addColumn('last_at', 'bigint', notNull)
    .addPrimaryKeyConstraint('topic_viewers_pk', ['topic_id', 'user_id'])
    .execute();
  await db.schema.createIndex('topic_viewers_user_idx').on('topic_viewers').columns(['user_id', 'last_at']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('topic_viewers').execute();
  await db.schema.alterTable('users').dropColumn('reputation').execute();
  await db.schema.dropTable('post_reactions').execute();
  await db.schema.dropTable('reactions').execute();
}
