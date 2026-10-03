import { t } from '$lib/i18n.svelte';

const DEFERRED = 'text/forum-deferred';

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export type TemplateVars = Record<string, string | number | null | undefined>;

export function fillTemplate(html: string, vars: TemplateVars): string {
  return html.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v === null || v === undefined ? '' : escapeHtml(String(v));
  });
}

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
export const customScriptsRan = () => ran;

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

export function runScripts(node: HTMLElement) {
  void activateScripts(node);
}

export interface ForumApiViewer {
  id: number;
  username: string;
  displayName: string;
  group: string | null;
  isGuest: boolean;
  avatarUrl?: string | null;
}

export interface ForumPageInfo {
  id: number;
  slug: string;
  route: string | null;
  title: string;
  data: unknown;
}

interface ForumApi {
  version: 1;
  viewer: ForumApiViewer;
  onNavigate(cb: (url: URL) => void): () => void;
  page: ForumPageInfo | null;
  api<T = unknown>(path?: string, init?: { method?: string; body?: unknown; query?: Record<string, string> }): Promise<T>;
}

declare global {
  interface Window {
    forum?: ForumApi;
  }
}

export function installForumApi(viewer: ForumApiViewer): void {
  if (window.forum) {
    window.forum.viewer = viewer;
    return;
  }
  window.forum = {
    version: 1,
    viewer,
    onNavigate(cb) {
      const handler = (e: Event) => cb((e as CustomEvent<URL>).detail);
      window.addEventListener('forum:navigate', handler);
      return () => window.removeEventListener('forum:navigate', handler);
    },
    page: null,
    async api<T = unknown>(path = '/', init: { method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
      const page = window.forum?.page;
      if (!page) throw new Error(t('forum.api() yalnızca sunucu kodu olan özel sayfalarda kullanılabilir.'));
      const qs = init.query ? `?${new URLSearchParams(init.query)}` : '';
      const res = await fetch(`/api/page-api/${page.slug}${path.startsWith('/') ? path : `/${path}`}${qs}`, {
        method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
        credentials: 'same-origin',
        headers: { accept: 'application/json', ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      const type = res.headers.get('content-type') ?? '';
      const data = res.status === 204 ? null : type.includes('json') ? await res.json() : await res.text();
      if (!res.ok) throw Object.assign(new Error((data as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`), { status: res.status, data });
      return data as T;
    },
  };
}

export function setForumPage(viewer: ForumApiViewer, page: ForumPageInfo | null): void {
  installForumApi(viewer);
  window.forum!.page = page;
}

export function emitNavigate(url: URL): void {
  window.dispatchEvent(new CustomEvent('forum:navigate', { detail: url }));
}
