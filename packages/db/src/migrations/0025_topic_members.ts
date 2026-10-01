import type { Kysely } from 'kysely';
import { notNull, ref } from './_helpers.js';

/** Gizli konulara yetkililerin eklediği üyeler (konuyu görür ve bölüm yetkisi varsa yanıtlar). */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('topic_members')
    .addColumn('topic_id', 'bigint', ref('topics.id'))
    .addColumn('user_id', 'integer', ref('users.id'))
    .addColumn('added_by', 'integer', ref('users.id', 'set null', false))
    .addColumn('created_at', 'bigint', notNull)
    .addPrimaryKeyConstraint('topic_members_pk', ['topic_id', 'user_id'])
    .execute();
  await db.schema.createIndex('topic_members_user_idx').on('topic_members').columns(['user_id', 'topic_id']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('topic_members').execute();
}
