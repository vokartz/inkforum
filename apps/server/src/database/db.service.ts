import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { Kysely, Transaction } from 'kysely';
import type { Database, DB } from '@forum/db';

export const DATABASE = Symbol('DATABASE');

interface TxContext {
  trx: Transaction<DB>;
  afterCommit: Array<() => unknown>;
}

@Injectable()
export class Db implements OnApplicationShutdown {
  private readonly logger = new Logger('Db');
  private readonly als = new AsyncLocalStorage<TxContext>();

  constructor(@Inject(DATABASE) private readonly database: Database) {}

  get driver() {
    return this.database.driver;
  }

  get q(): Kysely<DB> {
    return this.als.getStore()?.trx ?? this.database.db;
  }

  get inTransaction(): boolean {
    return this.als.getStore() !== undefined;
  }

  async tx<T>(fn: (trx: Kysely<DB>) => Promise<T>): Promise<T> {
    const current = this.als.getStore();
    if (current) return fn(current.trx);

    const hooks: TxContext['afterCommit'] = [];
    const result = await this.database.db
      .transaction()
      .execute((trx) => this.als.run({ trx, afterCommit: hooks }, () => fn(trx)));
    for (const hook of hooks) {
      try {
        await hook();
      } catch (err) {
        this.logger.error(`afterCommit hook hatası: ${String(err)}`);
      }
    }
    return result;
  }

  afterCommit(fn: () => unknown): void {
    const current = this.als.getStore();
    if (current) current.afterCommit.push(fn);
    else void Promise.resolve().then(fn);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.database.destroy();
  }
}
