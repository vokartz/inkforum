import type { Db } from '../database/db.service.js';

export async function revokeUserTokens(db: Db, userId: number, now: number): Promise<void> {
  await db.q.updateTable('oauth_tokens').set({ revoked_at: now }).where('user_id', '=', userId).where('revoked_at', 'is', null).execute();
  await db.q.updateTable('api_keys').set({ revoked_at: now }).where('user_id', '=', userId).where('revoked_at', 'is', null).execute();
}
