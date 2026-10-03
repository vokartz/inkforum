import type { Kysely } from 'kysely';
import { textDefault } from './_helpers.js';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('nav_items').addColumn('style', 'text', textDefault('link')).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('nav_items').dropColumn('style').execute();
}
