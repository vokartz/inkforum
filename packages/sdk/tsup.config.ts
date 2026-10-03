import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts', 'src/client.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: false,
  clean: !options.watch,
  target: 'es2022',
}));
