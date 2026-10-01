/**
 * Yöneticinin eklediği özel HTML / JS kodunun istemci tarafı:
 *  - `{{viewer.username}}` gibi şablon değişkenlerini (HTML kaçışlı) doldurur,
 *  - <script> etiketlerini SSR çıktısında etkisiz bırakır, bileşen takıldığında sırayla ve
 *    sayfanın CSP nonce'u ile çalıştırır (dış betikler yüklenmeden sonraki başlamaz),
 *  - özel kodun kullanabileceği küçük bir `window.forum` API'si kurar.
 */
import { t } from '$lib/i18n.svelte';

const DEFERRED = 'text/forum-deferred';

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export type TemplateVars = Record<string, string | number | null | undefined>;

/** `{{ anahtar }}` yer tutucularını doldurur; bilinmeyen anahtarlar boş kalır. */
export function fillTemplate(html: string, vars: TemplateVars): string {
  return html.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v === null || v === undefined ? '' : escapeHtml(String(v));
  });
}

/**
 * <script> etiketlerini çalışmayan bir türe çevirir (asıl tür `data-forum-type` içinde saklanır).
 * Böylece sunucu çıktısında betik CSP'ye takılmaz ve tam bir kez, bizim sıramızla çalışır.
 */
export function deferScripts(html: string): string {
  return html.replace(/<script\b([^>]*)>/gi, (_, attrs: string) => {
    const rest = attrs.replace(/\stype\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, (_m, t: string) => ` data-forum-type=${t}`);
    return `<script type="${DEFERRED}"${rest}>`;
  });
}

function pageNonce(): string {
  const el = document.querySelector<HTMLScriptElement>('script[nonce]');
  return el?.nonce || el?.getAttribute('nonce') || '';
}

let ran = false;
/** Bu sekmede özel betik çalıştı mı? (Yönetim paneline geçerken sayfa temiz yüklenir.) */
export const customScriptsRan = () => ran;

/** Kapsayıcıdaki ertelenmiş betikleri sırayla çalıştırır. */
export async function activateScripts(root: ParentNode): Promise<void> {
  const nonce = pageNonce();
  const scripts = [...root.querySelectorAll<HTMLScriptElement>(`script[type="${DEFERRED}"]`)];
  for (const old of scripts) {
    if (!old.isConnected) continue;
    const el = document.createElement('script');
    for (const a of old.attributes) {
      if (a.name === 'type') continue;
      if (a.name === 'data-forum-type') el.type = a.value;
      else el.setAttribute(a.name, a.value);
    }
    if (nonce) el.nonce = nonce;
    el.textContent = old.textContent;
    ran = true;
    if (el.src && !old.hasAttribute('async') && !old.hasAttribute('defer') && el.type !== 'module') {
      // Dış betik: yüklenmesini bekle (sonraki satır içi kod ona bağlı olabilir).
      el.async = false;
      await new Promise<void>((resolve) => {
        el.addEventListener('load', () => resolve(), { once: true });
        el.addEventListener('error', () => resolve(), { once: true });
        old.replaceWith(el);
      });
    } else {
      old.replaceWith(el);
    }
  }
}

/** Svelte eylemi: öğe takılınca içindeki betikleri çalıştırır. */
export function runScripts(node: HTMLElement) {
  void activateScripts(node);
}

export interface ForumApiViewer {
  id: number;
  username: string;
  displayName: string;
  group: string | null;
  isGuest: boolean;
}

interface ForumApi {
  version: 1;
  viewer: ForumApiViewer;
  /** UCP vb. için imzalı kimlik belirteci (JWT). Yalnızca üyeler; süresi dolana kadar önbellekte tutulur. */
  token(): Promise<string>;
  /** Forum içi sayfa geçişlerinde çağrılır (tek sayfa uygulaması: sayfa yeniden yüklenmez). */
  onNavigate(cb: (url: URL) => void): () => void;
}

declare global {
  interface Window {
    forum?: ForumApi;
  }
}

let cached: { token: string; expiresAt: number } | null = null;

/** `window.forum` nesnesini kurar ya da görüntüleyen bilgisini günceller. */
export function installForumApi(viewer: ForumApiViewer): void {
  if (window.forum) {
    if (window.forum.viewer.id !== viewer.id) cached = null;
    window.forum.viewer = viewer;
    return;
  }
  window.forum = {
    version: 1,
    viewer,
    async token() {
      if (cached && cached.expiresAt - Date.now() > 15_000) return cached.token;
      const res = await fetch('/api/me/integration-token', { method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(res.status === 401 ? t('Giriş yapılmamış.') : t('Entegrasyon belirteci alınamadı.'));
      cached = (await res.json()) as { token: string; expiresAt: number };
      return cached.token;
    },
    onNavigate(cb) {
      const handler = (e: Event) => cb((e as CustomEvent<URL>).detail);
      window.addEventListener('forum:navigate', handler);
      return () => window.removeEventListener('forum:navigate', handler);
    },
  };
}

export function emitNavigate(url: URL): void {
  window.dispatchEvent(new CustomEvent('forum:navigate', { detail: url }));
}
