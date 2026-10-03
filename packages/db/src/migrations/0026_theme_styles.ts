import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db
    .updateTable('settings')
    .set({ value_json: JSON.stringify('community') })
    .where('key', '=', 'appearance.themeStyle')
    .where('value_json', '=', JSON.stringify('classic'))
    .execute();
}

export async function down(): Promise<void> {
}
