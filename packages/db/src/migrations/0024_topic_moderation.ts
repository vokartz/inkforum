import type { Kysely } from 'kysely';
import { flag, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('topics').addColumn('is_hidden', 'smallint', flag(0)).execute();
  await db.schema.alterTable('boards').addColumn('private_topics', 'smallint', flag(0)).execute();
  await db.schema.alterTable('boards').addColumn('topic_template_json', 'text', textDefault('')).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('boards').dropColumn('topic_template_json').execute();
  await db.schema.alterTable('boards').dropColumn('private_topics').execute();
  await db.schema.alterTable('topics').dropColumn('is_hidden').execute();
}
