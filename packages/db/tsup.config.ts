import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: !options.watch,
  target: 'es2023',
  platform: 'node',
  external: ['better-sqlite3', 'pg', 'kysely', 'kysely/migration', '@electric-sql/pglite'],
}));
