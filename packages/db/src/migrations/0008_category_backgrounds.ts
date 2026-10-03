import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('forum_categories').addColumn('bg_file_id', 'integer').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('forum_categories').dropColumn('bg_file_id').execute();
}
