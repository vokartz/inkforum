import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.updateTable('boards').set({ icon_kind: 'icon' }).where('icon_kind', '=', 'lucide').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.updateTable('boards').set({ icon_kind: 'lucide' }).where('icon_kind', '=', 'icon').execute();
}
