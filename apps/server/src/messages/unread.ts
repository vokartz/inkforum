import type { Db } from '../database/db.service.js';

/** Üyenin okunmamış özel mesaj konuşması sayısı (çekirdek modül de kullanır). */
export async function unreadConversationCount(db: Db, userId: number): Promise<number> {
  const row = await db.q
    .selectFrom('conversation_participants as p')
    .innerJoin('conversations as c', 'c.id', 'p.conversation_id')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('p.user_id', '=', userId)
    .where('p.left_at', 'is', null)
    .whereRef('c.last_message_id', '>', 'p.last_read_message_id')
    .where('c.last_message_user_id', '!=', userId)
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}
