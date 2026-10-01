import './scripts/swc-env.mjs';
import { defineConfig } from 'vitest/config';

const swc = (await import('unplugin-swc')).default;

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true, useDefineForClassFields: false },
        target: 'es2023',
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    pool: 'forks',
    env: { NODE_ENV: 'test' },
  },
});
