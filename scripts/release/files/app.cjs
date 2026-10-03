/* eslint-disable @typescript-eslint/no-require-imports -- Passenger başlangıç dosyasını require() ile yükler; CommonJS olmalı */
'use strict';
const { existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const http = require('node:http');

const root = __dirname;
process.chdir(root);
const [major, minor] = process.versions.node.split('.').map(Number);
const MIN = [22, 13];

if (major < MIN[0] || (major === MIN[0] && minor < MIN[1])) {
  const msg = `InkForum needs Node.js ${MIN.join('.')} or newer (running ${process.versions.node}). ` +
    `In cPanel open "Setup Node.js App", edit the application and choose Node.js 22 or newer.\n\n` +
    `InkForum için Node.js ${MIN.join('.')} veya üzeri gerekir (şu an ${process.versions.node}). ` +
    `cPanel'de "Setup Node.js App" ekranında uygulamayı düzenleyip Node.js 22 veya üzerini seçin.`;
  console.error(msg);
  if (process.argv[2] === 'cron') process.exit(1);
  http.createServer((_req, res) => {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(msg);
  }).listen(process.env.PORT || 3000);
} else {
  if (existsSync(join(root, '.env'))) {
    try {
      process.loadEnvFile(join(root, '.env'));
    } catch (err) {
      console.error('[inkforum] .env okunamadı:', err && err.message);
    }
  }
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  if (typeof PhusionPassenger !== 'undefined' || process.env.PASSENGER_APP_ENV) {
    try {
      mkdirSync(join(root, 'tmp'), { recursive: true });
    } catch {
    }
  }
  if (process.argv[2] === 'cron') {
    import('./cli.mjs').catch((err) => {
      console.error(err);
      process.exit(1);
    });
  } else {
    import('./server.mjs').catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
