import type { Kysely } from 'kysely';
import { flag, textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('ticket_categories').addColumn('auto_assign', 'text', textDefault('none')).execute();
  await db.schema.alterTable('ticket_categories').addColumn('auto_assign_user_id', 'integer').execute();
  await db.schema.alterTable('ticket_categories').addColumn('auto_assign_online', 'smallint', flag(0)).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const col of ['auto_assign_online', 'auto_assign_user_id', 'auto_assign']) await db.schema.alterTable('ticket_categories').dropColumn(col).execute();
}
