import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { bbcodeExcerpt, WEBHOOK_EVENTS, type AdminWebhook, type WebhookDelivery, type WebhookEvent } from '@forum/shared';
import type { Row } from '@forum/db';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { Errors } from '../common/errors.js';
import { fromJson, toJson } from '../database/json.js';
import { EventsService, type AppEvents } from '../events/events.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { GroupCacheService } from '../groups/group-cache.service.js';
import { CONFIG, type AppConfig } from '../config/config.js';
import { safeFetch } from '../security/safe-fetch.js';
import type { RequestViewer } from '../common/request-context.js';

const JOB = 'webhook.deliver';
const TIMEOUT_MS = 10_000;
type HookRow = Row<'webhooks'>;

/** İmza: `t=<unix saniye>,v1=<hex HMAC-SHA256(gizli anahtar, "<t>.<gövde>")>` */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/**
 * Webhook'lar: forumdaki olaylar (yeni konu, yanıt, üye kaydı, grup değişimi, yasak) yöneticinin
 * girdiği adreslere imzalı JSON olarak gönderilir. Her gönderim kaydedilir, başarısızlar tekrar denenir.
 */
@Injectable()
export class WebhooksService implements OnModuleInit {
  private readonly logger = new Logger('Webhooks');

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly events: EventsService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly groups: GroupCacheService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.jobs.register<{ deliveryId: number }>(JOB, async (p) => {
      await this.deliver(p.deliveryId, true);
    });
    for (const event of WEBHOOK_EVENTS) {
      this.events.on(event as keyof AppEvents, (payload) => this.fire(event, payload as unknown as Record<string, number | null>));
    }
  }

  // ---------- Olay verisi ----------

  private async userData(userId: number) {
    const u = await this.db.q.selectFrom('users').select(['id', 'username', 'display_name', 'email', 'email_verified_at', 'status', 'registered_at']).where('id', '=', userId).executeTakeFirst();
    if (!u) return null;
    const summary = (await this.users.summaries([userId])).get(userId);
    const groupIds = (await this.db.q.selectFrom('group_members').select('group_id').where('user_id', '=', userId).execute()).map((r) => r.group_id);
    const map = await this.groups.map();
    return {
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      email: u.email,
      emailVerified: !!u.email_verified_at,
      status: u.status,
      registeredAt: u.registered_at,
      url: `${this.config.appUrl}/u/${u.id}`,
      primaryGroup: summary?.primaryGroup ? { id: summary.primaryGroup.id, name: summary.primaryGroup.name } : null,
      groups: [...new Set([...(summary?.primaryGroup ? [summary.primaryGroup.id] : []), ...groupIds])].map((id) => ({ id, name: map.get(id)?.name ?? '' })),
    };
  }

  private async postData(topicId: number, postId: number) {
    const row = await this.db.q
      .selectFrom('posts as p')
      .innerJoin('topics as t', 't.id', 'p.topic_id')
      .innerJoin('boards as b', 'b.id', 't.board_id')
      .select(['p.id as postId', 'p.body_bbcode', 'p.created_at', 'p.user_id', 'p.author_name', 't.id as topicId', 't.title', 't.slug', 'b.id as boardId', 'b.name as boardName'])
      .where('p.id', '=', postId)
      .where('t.id', '=', topicId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      topic: { id: row.topicId, title: row.title, url: `${this.config.appUrl}/t/${row.topicId}/${row.slug}` },
      post: { id: row.postId, url: `${this.config.appUrl}/p/${row.postId}`, excerpt: bbcodeExcerpt(row.body_bbcode, 280), createdAt: row.created_at },
      board: { id: row.boardId, name: row.boardName },
      author: row.user_id ? { id: row.user_id, username: (await this.users.summaries([row.user_id])).get(row.user_id)?.username ?? row.author_name, displayName: row.author_name } : null,
    };
  }

  private async buildData(event: WebhookEvent | 'webhook.ping', p: Record<string, number | null>): Promise<unknown> {
    switch (event) {
      case 'topic.created':
      case 'post.created':
        return this.postData(p.topicId!, p.postId!);
      case 'user.banned': {
        const ban = await this.db.q.selectFrom('bans').select(['id', 'reason_public', 'expires_at', 'cannot_access', 'cannot_post']).where('id', '=', p.banId!).executeTakeFirst();
        return { user: await this.userData(p.userId!), ban: ban ? { id: ban.id, reason: ban.reason_public, expiresAt: ban.expires_at, cannotAccess: ban.cannot_access === 1, cannotPost: ban.cannot_post === 1 } : null };
      }
      case 'webhook.ping':
        return { message: 'Webhook bağlantısı çalışıyor.' };
      default:
        return { user: await this.userData(p.userId!) };
    }
  }

  /** Olayı dinleyen webhook'lar için gönderim kaydı oluşturur ve kuyruğa ekler. */
  async fire(event: WebhookEvent, payload: Record<string, number | null>): Promise<void> {
    const hooks = (await this.db.q.selectFrom('webhooks').selectAll().where('is_enabled', '=', 1).execute()).filter((h) => fromJson<string[]>(h.events_json, []).includes(event));
    if (!hooks.length) return;
    const data = await this.buildData(event, payload);
    if (!data) return;
    for (const h of hooks) {
      const id = await this.record(h, event, data);
      await this.jobs.enqueue(JOB, { deliveryId: id }, { maxAttempts: 6 });
    }
  }

  private async record(h: HookRow, event: string, data: unknown): Promise<number> {
    const uuid = randomUUID();
    const now = this.clock.now();
    const payload = { id: uuid, event, createdAt: now, forum: this.config.appUrl, data };
    const row = await this.db.q
      .insertInto('webhook_deliveries')
      .values({ webhook_id: h.id, uuid, event, payload_json: toJson(payload), created_at: now })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** Tek gönderim. `retry` açıkken başarısızlıkta hata fırlatılır (iş kuyruğu tekrar dener). */
  async deliver(deliveryId: number, retry: boolean): Promise<WebhookDelivery | null> {
    const d = await this.db.q.selectFrom('webhook_deliveries').selectAll().where('id', '=', deliveryId).executeTakeFirst();
    if (!d) return null;
    const h = await this.db.q.selectFrom('webhooks').selectAll().where('id', '=', d.webhook_id).executeTakeFirst();
    if (!h) return null;
    const body = d.payload_json;
    const ts = Math.floor(this.clock.now() / 1000);
    const started = Date.now();
    let code: number | null = null;
    let text: string | null = null;
    let error: string | null = null;
    try {
      // Yerel ağ / bulut üst veri adreslerine gidilmez; yanıttan yalnızca kısa bir özet saklanır
      const res = await safeFetch(h.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(body)),
          'user-agent': 'Forum-Webhooks/1.0',
          'x-forum-event': d.event,
          'x-forum-delivery': d.uuid,
          'x-forum-signature': signWebhook(h.secret, ts, body),
        },
        body,
        timeoutMs: TIMEOUT_MS,
        maxBytes: 300,
        allowPrivate: this.config.allowPrivateWebhooks,
      });
      code = res.status;
      text = res.text.slice(0, 300);
    } catch (err) {
      error = err instanceof Error ? (err.name === 'TimeoutError' ? `Zaman aşımı (${TIMEOUT_MS / 1000} sn)` : err.message) : String(err);
    }
    const ok = code !== null && code >= 200 && code < 300;
    const now = this.clock.now();
    await this.db.q
      .updateTable('webhook_deliveries')
      .set((eb) => ({
        status: ok ? 'success' : 'failed',
        response_code: code,
        response_body: text,
        error,
        attempts: eb('attempts', '+', 1),
        duration_ms: Date.now() - started,
        delivered_at: now,
      }))
      .where('id', '=', d.id)
      .execute();
    await this.db.q
      .updateTable('webhooks')
      .set((eb) => ({ last_status: code ?? 0, last_delivery_at: now, failure_count: ok ? 0 : eb('failure_count', '+', 1) }))
      .where('id', '=', h.id)
      .execute();
    if (!ok && retry) throw new Error(`Webhook ${h.id} gönderilemedi: ${error ?? `HTTP ${code}`}`);
    return this.deliveryDto((await this.db.q.selectFrom('webhook_deliveries').selectAll().where('id', '=', d.id).executeTakeFirst())!);
  }

  // ---------- Yönetim ----------

  private toAdmin(h: HookRow): AdminWebhook {
    return {
      id: h.id,
      name: h.name,
      url: h.url,
      events: fromJson<WebhookEvent[]>(h.events_json, []),
      isEnabled: h.is_enabled === 1,
      failureCount: h.failure_count,
      lastStatus: h.last_status,
      lastDeliveryAt: h.last_delivery_at,
      secretHint: `${h.secret.slice(0, 10)}…`,
      createdAt: h.created_at,
    };
  }

  private deliveryDto(d: Row<'webhook_deliveries'>): WebhookDelivery {
    return {
      id: d.id,
      uuid: d.uuid,
      event: d.event,
      status: d.status,
      responseCode: d.response_code,
      responseBody: d.response_body,
      error: d.error,
      attempts: d.attempts,
      durationMs: d.duration_ms,
      payload: fromJson<unknown>(d.payload_json, null),
      createdAt: d.created_at,
      deliveredAt: d.delivered_at,
    };
  }

  async list(): Promise<AdminWebhook[]> {
    return (await this.db.q.selectFrom('webhooks').selectAll().orderBy('name').execute()).map((h) => this.toAdmin(h));
  }

  async save(viewer: RequestViewer, id: number | null, input: { name: string; url: string; events: string[]; isEnabled: boolean }): Promise<{ hook: AdminWebhook; secret: string | null }> {
    const now = this.clock.now();
    let secret: string | null = null;
    let rowId = id;
    if (id) {
      const res = await this.db.q
        .updateTable('webhooks')
        .set({ name: input.name, url: input.url, events_json: toJson(input.events), is_enabled: input.isEnabled ? 1 : 0, updated_at: now })
        .where('id', '=', id)
        .executeTakeFirst();
      if (!Number(res.numUpdatedRows)) throw Errors.notFound('Webhook bulunamadı.');
    } else {
      secret = `whsec_${randomBytes(24).toString('base64url')}`;
      rowId = (
        await this.db.q
          .insertInto('webhooks')
          .values({ name: input.name, url: input.url, secret, events_json: toJson(input.events), is_enabled: input.isEnabled ? 1 : 0, created_by: viewer.user!.id, created_at: now, updated_at: now })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;
    }
    await this.audit.log({ type: 'admin', action: id ? 'webhook.update' : 'webhook.create', actorId: viewer.user!.id, ip: viewer.ip, data: { id: rowId, url: input.url } });
    const h = await this.db.q.selectFrom('webhooks').selectAll().where('id', '=', rowId!).executeTakeFirstOrThrow();
    return { hook: this.toAdmin(h), secret };
  }

  async rotateSecret(viewer: RequestViewer, id: number): Promise<{ secret: string }> {
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const res = await this.db.q.updateTable('webhooks').set({ secret, updated_at: this.clock.now() }).where('id', '=', id).executeTakeFirst();
    if (!Number(res.numUpdatedRows)) throw Errors.notFound('Webhook bulunamadı.');
    await this.audit.log({ type: 'admin', action: 'webhook.secret', actorId: viewer.user!.id, ip: viewer.ip, data: { id } });
    return { secret };
  }

  async remove(viewer: RequestViewer, id: number): Promise<void> {
    await this.db.tx(async () => {
      await this.db.q.deleteFrom('webhook_deliveries').where('webhook_id', '=', id).execute();
      await this.db.q.deleteFrom('webhooks').where('id', '=', id).execute();
    });
    await this.audit.log({ type: 'admin', action: 'webhook.delete', actorId: viewer.user!.id, ip: viewer.ip, data: { id } });
  }

  async deliveries(id: number, page: number) {
    const perPage = 25;
    const [rows, total] = await Promise.all([
      this.db.q.selectFrom('webhook_deliveries').selectAll().where('webhook_id', '=', id).orderBy('id', 'desc').limit(perPage).offset((page - 1) * perPage).execute(),
      this.db.q.selectFrom('webhook_deliveries').select((eb) => eb.fn.countAll<number>().as('n')).where('webhook_id', '=', id).executeTakeFirst(),
    ]);
    return { items: rows.map((r) => this.deliveryDto(r)), total: Number(total?.n ?? 0), page, perPage };
  }

  /** Bağlantı testi: hemen gönderir ve sonucu döner. */
  async ping(id: number): Promise<WebhookDelivery | null> {
    const h = await this.db.q.selectFrom('webhooks').selectAll().where('id', '=', id).executeTakeFirst();
    if (!h) throw Errors.notFound('Webhook bulunamadı.');
    const deliveryId = await this.record(h, 'webhook.ping', await this.buildData('webhook.ping', {}));
    return this.deliver(deliveryId, false);
  }

  async redeliver(deliveryId: number): Promise<WebhookDelivery | null> {
    return this.deliver(deliveryId, false);
  }
}
