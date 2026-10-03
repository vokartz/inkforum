import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory.js';
import { loadConfig } from './config/config.js';
import { applyPendingRestore } from './maintenance/restore.js';

async function main(): Promise<void> {
  const config = loadConfig();
  await applyPendingRestore(config);
  const app = await createApp(config, { mountWeb: true });
  await app.listen(config.port, config.host);
  const logger = new Logger('InkForum');
  logger.log(`InkForum v${config.version} · API hazır: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/api`);
  if (config.webBuildDir) logger.log(`Arayüz sunuluyor: ${config.webBuildDir}`);
  else if (!config.isProd) logger.log(`Geliştirme arayüzü: ${config.appUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
