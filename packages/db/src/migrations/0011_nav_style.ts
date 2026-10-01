import type { Kysely } from 'kysely';
import { textDefault } from './_helpers.js';

/** Menü öğesi görünümü: bağlantı ya da vurgulu buton (ör. "UCP"). */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('nav_items').addColumn('style', 'text', textDefault('link')).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('nav_items').dropColumn('style').execute();
}
