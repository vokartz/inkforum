import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { Db } from '../database/db.service.js';
import { Clock } from '../common/clock.js';
import { CONFIG, type AppConfig } from '../config/config.js';

const FLUSH_MS = 30_000;

interface PendingViewer {
  topicId: number;
  userId: number;
  count: number;
  first: number;
  last: number;
}

@Injectable()
export class TopicViewsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('TopicViews');
  private pending = new Map<number, number>();
  private viewers = new Map<string, PendingViewer>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  add(topicId: number, userId: number | null = null): void {
    this.pending.set(topicId, (this.pending.get(topicId) ?? 0) + 1);
    if (!userId) return;
    const key = `${topicId}:${userId}`;
    const now = this.clock.now();
    const cur = this.viewers.get(key);
    if (cur) {
      cur.count++;
      cur.last = now;
    } else this.viewers.set(key, { topicId, userId, count: 1, first: now, last: now });
  }

  pendingFor(topicId: number): number {
    return this.pending.get(topicId) ?? 0;
  }

  async flush(): Promise<void> {
    if (!this.pending.size && !this.viewers.size) return;
    const batch = this.pending;
    const viewers = [...this.viewers.values()];
    this.pending = new Map();
    this.viewers = new Map();
    try {
      await this.db.tx(async () => {
        for (const [id, n] of batch) {
          await this.db.q
            .updateTable('topics')
            .set((eb) => ({ view_count: eb('view_count', '+', n) }))
            .where('id', '=', id)
            .execute();
        }
        for (const v of viewers) {
          await this.db.q
            .insertInto('topic_viewers')
            .values({ topic_id: v.topicId, user_id: v.userId, views: v.count, first_at: v.first, last_at: v.last })
            .onConflict((oc) => oc.columns(['topic_id', 'user_id']).doUpdateSet((eb) => ({ views: eb('topic_viewers.views', '+', v.count), last_at: v.last })))
            .execute();
        }
      });
    } catch (err) {
      this.logger.warn(`Görüntülenme kayıtları yazılamadı: ${String(err)}`);
    }
  }
}
