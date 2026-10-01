// `swc` CLI'yi proje içi native önbellek ayarıyla çalıştırır. Kullanım: node scripts/swc.mjs [--watch]
import './swc-env.mjs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = require.resolve('@swc/cli/bin/swc.js');
const args = ['src', '-d', 'dist', '--strip-leading-paths', '--config-file', '.swcrc', '--ignore', '**/*.test.ts', ...process.argv.slice(2)];
const child = spawn(process.execPath, [cli, ...args], { stdio: 'inherit', env: process.env });
child.on('exit', (code) => process.exit(code ?? 0));
