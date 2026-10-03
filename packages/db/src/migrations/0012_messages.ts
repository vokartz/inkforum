import type { Kysely } from 'kysely';
import { helpers, intDefault, notNull, ref } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  await h
    .table('conversations', { big: true })
    .addColumn('title', 'text')
    .addColumn('created_by', 'integer', ref('users.id', 'set null', false))
    .addColumn('last_message_id', 'bigint')
    .addColumn('last_message_at', 'bigint', notNull)
    .addColumn('last_message_user_id', 'integer')
    .addColumn('message_count', 'integer', intDefault(0))
    .addColumn('created_at', 'bigint', notNull)
    .execute();

  await db.schema
    .createTable('conversation_participants')
    .addColumn('conversation_id', 'bigint', ref('conversations.id'))
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('last_read_message_id', 'bigint', intDefault(0))
    .addColumn('joined_at', 'bigint', notNull)
    .addColumn('left_at', 'bigint')
    .addPrimaryKeyConstraint('conversation_participants_pk', ['conversation_id', 'user_id'])
    .execute();
  await db.schema.createIndex('conversation_participants_user_idx').on('conversation_participants').columns(['user_id', 'left_at']).execute();

  await h
    .table('conversation_messages', { big: true })
    .addColumn('conversation_id', 'bigint', ref('conversations.id'))
    .addColumn('user_id', 'integer', ref('users.id', 'set null', false))
    .addColumn('author_name', 'text', notNull)
    .addColumn('body_bbcode', 'text', notNull)
    .addColumn('body_html', 'text', notNull)
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('edited_at', 'bigint')
    .addColumn('deleted_at', 'bigint')
    .execute();
  await db.schema.createIndex('conversation_messages_conv_idx').on('conversation_messages').columns(['conversation_id', 'id']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('conversation_messages').execute();
  await db.schema.dropTable('conversation_participants').execute();
  await db.schema.dropTable('conversations').execute();
}
