import type { RealtimeEvent } from '@forum/shared';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { toast } from 'svelte-sonner';
import { counters } from './counters.svelte';
import { sounds } from './sounds.svelte';
import { describeNotification, type NotificationItem } from './notifications';
import { t } from './i18n.svelte';

/** Sayfalar anlık olayları dinleyebilir: window.addEventListener('forum:realtime', (e) => e.detail) */
export const REALTIME_EVENT = 'forum:realtime';

/**
 * Anlık bildirim akışı (GET /api/me/stream). Yeni bildirim ve mesajda sayaçlar hemen güncellenir,
 * ses çalınır ve kısa bir uyarı gösterilir. Aynı olay birden çok sekmede yalnızca bir kez seslendirilir.
 */
class Realtime {
  connected = $state(false);
  private es: EventSource | null = null;

  start(): () => void {
    if (typeof EventSource === 'undefined' || this.es) return () => undefined;
    sounds.init();
    const es = new EventSource('/api/me/stream', { withCredentials: true });
    this.es = es;
    const on = (type: RealtimeEvent['type'], fn: (e: RealtimeEvent) => void) =>
      es.addEventListener(type, (m) => {
        try {
          const ev = JSON.parse((m as MessageEvent<string>).data) as RealtimeEvent;
          fn(ev);
          window.dispatchEvent(new CustomEvent(REALTIME_EVENT, { detail: ev }));
        } catch {
          /* bozuk olay */
        }
      });
    on('hello', () => {
      this.connected = true;
      counters.live = true;
      void counters.refresh();
    });
    on('counters', () => void counters.refresh());
    on('notification', () => void this.onNotification());
    on('message', (e) => e.type === 'message' && this.onMessage(e));
    es.onerror = () => {
      this.connected = false;
      counters.live = false;
      // Oturum kapandıysa (401) tarayıcı yeniden denemez; akış kapatılır
      if (es.readyState === EventSource.CLOSED) this.stop();
    };
    return () => this.stop();
  }

  stop(): void {
    this.es?.close();
    this.es = null;
    this.connected = false;
    counters.live = false;
  }

  /** Birden çok sekme açıksa olay yalnızca ilk sekmede seslendirilir */
  private claim(key: string): boolean {
    try {
      const k = `forum_rt_${key}`;
      if (localStorage.getItem(k)) return false;
      localStorage.setItem(k, '1');
      setTimeout(() => localStorage.removeItem(k), 5000);
    } catch {
      /* depolama yok: her sekme çalar */
    }
    return true;
  }

  private async onNotification(): Promise<void> {
    await counters.refresh();
    if (page.url.pathname === '/notifications') return;
    let item: NotificationItem | undefined;
    try {
      const res = await fetch('/api/me/notifications?perPage=1', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (res.ok) item = ((await res.json()) as { items: NotificationItem[] }).items[0];
    } catch {
      /* yoksay */
    }
    if (!item || !this.claim(`n${item.id}`)) return;
    sounds.play('notification');
    if (document.visibilityState !== 'visible') return;
    const { text, href } = describeNotification(item);
    toast(t('Yeni bildirim'), {
      description: text,
      action: href ? { label: t('Aç'), onClick: () => void goto(href) } : undefined,
    });
  }

  private onMessage(e: Extract<RealtimeEvent, { type: 'message' }>): void {
    void counters.refresh();
    const viewing = page.url.pathname === `/messages/${e.conversationId}` && document.visibilityState === 'visible';
    if (viewing || !this.claim(`m${e.messageId}`)) return;
    sounds.play('message');
    if (document.visibilityState !== 'visible') return;
    toast(e.title ? `${e.from.name} · ${e.title}` : e.from.name, {
      description: e.excerpt,
      action: { label: t('Yanıtla'), onClick: () => void goto(`/messages/${e.conversationId}`) },
    });
  }
}

export const realtime = new Realtime();
