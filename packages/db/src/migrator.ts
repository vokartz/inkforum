import type { Kysely } from 'kysely';
import { Migrator, type MigrationResult } from 'kysely/migration';
import { migrationProvider } from './migrations/index.js';

export interface MigrateOutcome {
  applied: string[];
  error?: unknown;
}

function createMigrator(db: Kysely<any>) {
  return new Migrator({
    db,
    provider: migrationProvider,
    migrationTableName: 'kysely_migration',
    migrationLockTableName: 'kysely_migration_lock',
  });
}

function summarize(results: MigrationResult[] | undefined): string[] {
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName);
}

export async function migrateToLatest(db: Kysely<any>): Promise<MigrateOutcome> {
  const { error, results } = await createMigrator(db).migrateToLatest();
  return { applied: summarize(results), error };
}

export async function migrateDown(db: Kysely<any>): Promise<MigrateOutcome> {
  const { error, results } = await createMigrator(db).migrateDown();
  return { applied: summarize(results), error };
}

export async function pendingMigrations(db: Kysely<any>): Promise<string[]> {
  const all = await createMigrator(db).getMigrations();
  return all.filter((m) => !m.executedAt).map((m) => m.name);
}
