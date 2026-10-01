import type { Kysely } from 'kysely';
import { flag, helpers, intDefault, notNull, textDefault } from './_helpers.js';

/** Destek talepleri: kategoriler, talepler ve mesajlar. */
export async function up(db: Kysely<any>): Promise<void> {
  const h = helpers(db);

  await h
    .table('ticket_categories')
    .addColumn('name', 'text', notNull)
    .addColumn('description', 'text', textDefault(''))
    .addColumn('icon', 'text')
    .addColumn('color', 'text')
    .addColumn('handler_group_ids_json', 'text', textDefault('[]'))
    .addColumn('is_active', 'smallint', flag(1))
    .addColumn('sort_order', 'integer', intDefault(0))
    .addColumn('default_priority', 'text', textDefault('normal'))
    .addColumn('intro', 'text', textDefault(''))
    .addColumn('intro_html', 'text', textDefault(''))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .execute();

  await h
    .table('tickets')
    .addColumn('category_id', 'integer', notNull)
    .addColumn('user_id', 'integer', notNull)
    .addColumn('subject', 'text', notNull)
    .addColumn('status', 'text', textDefault('open'))
    .addColumn('priority', 'text', textDefault('normal'))
    .addColumn('assignee_id', 'integer')
    .addColumn('message_count', 'integer', intDefault(0))
    .addColumn('last_reply_at', 'bigint', notNull)
    .addColumn('last_reply_by_staff', 'smallint', flag(0))
    .addColumn('created_at', 'bigint', notNull)
    .addColumn('updated_at', 'bigint', notNull)
    .addColumn('closed_at', 'bigint')
    .execute();
  await db.schema.createIndex('tickets_user_idx').on('tickets').columns(['user_id', 'last_reply_at']).execute();
  await db.schema.createIndex('tickets_queue_idx').on('tickets').columns(['category_id', 'status', 'last_reply_at']).execute();

  await h
    .table('ticket_messages')
    .addColumn('ticket_id', 'integer', notNull)
    .addColumn('user_id', 'integer')
    .addColumn('body', 'text', notNull)
    .addColumn('body_html', 'text', textDefault(''))
    .addColumn('is_internal', 'smallint', flag(0))
    .addColumn('is_staff', 'smallint', flag(0))
    .addColumn('created_at', 'bigint', notNull)
    .execute();
  await db.schema.createIndex('ticket_messages_ticket_idx').on('ticket_messages').columns(['ticket_id', 'created_at']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('ticket_messages').execute();
  await db.schema.dropTable('tickets').execute();
  await db.schema.dropTable('ticket_categories').execute();
}
