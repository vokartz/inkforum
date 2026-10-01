import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Yeniden başlat" çıkış kodu. Docker (restart: unless-stopped), systemd (Restart=always) ve PM2 süreci
 * her çıkışta yeniden başlatır; geliştirme çalıştırıcısı (scripts/dev.mjs) bu kodu görünce API'yi yeniden açar.
 */
export const RESTART_EXIT_CODE = 75;

/** Yanıt gönderildikten kısa süre sonra süreci yeniden başlatılmak üzere kapatır */
export function requestRestart(root: string, delayMs = 1500): void {
  const passenger = join(root, 'tmp');
  if (existsSync(passenger)) {
    try {
      writeFileSync(join(passenger, 'restart.txt'), String(Date.now()));
    } catch {
      /* Passenger yok ya da yazılamıyor */
    }
  }
  setTimeout(() => process.exit(RESTART_EXIT_CODE), delayMs).unref();
}
