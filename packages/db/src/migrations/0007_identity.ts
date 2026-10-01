import type { Kysely } from 'kysely';

/**
 * İkon seti lucide → Phosphor. Ad dönüşümü (ör. messages-square → chats-circle) sunucu açılışında,
 * ikon kataloğunu bilen koddan bir kez yapılır; burada yalnızca tür adı güncellenir.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.updateTable('boards').set({ icon_kind: 'icon' }).where('icon_kind', '=', 'lucide').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.updateTable('boards').set({ icon_kind: 'lucide' }).where('icon_kind', '=', 'icon').execute();
}
