import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Db } from '../database/db.service.js';
import { Clock, DAY, MINUTE } from '../common/clock.js';
import { CONFIG, type AppConfig } from '../config/config.js';
import { fromJson, toJson } from '../database/json.js';

type JobHandler = (payload: any) => Promise<void>;
type TaskHandler = () => Promise<void>;

export interface EnqueueOptions {
  runAt?: number;
  priority?: number;
  maxAttempts?: number;
  queue?: string;
}

const LOCK_MS = 5 * MINUTE;
const TASK_LOCK_MS = 10 * MINUTE;
const IDLE_POLL_MS = 5000;
const SCHEDULER_TICK_MS = 30_000;

/**
 * Veritabanı tabanlı iş kuyruğu + zamanlayıcı (Redis gerektirmez).
 * - İşler transaction içinde eklenirse yalnızca commit edilince görünür olur (outbox).
 * - Kilitler lease ile alınır; birden fazla process güvenle çalışabilir.
 * - Zamanlanmış görevler açılışta kaçırılanları yakalar.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Jobs');
  private readonly handlers = new Map<string, JobHandler>();
  private readonly tasks = new Map<string, { intervalMs: number; handler: TaskHandler }>();
  private readonly workerId = randomUUID();
  private timer: NodeJS.Timeout | null = null;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;
  private wakeRequested = false;

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  register<T>(type: string, handler: (payload: T) => Promise<void>): void {
    this.handlers.set(type, handler as JobHandler);
  }

  schedule(name: string, intervalMs: number, handler: TaskHandler): void {
    this.tasks.set(name, { intervalMs, handler });
  }

  async enqueue(type: string, payload: unknown, opts: EnqueueOptions = {}): Promise<void> {
    const now = this.clock.now();
    await this.db.q
      .insertInto('jobs')
      .values({
        queue: opts.queue ?? 'default',
        type,
        payload_json: toJson(payload),
        priority: opts.priority ?? 0,
        max_attempts: opts.maxAttempts ?? 5,
        run_at: opts.runAt ?? now,
        created_at: now,
      })
      .execute();
    this.db.afterCommit(() => this.wake());
  }

  async onApplicationBootstrap(): Promise<void> {
    this.schedule('jobs.cleanup', DAY, () => this.cleanup());
    if (!this.config.workerEnabled || this.config.isTest) return;
    await this.syncTasks();
    this.loop(1000);
    this.schedulerTimer = setInterval(() => void this.runDueTasks(), SCHEDULER_TICK_MS);
    this.schedulerTimer.unref();
    // Açılışta kaçırılmış görevleri yakala.
    setTimeout(() => void this.runDueTasks(), 3000).unref();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
  }

  private wake(): void {
    if (this.stopped || !this.config.workerEnabled || this.config.isTest) return;
    if (this.running) {
      this.wakeRequested = true;
      return;
    }
    this.loop(0);
  }

  private loop(delay: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      this.running = true;
      let didWork = false;
      try {
        didWork = await this.processNext();
      } catch (err) {
        this.logger.error(`İş döngüsü hatası: ${String(err)}`);
      } finally {
        this.running = false;
      }
      const again = didWork || this.wakeRequested;
      this.wakeRequested = false;
      this.loop(again ? 0 : IDLE_POLL_MS);
    }, delay);
    this.timer.unref();
  }

  /** Bir işi talep edip çalıştırır. İş yoksa false döner. */
  async processNext(): Promise<boolean> {
    const now = this.clock.now();

    // Süresi dolmuş kilitleri geri al.
    await this.db.q
      .updateTable('jobs')
      .set({ status: 'pending', locked_by: null, locked_until: null })
      .where('status', '=', 'running')
      .where('locked_until', '<', now)
      .execute();

    const candidate = await this.db.q
      .selectFrom('jobs')
      .select(['id'])
      .where('status', '=', 'pending')
      .where('run_at', '<=', now)
      .orderBy('priority', 'desc')
      .orderBy('id', 'asc')
      .limit(1)
      .executeTakeFirst();
    if (!candidate) return false;

    const claimed = await this.db.q
      .updateTable('jobs')
      .set((eb) => ({
        status: 'running',
        locked_by: this.workerId,
        locked_until: now + LOCK_MS,
        attempts: eb('attempts', '+', 1),
      }))
      .where('id', '=', candidate.id)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    if (Number(claimed.numUpdatedRows) !== 1) return true;

    const job = await this.db.q.selectFrom('jobs').selectAll().where('id', '=', candidate.id).executeTakeFirstOrThrow();
    const handler = this.handlers.get(job.type);
    try {
      if (!handler) throw new Error(`Tanımsız iş tipi: ${job.type}`);
      await handler(fromJson(job.payload_json, {}));
      await this.db.q
        .updateTable('jobs')
        .set({ status: 'done', finished_at: this.clock.now(), locked_by: null, locked_until: null, last_error: null })
        .where('id', '=', job.id)
        .execute();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = job.attempts >= job.max_attempts;
      const backoff = Math.min(60 * MINUTE, 2 ** job.attempts * 15_000);
      this.logger.warn(`İş başarısız (${job.type} #${job.id}, deneme ${job.attempts}): ${message}`);
      await this.db.q
        .updateTable('jobs')
        .set({
          status: failed ? 'failed' : 'pending',
          run_at: failed ? job.run_at : this.clock.now() + backoff,
          finished_at: failed ? this.clock.now() : null,
          locked_by: null,
          locked_until: null,
          last_error: message.slice(0, 2000),
        })
        .where('id', '=', job.id)
        .execute();
    }
    return true;
  }

  /** Bekleyen tüm işleri sırayla çalıştırır (testler ve CLI için). */
  async drain(max = 1000): Promise<number> {
    let count = 0;
    while (count < max && (await this.processNext())) count++;
    return count;
  }

  private async syncTasks(): Promise<void> {
    const now = this.clock.now();
    for (const [name, task] of this.tasks) {
      await this.db.q
        .insertInto('scheduled_tasks')
        .values({ name, interval_ms: task.intervalMs, next_run_at: now + 60_000 })
        .onConflict((oc) => oc.column('name').doUpdateSet({ interval_ms: task.intervalMs }))
        .execute();
    }
  }

  /** Zamanı gelmiş görevleri çalıştırır. Dış cron tetikleyicisi de bunu çağırır. */
  async runDueTasks(force = false): Promise<string[]> {
    await this.syncTasks();
    const now = this.clock.now();
    let query = this.db.q
      .selectFrom('scheduled_tasks')
      .selectAll()
      .where('is_enabled', '=', 1)
      .where((eb) => eb.or([eb('locked_until', 'is', null), eb('locked_until', '<', now)]));
    if (!force) query = query.where('next_run_at', '<=', now);
    const due = await query.execute();

    const ran: string[] = [];
    for (const row of due) {
      const task = this.tasks.get(row.name);
      if (!task) continue;
      const lock = await this.db.q
        .updateTable('scheduled_tasks')
        .set({ locked_until: now + TASK_LOCK_MS })
        .where('name', '=', row.name)
        .where((eb) => eb.or([eb('locked_until', 'is', null), eb('locked_until', '<', now)]))
        .executeTakeFirst();
      if (Number(lock.numUpdatedRows) !== 1) continue;

      let status = 'ok';
      let error: string | null = null;
      try {
        await task.handler();
      } catch (err) {
        status = 'error';
        error = err instanceof Error ? err.message : String(err);
        this.logger.error(`Zamanlanmış görev hatası (${row.name}): ${error}`);
      }
      const finished = this.clock.now();
      await this.db.q
        .updateTable('scheduled_tasks')
        .set({
          last_run_at: finished,
          next_run_at: finished + task.intervalMs,
          last_status: status,
          last_error: error,
          locked_until: null,
        })
        .where('name', '=', row.name)
        .execute();
      ran.push(row.name);
    }
    return ran;
  }

  private async cleanup(): Promise<void> {
    const cutoff = this.clock.now() - 7 * DAY;
    await this.db.q.deleteFrom('jobs').where('status', '=', 'done').where('finished_at', '<', cutoff).execute();
    await this.db.q
      .deleteFrom('jobs')
      .where('status', '=', 'failed')
      .where('finished_at', '<', this.clock.now() - 30 * DAY)
      .execute();
  }

  async stats() {
    const rows = await this.db.q
      .selectFrom('jobs')
      .select(['status', (eb) => eb.fn.countAll<number>().as('count')])
      .groupBy('status')
      .execute();
    const tasks = await this.db.q.selectFrom('scheduled_tasks').selectAll().orderBy('name').execute();
    return { counts: Object.fromEntries(rows.map((r) => [r.status, Number(r.count)])), tasks };
  }
}
