import type { Kysely } from 'kysely';

/**
 * Klasik (SMF) tema kaldırıldı: bu temayı kullanan forumlar en yakın düzen olan "Topluluk" temasına geçer.
 * Yalnızca ayar değeri değişir; başka veri silinmez.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db
    .updateTable('settings')
    .set({ value_json: JSON.stringify('community') })
    .where('key', '=', 'appearance.themeStyle')
    .where('value_json', '=', JSON.stringify('classic'))
    .execute();
}

export async function down(): Promise<void> {
  /* geri alınacak veri yok */
}
