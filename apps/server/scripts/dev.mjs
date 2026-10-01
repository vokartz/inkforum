// Geliştirme çalıştırıcısı: SWC'yi izleme modunda çalıştırır, dist değişince API sürecini
// güvenle (önce SIGTERM, gerekirse zorla) yeniden başlatır. Windows'ta da kararlı çalışır.
import './swc-env.mjs';
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cwd = resolve(here, '..');
const require = createRequire(import.meta.url);
const swcCli = require.resolve('@swc/cli/bin/swc.js');
const swcArgs = ['src', '-d', 'dist', '--strip-leading-paths', '--config-file', '.swcrc', '--ignore', '**/*.test.ts'];

let child = null;
let restarting = false;
let timer = null;
let ready = false;

function log(msg) {
  console.log(`\x1b[35m[dev]\x1b[0m ${msg}`);
}

function start() {
  child = spawn(process.execPath, ['--enable-source-maps', '--env-file-if-exists=../../.env', 'dist/main.js'], {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    child = null;
    // 75 = uygulama yeniden başlatma istedi (yedekten geri yükleme, güncelleme)
    if (code === 75 && !restarting) {
      log('API yeniden başlatma istedi…');
      start();
      return;
    }
    if (!restarting) log(`API süreci kapandı (kod: ${code ?? signal}). Değişiklik bekleniyor…`);
  });
}

function stop() {
  return new Promise((done) => {
    if (!child) return done();
    const proc = child;
    const force = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* zaten kapandı */
      }
    }, 3000);
    proc.once('exit', () => {
      clearTimeout(force);
      done();
    });
    proc.kill('SIGTERM');
  });
}

async function restart() {
  if (restarting) return;
  restarting = true;
  log('Değişiklik algılandı, API yeniden başlatılıyor…');
  await stop();
  restarting = false;
  start();
}

// 1) Tek seferlik derleme, 2) API'yi başlat, 3) izlemeye geç.
const initial = spawn(process.execPath, [swcCli, ...swcArgs], { cwd, stdio: 'inherit', env: process.env });
initial.on('exit', (code) => {
  if (code !== 0) {
    log('İlk derleme başarısız.');
    process.exit(code ?? 1);
  }
  start();
  const watcher = spawn(process.execPath, [swcCli, ...swcArgs, '--watch'], { cwd, stdio: ['ignore', 'ignore', 'inherit'], env: process.env });
  // SWC izleyicisi açılışta her şeyi yeniden yazar; ilk birkaç saniyedeki değişiklikleri yok say.
  setTimeout(() => (ready = true), 4000);
  watch(resolve(cwd, 'dist'), { recursive: true }, (_event, file) => {
    if (!ready || !file || !String(file).endsWith('.js')) return;
    clearTimeout(timer);
    timer = setTimeout(restart, 300);
  });
  const shutdown = async () => {
    watcher.kill();
    await stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
});
