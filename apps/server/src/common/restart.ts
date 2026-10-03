import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const RESTART_EXIT_CODE = 75;

export function requestRestart(root: string, delayMs = 1500): void {
  const passenger = join(root, 'tmp');
  if (existsSync(passenger)) {
    try {
      writeFileSync(join(passenger, 'restart.txt'), String(Date.now()));
    } catch {
    }
  }
  setTimeout(() => process.exit(RESTART_EXIT_CODE), delayMs).unref();
}
