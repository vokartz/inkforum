import type { MeCounters } from '@forum/shared';

/**
 * Üst çubuktaki okunmamış bildirim / mesaj sayaçları. Sayfa verisiyle başlar,
 * sekme görünürken düzenli aralıkla ve sekmeye dönülünce sunucudan tazelenir.
 */
class Counters {
  notifications = $state(0);
  messages = $state(0);
  modQueue = $state(0);
  /** Anlık akış bağlıyken düzenli sorgu seyrekleşir (akış koparsa yine 45 sn) */
  live = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  set(values: Partial<MeCounters>) {
    if (values.notifications !== undefined) this.notifications = values.notifications;
    if (values.messages !== undefined) this.messages = values.messages;
    if (values.modQueue !== undefined) this.modQueue = values.modQueue;
  }

  async refresh() {
    try {
      const res = await fetch('/api/me/counters', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (res.ok) this.set((await res.json()) as MeCounters);
    } catch {
      /* ağ hatası: bir sonraki denemede */
    }
  }

  /** Üyeler için sorgulamayı başlatır; dönen fonksiyon durdurur. */
  start(intervalMs = 45_000): () => void {
    const onVisible = () => document.visibilityState === 'visible' && void this.refresh();
    void this.refresh();
    let tick = 0;
    this.timer = setInterval(() => {
      tick++;
      if (document.visibilityState === 'visible' && (!this.live || tick % 4 === 0)) void this.refresh();
    }, intervalMs);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (this.timer) clearInterval(this.timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }
}

export const counters = new Counters();
