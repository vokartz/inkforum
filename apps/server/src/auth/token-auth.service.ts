import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock, MINUTE } from '../common/clock.js';
import { fromJson } from '../database/json.js';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface ResolvedToken {
  user: Row<'users'>;
  kind: 'oauth' | 'apikey';
  id: number;
  clientId: number | null;
  scopes: string[];
}

/**
 * `Authorization: Bearer` belirteçlerini çözer:
 *  - `fat_…` OAuth erişim belirteci (uygulama + üye + izinler)
 *  - `fk_…`  API anahtarı (sunucudan sunucuya; bağlı olduğu hesap adına)
 * Belirteçler veritabanında yalnızca SHA-256 özetiyle tutulur.
 */
@Injectable()
export class TokenAuthService {
  /** Son kullanım zamanını dakikada bir yaz (her istekte değil). */
  private readonly touched = new Map<string, number>();

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  static parse(header: string | undefined): string | null {
    if (!header) return null;
    const m = /^Bearer\s+([A-Za-z0-9_\-.~+/]{16,200}=*)$/i.exec(header.trim());
    return m ? m[1]! : null;
  }

  private async activeUser(userId: number | null): Promise<Row<'users'> | null> {
    if (!userId) return null;
    const user = await this.db.q.selectFrom('users').selectAll().where('id', '=', userId).where('deleted_at', 'is', null).executeTakeFirst();
    return user && user.status === 'active' ? user : null;
  }

  private shouldTouch(key: string): boolean {
    const now = this.clock.now();
    const last = this.touched.get(key) ?? 0;
    if (now - last < MINUTE) return false;
    this.touched.set(key, now);
    if (this.touched.size > 5000) this.touched.clear();
    return true;
  }

  async resolve(token: string, ip: string | null): Promise<ResolvedToken | null> {
    const now = this.clock.now();
    const hash = sha256(token);
    if (token.startsWith('fat_')) {
      const row = await this.db.q
        .selectFrom('oauth_tokens as t')
        .innerJoin('oauth_clients as c', 'c.id', 't.client_id')
        .select(['t.id', 't.user_id', 't.client_id', 't.scopes_json', 't.expires_at', 't.revoked_at', 'c.is_enabled'])
        .where('t.access_hash', '=', hash)
        .executeTakeFirst();
      if (!row || row.revoked_at || row.expires_at <= now || row.is_enabled !== 1) return null;
      const user = await this.activeUser(row.user_id);
      if (!user) return null;
      if (this.shouldTouch(`t${row.id}`)) await this.db.q.updateTable('oauth_tokens').set({ last_used_at: now }).where('id', '=', row.id).execute();
      return { user, kind: 'oauth', id: row.id, clientId: row.client_id, scopes: fromJson<string[]>(row.scopes_json, []) };
    }
    if (token.startsWith('fk_')) {
      const row = await this.db.q.selectFrom('api_keys').selectAll().where('key_hash', '=', hash).executeTakeFirst();
      if (!row || row.revoked_at || (row.expires_at && row.expires_at <= now)) return null;
      const user = await this.activeUser(row.user_id);
      if (!user) return null;
      if (this.shouldTouch(`k${row.id}`)) await this.db.q.updateTable('api_keys').set({ last_used_at: now, last_ip: ip }).where('id', '=', row.id).execute();
      return { user, kind: 'apikey', id: row.id, clientId: null, scopes: fromJson<string[]>(row.scopes_json, []) };
    }
    return null;
  }
}

/**
 * Belirteçle gelen istekte gereken izin. `deny`: belirteçle hiç kullanılamaz
 * (hesap ayarları, oturum işlemleri ve OAuth akışının kendisi).
 */
export function requiredScope(method: string, path: string): string {
  // Yol büyük/küçük harf ve sondaki eğik çizgiden bağımsız eşleşir (/api/Messages/ ≡ /api/messages)
  const p = path.toLowerCase().replace(/\/+$/, '').replace(/^\/api(?=\/|$)/, '') || '/';
  const read = method === 'GET' || method === 'HEAD';
  if (p === '/oauth/userinfo') return 'profile';
  if (p.startsWith('/oauth/') || p.startsWith('/auth/')) return 'deny';
  if (p === '/admin' || p.startsWith('/admin/')) return 'admin';
  // Moderasyon işlemleri üçüncü taraf uygulamalara verilmez (yalnızca "admin" kapsamlı API anahtarı)
  if (p === '/mod' || p.startsWith('/mod/')) return 'admin';
  if (p.startsWith('/messages') || p === '/me/counters') return 'messages';
  if (p === '/me' || p.startsWith('/me/')) return read ? 'profile' : 'deny';
  return read ? 'read' : 'write';
}
