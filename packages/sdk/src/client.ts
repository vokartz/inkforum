export interface ClientViewer {
  id: number;
  username: string;
  displayName: string;
  group: string | null;
  isGuest: boolean;
  avatarUrl?: string | null;
}

export interface ApiInit {
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
  ext(id: string): {
    api<T = unknown>(path: string, init?: ApiInit): Promise<T>;
    settings: Record<string, unknown>;
    asset(path: string): string;
  };
  t(text: string, vars?: Record<string, string | number>): string;
}

export interface MountContext {
  ext: string;
  forum: ForumClient;
  data: unknown;
  api<T = unknown>(path: string, init?: ApiInit): Promise<T>;
  settings: Record<string, unknown>;
  asset(path: string): string;
  url: URL;
}

export type MountFunction = (el: HTMLElement, ctx: MountContext) => void | (() => void) | Promise<void | (() => void)>;
export type InitFunction = (forum: ForumClient) => void | Promise<void>;

declare global {
  interface Window {
    inkforum?: ForumClient;
  }
}
