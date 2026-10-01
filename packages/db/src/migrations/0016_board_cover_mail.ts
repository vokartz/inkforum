import type { Kysely } from 'kysely';
import { notNull, textDefault } from './_helpers.js';

/** Bölüm kapak fotoğrafı ve ayrıntılı açıklama; yönetimden düzenlenebilir e-posta şablonları. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('boards').addColumn('cover_file_id', 'integer').execute();
  await db.schema.alterTable('boards').addColumn('about', 'text', textDefault('')).execute();
  await db.schema.alterTable('boards').addColumn('about_html', 'text', textDefault('')).execute();

  await db.schema
    .createTable('mail_templates')
    .addColumn('key', 'text', (c) => c.primaryKey())
    .addColumn('subject', 'text', notNull)
    .addColumn('body', 'text', notNull)
    .addColumn('updated_by', 'integer')
    .addColumn('updated_at', 'bigint', notNull)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('mail_templates').execute();
  await db.schema.alterTable('boards').dropColumn('about_html').execute();
  await db.schema.alterTable('boards').dropColumn('about').execute();
  await db.schema.alterTable('boards').dropColumn('cover_file_id').execute();
}
