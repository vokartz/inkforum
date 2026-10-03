import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@forum/shared';
import type { Row, UserTokenType } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { CryptoService } from '../security/crypto.service.js';
import { Errors } from '../common/errors.js';
import { fromJson, toJson } from '../database/json.js';

@Injectable()
export class TokensService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly crypto: CryptoService,
  ) {}

  async create(userId: number, type: UserTokenType, ttlMs: number, ip: string | null, payload?: unknown): Promise<string> {
    const token = this.crypto.token(32);
    const now = this.clock.now();
    await this.invalidate(userId, type);
    await this.db.q
      .insertInto('user_tokens')
      .values({
        user_id: userId,
        type,
        token_hash: this.crypto.sha256(token),
        payload_json: payload === undefined ? null : toJson(payload),
        expires_at: now + ttlMs,
        created_ip: ip,
        created_at: now,
      })
      .execute();
    return token;
  }

  async consume<P = unknown>(type: UserTokenType, token: string): Promise<{ row: Row<'user_tokens'>; payload: P | null }> {
    const now = this.clock.now();
    const row = await this.db.q
      .selectFrom('user_tokens')
      .selectAll()
      .where('token_hash', '=', this.crypto.sha256(token))
      .where('type', '=', type)
      .executeTakeFirst();
    if (!row || row.used_at || row.expires_at <= now) {
      throw Errors.code(ErrorCode.TOKEN_INVALID, 'Bu bağlantı geçersiz veya süresi dolmuş.', 400);
    }
    const r = await this.db.q
      .updateTable('user_tokens')
      .set({ used_at: now })
      .where('id', '=', row.id)
      .where('used_at', 'is', null)
      .executeTakeFirst();
    if (Number(r.numUpdatedRows) !== 1) throw Errors.code(ErrorCode.TOKEN_INVALID, 'Bu bağlantı zaten kullanılmış.', 400);
    return { row, payload: fromJson<P | null>(row.payload_json, null) };
  }

  async peek(type: UserTokenType, token: string): Promise<Row<'user_tokens'> | null> {
    const row = await this.db.q
      .selectFrom('user_tokens')
      .selectAll()
      .where('token_hash', '=', this.crypto.sha256(token))
      .where('type', '=', type)
      .executeTakeFirst();
    if (!row || row.used_at || row.expires_at <= this.clock.now()) return null;
    return row;
  }

  async invalidate(userId: number, type: UserTokenType): Promise<void> {
    await this.db.q
      .updateTable('user_tokens')
      .set({ used_at: this.clock.now() })
      .where('user_id', '=', userId)
      .where('type', '=', type)
      .where('used_at', 'is', null)
      .execute();
  }

  async cleanup(): Promise<void> {
    await this.db.q.deleteFrom('user_tokens').where('expires_at', '<', this.clock.now() - 7 * 86_400_000).execute();
  }
}
