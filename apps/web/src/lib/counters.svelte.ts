import type { MeCounters } from '@forum/shared';

/**
 * Üst çubuktaki okunmamış bildirim / mesaj sayaçları. Sayfa verisiyle başlar,
 * sekme görünürken düzenli aralıkla ve sekmeye dönülünce sunucudan tazelenir.
 */
class Counters {
  notifications = $state(0);
  messages = $state(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  set(values: Partial<MeCounters>) {
    if (values.notifications !== undefined) this.notifications = values.notifications;
    if (values.messages !== undefined) this.messages = values.messages;
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
    this.timer = setInterval(() => document.visibilityState === 'visible' && void this.refresh(), intervalMs);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (this.timer) clearInterval(this.timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }
}

export const counters = new Counters();
