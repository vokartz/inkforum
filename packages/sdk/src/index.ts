import type { Kysely, sql as kyselySql, CreateTableBuilder, ColumnDefinitionBuilder } from 'kysely';

export type { Kysely };

export interface ExtensionDefinition {
  migrations?: Record<string, ExtensionMigration>;
  setup(ctx: ExtensionContext): void | Promise<void>;
  teardown?(ctx: ExtensionContext): void | Promise<void>;
  uninstall?(ctx: ExtensionContext): void | Promise<void>;
}

export interface ExtensionMigration {
  up(db: Kysely<any>, schema: SchemaHelpers): Promise<void>;
  down?(db: Kysely<any>, schema: SchemaHelpers): Promise<void>;
}

export function defineExtension(def: ExtensionDefinition): ExtensionDefinition {
  return def;
}

export interface SchemaHelpers {
  sqlite: boolean;
  table(name: string, opts?: { big?: boolean }): CreateTableBuilder<string, 'id'>;
  plainTable(name: string): CreateTableBuilder<string, never>;
  notNull: (c: ColumnDefinitionBuilder) => ColumnDefinitionBuilder;
  flag(defaultValue: 0 | 1): (c: ColumnDefinitionBuilder) => ColumnDefinitionBuilder;
  intDefault(v: number): (c: ColumnDefinitionBuilder) => ColumnDefinitionBuilder;
  textDefault(v: string): (c: ColumnDefinitionBuilder) => ColumnDefinitionBuilder;
  ref(target: string, onDelete?: 'cascade' | 'set null' | 'restrict', required?: boolean): (c: ColumnDefinitionBuilder) => ColumnDefinitionBuilder;
}

export interface ExtensionContext {
  readonly id: string;
  readonly manifest: ExtensionManifestInfo;
  readonly coreVersion: string;
  readonly appUrl: string;
  readonly dir: string;
  readonly dataDir: string;
  readonly log: ExtensionLogger;

  readonly db: Kysely<any>;
  readonly sql: typeof kyselySql;
  tx<T>(fn: () => Promise<T>): Promise<T>;
  table(name: string): string;

  readonly settings: ExtensionSettings;
  readonly kv: ExtensionKv;

  readonly routes: ExtensionRoutes;
  readonly pages: ExtensionPages;
  readonly admin: ExtensionAdmin;
  readonly account: ExtensionAccount;
  readonly slots: ExtensionSlots;

  readonly events: ExtensionEvents;
  readonly jobs: ExtensionJobs;
  readonly forum: ExtensionForumApi;

  readonly http: ExtensionHttp;
  onTeardown(fn: () => void | Promise<void>): void;
}

export interface ExtensionManifestInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
}

export interface ExtensionLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface ExtensionSettings {
  get<T = unknown>(key: string): T;
  all(): Record<string, unknown>;
  set(key: string, value: unknown): Promise<void>;
  onChange(fn: (values: Record<string, unknown>) => void | Promise<void>): void;
}

export interface ExtensionKv {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list<T = unknown>(prefix?: string): Promise<Array<{ key: string; value: T; expiresAt: number | null }>>;
}

export interface ExtensionViewer {
  id: number;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  isAdmin: boolean;
  groupIds: number[];
  primaryGroupId: number | null;
  email: string | null;
  emailVerified: boolean;
  locale: string;
  can(permission: string): boolean;
}

export interface ExtensionRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
  ip: string | null;
  viewer: ExtensionViewer;
  raw: { req: unknown; res: unknown };
}

export type ExtensionResult = unknown;
export type ExtensionHandler = (req: ExtensionRequest) => ExtensionResult | Promise<ExtensionResult>;

export interface RouteOptions {
  auth?: boolean;
  permission?: string | string[];
  admin?: boolean;
  rateLimit?: { limit: number; windowMs?: number; by?: 'ip' | 'user' };
}

export interface ExtensionRoutes {
  get(path: string, handler: ExtensionHandler, opts?: RouteOptions): void;
  post(path: string, handler: ExtensionHandler, opts?: RouteOptions): void;
  put(path: string, handler: ExtensionHandler, opts?: RouteOptions): void;
  patch(path: string, handler: ExtensionHandler, opts?: RouteOptions): void;
  delete(path: string, handler: ExtensionHandler, opts?: RouteOptions): void;
  all(path: string, handler: ExtensionHandler, opts?: RouteOptions): void;
}

export interface PageResult {
  html?: string;
  title?: string;
  description?: string;
  data?: unknown;
  scripts?: string[];
  styles?: string[];
  redirect?: string;
  status?: 404 | 403;
}

export interface PageDefinition {
  path: string;
  title: string;
  layout?: 'default' | 'wide' | 'blank';
  showTitle?: boolean;
  auth?: boolean;
  permission?: string | string[];
  override?: boolean;
  render(req: ExtensionRequest): PageResult | Promise<PageResult>;
}

export interface ExtensionPages {
  add(page: PageDefinition): void;
}

export interface AdminPageDefinition {
  key: string;
  title: string;
  icon?: string;
  permission?: string | string[];
  render(req: ExtensionRequest): PageResult | Promise<PageResult>;
}

export interface ExtensionAdmin {
  page(page: AdminPageDefinition): void;
}

export interface AccountPageDefinition {
  key: string;
  title: string;
  icon?: string;
  permission?: string | string[];
  render(req: ExtensionRequest): PageResult | Promise<PageResult>;
}

export interface ExtensionAccount {
  page(page: AccountPageDefinition): void;
}

export type SlotName =
  | 'afterHeader'
  | 'beforeFooter'
  | 'bodyEnd'
  | 'homeTop'
  | 'homeSidebar'
  | 'profileSidebar'
  | 'profileTab'
  | 'boardTop'
  | 'topicTop'
  | 'topicBottom'
  | 'postFooter'
  | 'postActions';

export interface SlotRequest extends ExtensionRequest {
  profile?: { id: number; username: string; displayName: string } | null;
  board?: { id: number; name: string; slug: string } | null;
  topic?: { id: number; title: string; boardId: number; authorId: number | null } | null;
  post?: { id: number; authorId: number | null; isFirst: boolean } | null;
}

export interface SlotDefinition {
  key?: string;
  title?: string;
  render(req: SlotRequest): string | null | { html: string; scripts?: string[]; title?: string } | Promise<string | null | { html: string; scripts?: string[]; title?: string }>;
}

export interface ExtensionSlots {
  add(slot: SlotName, def: SlotDefinition): void;
}

export interface ForumEvents {
  'user.registered': { userId: number };
  'user.activated': { userId: number };
  'user.emailVerified': { userId: number };
  'user.loggedIn': { userId: number };
  'user.profileUpdated': { userId: number };
  'user.avatarChanged': { userId: number };
  'user.twoFactorChanged': { userId: number; enabled: boolean };
  'user.groupsChanged': { userId: number };
  'user.postCountChanged': { userId: number };
  'user.warningPointsChanged': { userId: number };
  'user.banned': { userId: number; banId: number };
  'achievement.awarded': { userId: number; achievementId: number };
  'topic.created': { topicId: number; postId: number; userId: number; boardId: number };
  'post.created': { topicId: number; postId: number; userId: number; boardId: number };
}

export interface ExtensionEvents {
  on<K extends keyof ForumEvents>(name: K, handler: (payload: ForumEvents[K]) => void | Promise<void>): void;
}

export interface ExtensionJobs {
  register<T = unknown>(type: string, handler: (payload: T) => Promise<void>): void;
  enqueue(type: string, payload: unknown, opts?: { runAt?: number; maxAttempts?: number }): Promise<void>;
  schedule(name: string, intervalMs: number, handler: () => Promise<void>): void;
}

export interface ForumUser {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
  emailVerified: boolean;
  status: string;
  primaryGroupId: number | null;
  groupIds: number[];
  postCount: number;
  createdAt: number;
  lastSeenAt: number | null;
}

export interface ForumGroup {
  id: number;
  name: string;
  systemKey: string | null;
  color: string | null;
}

export interface ExtensionForumApi {
  user(idOrName: number | string): Promise<ForumUser | null>;
  groups(): Promise<ForumGroup[]>;
  addToGroup(userId: number, groupId: number, opts?: { expiresAt?: number | null }): Promise<void>;
  removeFromGroup(userId: number, groupId: number): Promise<void>;
  notify(userId: number, message: string, opts?: { url?: string }): Promise<void>;
  mail(to: string, subject: string, body: { html: string; text?: string }): Promise<void>;
  audit(action: string, data?: Record<string, unknown>, actorId?: number | null): Promise<void>;
  setting<T = unknown>(key: string): T | undefined;
  renderBBCode(source: string): string;
  encrypt(value: string): string;
  decrypt(value: string): string | null;
}

export interface HttpError extends Error {
  status: number;
  code?: string;
}

export interface ExtensionHttp {
  json(body: unknown, status?: number, headers?: Record<string, string>): unknown;
  html(body: string, status?: number, headers?: Record<string, string>): unknown;
  text(body: string, status?: number, headers?: Record<string, string>): unknown;
  redirect(url: string, status?: 301 | 302 | 303 | 307 | 308): unknown;
  empty(): unknown;
  error(status: number, message: string, code?: string): HttpError;
}

const RAW = Symbol.for('inkforum.rawHtml');
interface RawHtml {
  [RAW]: true;
  value: string;
  toString(): string;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function raw(value: string): RawHtml {
  return { [RAW]: true, value, toString: () => value };
}

function part(v: unknown): string {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (typeof v === 'object' && (v as RawHtml)[RAW]) return (v as RawHtml).value;
  return escapeHtml(v);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): string & RawHtml {
  let out = strings[0] ?? '';
  values.forEach((v, i) => (out += part(v) + (strings[i + 1] ?? '')));
  const s = Object.assign(new String(out), { [RAW]: true as const, value: out });
  return s as unknown as string & RawHtml;
}
