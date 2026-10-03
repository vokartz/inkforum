import type { ExtensionManifest, ExtensionSlot } from '@forum/shared';
import type {
  AccountPageDefinition,
  AdminPageDefinition,
  ExtensionContext,
  ExtensionDefinition,
  ExtensionHandler,
  PageDefinition,
  RouteOptions,
  SlotDefinition,
} from '@inkforum/sdk';

export interface RouteEntry {
  method: string;
  path: string;
  re: RegExp;
  keys: string[];
  handler: ExtensionHandler;
  opts: RouteOptions;
}

export interface PageEntry {
  def: PageDefinition;
  override: boolean;
  base: string;
  wildcard: boolean;
}

export interface LogEntry {
  at: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface LoadedExtension {
  id: string;
  manifest: ExtensionManifest;
  dir: string;
  def: ExtensionDefinition | null;
  ctx: ExtensionContext;
  routes: RouteEntry[];
  pages: PageEntry[];
  adminPages: Map<string, AdminPageDefinition>;
  accountPages: Map<string, AccountPageDefinition>;
  slots: Array<{ slot: ExtensionSlot; def: SlotDefinition; key: string }>;
  events: Array<{ name: string; handler: (payload: never) => unknown }>;
  jobTypes: string[];
  tasks: string[];
  teardowns: Array<() => void | Promise<void>>;
  settingsListeners: Array<(values: Record<string, unknown>) => void | Promise<void>>;
}

export function compileRoute(path: string): { re: RegExp; keys: string[]; path: string } {
  const clean = `/${path.replace(/^\/+|\/+$/g, '')}`;
  const keys: string[] = [];
  const pattern = clean
    .split('/')
    .map((seg) => {
      if (seg === '*') {
        keys.push('rest');
        return '(.*)';
      }
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  const re = new RegExp(`^${clean === '/' ? '/?' : pattern}/?$`);
  return { re, keys, path: clean };
}

export function matchRoute(entry: Pick<RouteEntry, 're' | 'keys'>, path: string): Record<string, string> | null {
  const m = entry.re.exec(path);
  if (!m) return null;
  const params: Record<string, string> = {};
  entry.keys.forEach((k, i) => {
    try {
      params[k] = decodeURIComponent(m[i + 1] ?? '');
    } catch {
      params[k] = m[i + 1] ?? '';
    }
  });
  return params;
}

export function normalizePagePath(path: string): { base: string; wildcard: boolean } {
  let p = path.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  let wildcard = false;
  if (p === '*' || p.endsWith('/*')) {
    wildcard = true;
    p = p.replace(/\/?\*$/, '');
  }
  if (p === '') return { base: '', wildcard };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){0,3}$/.test(p)) throw new Error(`Geçersiz sayfa adresi: ${path}`);
  return { base: p, wildcard };
}

export const RESPONSE = Symbol.for('inkforum.response');

export interface ExtResponse {
  [RESPONSE]: true;
  kind: 'json' | 'html' | 'text' | 'redirect' | 'empty';
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export function isExtResponse(v: unknown): v is ExtResponse {
  return !!v && typeof v === 'object' && (v as ExtResponse)[RESPONSE] === true;
}

export class ExtHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function respond(kind: ExtResponse['kind'], body: unknown, status: number, headers: Record<string, string> = {}): ExtResponse {
  return { [RESPONSE]: true, kind, body, status, headers };
}

export async function withTimeout<T>(p: Promise<T> | T, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      Promise.resolve(p),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} ${ms} ms içinde yanıt vermedi.`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
