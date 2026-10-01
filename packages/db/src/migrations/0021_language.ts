import type { Kysely } from 'kysely';

/**
 * Çok dilli arayüz: users.locale artık üyenin seçtiği dil ('' = otomatik: tarayıcı dili / forum varsayılanı).
 * Önceden herkes 'tr' ile kaydediliyordu; bu bir tercih değil varsayılandı, bu yüzden otomatiğe çevrilir.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.updateTable('users').set({ locale: '' }).where('locale', '=', 'tr').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.updateTable('users').set({ locale: 'tr' }).where('locale', '=', '').execute();
}
