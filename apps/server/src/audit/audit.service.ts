import { Injectable } from '@nestjs/common';
import type { AuditLogType } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { toJson } from '../database/json.js';

export interface AuditEntry {
  type: AuditLogType;
  action: string;
  actorId?: number | null;
  targetType?: string | null;
  targetId?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  data?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.db.q
      .insertInto('audit_log')
      .values({
        log_type: entry.type,
        action: entry.action,
        actor_id: entry.actorId ?? null,
        target_type: entry.targetType ?? null,
        target_id: entry.targetId ?? null,
        ip: entry.ip ?? null,
        user_agent: entry.userAgent ?? null,
        data_json: entry.data ? toJson(entry.data) : null,
        created_at: this.clock.now(),
      })
      .execute();
  }
}
