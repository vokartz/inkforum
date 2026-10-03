import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { t } from '$lib/i18n.svelte';
import type { ExtensionClientBundle } from '@forum/shared';

export interface ClientViewer {
  id: number;
  username: string;
  displayName: string;
  group: string | null;
  isGuest: boolean;
  avatarUrl?: string | null;
}

interface ApiInit {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface ForumClient {
  version: 2;
  viewer: ClientViewer;
  onNavigate(cb: (url: URL) => void): () => void;
  goto(url: string): void;
  toast(message: string, kind?: 'success' | 'error' | 'info'): void;
  request<T = unknown>(path: string, init?: ApiInit): Promise<T>;
  ext(id: string): { api<T = unknown>(path: string, init?: ApiInit): Promise<T>; settings: Record<string, unknown>; asset(path: string): string };
  t(text: string, vars?: Record<string, string | number>): string;
}

declare global {
  interface Window {
    inkforum?: ForumClient;
  }
}

let extSettings: Record<string, Record<string, unknown>> = {};

async function call<T>(url: string, init: ApiInit = {}): Promise<T> {
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : '';
  const res = await fetch(`${url}${qs}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...(init.body !== undefined && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...init.headers },
    body: init.body === undefined ? undefined : init.body instanceof FormData ? init.body : JSON.stringify(init.body),
  });
  const type = res.headers.get('content-type') ?? '';
  const data = res.status === 204 ? null : type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw Object.assign(new Error((data as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`), { status: res.status, data });
  return data as T;
}

const extPath = (id: string, path: string) => `/api/ext/${id}${path.startsWith('/') ? path : `/${path}`}`;
const assetPath = (id: string, path: string) => `/ext-assets/${id}/${path.replace(/^\/+/, '')}`;

export function installForumClient(viewer: ClientViewer, settings: Record<string, Record<string, unknown>> = {}): ForumClient {
  extSettings = settings;
  if (window.inkforum) {
    window.inkforum.viewer = viewer;
    return window.inkforum;
  }
  const client: ForumClient = {
    version: 2,
    viewer,
    onNavigate(cb) {
      const handler = (e: Event) => cb((e as CustomEvent<URL>).detail);
      window.addEventListener('forum:navigate', handler);
      return () => window.removeEventListener('forum:navigate', handler);
    },
    goto: (url) => void goto(url),
    toast(message, kind = 'info') {
      if (kind === 'success') toast.success(message);
      else if (kind === 'error') toast.error(message);
      else toast(message);
    },
    request: (path, init) => call(path, init),
    ext: (id) => ({
      api: (path, init) => call(extPath(id, path), init),
      get settings() {
        return extSettings[id] ?? {};
      },
      asset: (path) => assetPath(id, path),
    }),
    t: (text, vars) => t(text, vars),
  };
  window.inkforum = client;
  return client;
}

const loadedGlobals = new Set<string>();

export async function runGlobalScripts(bundle: Pick<ExtensionClientBundle, 'scripts'>): Promise<void> {
  const client = window.inkforum;
  if (!client) return;
  for (const s of bundle.scripts) {
    if (loadedGlobals.has(s.src)) continue;
    loadedGlobals.add(s.src);
    try {
      const mod = (await import(/* @vite-ignore */ s.src)) as { default?: (f: ForumClient) => unknown; init?: (f: ForumClient) => unknown };
      await (mod.default ?? mod.init)?.(client);
    } catch (e) {
      console.error(`[${s.ext}] eklenti betiği çalışmadı:`, e);
    }
  }
}

type Cleanup = () => void;

export async function mountModules(el: HTMLElement, ext: string, scripts: string[], data: unknown): Promise<Cleanup> {
  const client = window.inkforum;
  const cleanups: Cleanup[] = [];
  if (!client || !scripts.length) return () => {};
  for (const src of scripts) {
    try {
      const mod = (await import(/* @vite-ignore */ src)) as { mount?: (el: HTMLElement, ctx: unknown) => unknown; default?: (el: HTMLElement, ctx: unknown) => unknown };
      const fn = mod.mount ?? mod.default;
      if (typeof fn !== 'function') continue;
      const ctx = {
        ext,
        forum: client,
        data,
        api: (path: string, init?: ApiInit) => call(extPath(ext, path), init),
        get settings() {
          return extSettings[ext] ?? {};
        },
        asset: (path: string) => assetPath(ext, path),
        url: new URL(location.href),
      };
      const r = await fn(el, ctx);
      if (typeof r === 'function') cleanups.push(r as Cleanup);
    } catch (e) {
      console.error(`[${ext}] modül takılamadı (${src}):`, e);
    }
  }
  return () => {
    for (const c of cleanups)
      try {
        c();
      } catch {
      }
  };
}

export function extMount(node: HTMLElement, params: { ext: string; scripts: string[]; data?: unknown }) {
  let cleanup: Cleanup | null = null;
  let alive = true;
  const run = (p: typeof params) => {
    cleanup?.();
    cleanup = null;
    void mountModules(node, p.ext, p.scripts, p.data ?? null).then((c) => {
      if (alive) cleanup = c;
      else c();
    });
  };
  run(params);
  return {
    update: run,
    destroy() {
      alive = false;
      cleanup?.();
    },
  };
}

export const extensionScriptsRan = () => loadedGlobals.size > 0;
