/* eslint-disable no-control-regex -- işaretçiler bilerek kontrol karakterleriyle yazılır */
/**
 * Kaynak forumdan bağımsız ara model. Her okuyucu (SMF, phpBB, IPS, MyBB, XenForo) ara depodaki tabloları bu biçime
 * çevirir; içe aktarma servisi yalnızca bu modeli bilir.
 *
 * Mesaj gövdeleri InkForum BBCode'udur. Henüz yeni kimliği bilinmeyen başvurular işaretçiyle yazılır ve
 * aktarım sırasında çözülür:
 *   ␁p:123␂  → alıntılanan mesaj (kaynak kimliği)
 *   ␁u:42␂   → bahsedilen üye
 *   ␁a:7␂    → eklenti (dosya) yerleşimi
 */
import type { SqlValue } from './sql-dump.js';
import type { SourceCharset } from './text.js';

export type Platform = 'smf' | 'phpbb' | 'ips' | 'mybb' | 'xenforo';

export const PLATFORM_NAMES: Record<Platform, string> = {
  smf: 'Simple Machines Forum',
  phpbb: 'phpBB',
  ips: 'Invision Community (IPS)',
  mybb: 'MyBB',
  xenforo: 'XenForo',
};

export const MARK_OPEN = '\u0001';
export const MARK_CLOSE = '\u0002';
export const mark = (kind: 'p' | 'u' | 'a', id: string | number) => `${MARK_OPEN}${kind}:${id}${MARK_CLOSE}`;
export const MARK_RE = /\u0001([pua]):([^\u0002]{1,40})\u0002/g;

export type GroupRole = 'admin' | 'global_moderator' | 'moderator' | 'member' | 'guest' | 'custom';

export interface SrcGroup {
  id: string;
  name: string;
  description: string;
  color: string | null;
  /** Rütbe görseli (eski forumdaki tam adres) */
  iconUrl: string | null;
  iconCount: number;
  role: GroupRole;
  /** Mesaj sayısı rütbesi (SMF sayı grupları, phpBB rütbeleri, MyBB kullanıcı başlıkları) */
  minPosts: number | null;
  hidden: boolean;
}

export interface SrcUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  /** users.password_hash biçiminde eski özet ($legacy$…, $2y$…, $H$…) ya da '' (şifre sıfırlama gerekir) */
  passwordHash: string;
  registeredAt: number;
  lastActiveAt: number | null;
  ip: string | null;
  postCount: number;
  primaryGroup: string | null;
  groups: string[];
  customTitle: string | null;
  signature: string;
  avatarUrl: string | null;
  birthdate: string | null;
  location: string;
  website: string;
  status: 'active' | 'pending_email' | 'pending_approval';
  /** Yasaklıysa bitiş zamanı (0 = süresiz) */
  bannedUntil: number | null;
  banReason?: string;
}

export interface SrcCategory {
  id: string;
  name: string;
  description: string;
  order: number;
}

export type SrcAccess = { kind: 'public' } | { kind: 'members' } | { kind: 'staff' } | { kind: 'groups'; groups: string[] };

export interface SrcBoard {
  id: string;
  categoryId: string;
  parentId: string | null;
  name: string;
  description: string;
  order: number;
  redirectUrl: string | null;
  access: SrcAccess;
  countPosts: boolean;
}

export interface SrcModerator {
  boardId: string;
  userId?: string;
  groupId?: string;
}

export interface SrcTopic {
  id: string;
  boardId: string;
  title: string;
  userId: string | null;
  authorName: string;
  createdAt: number;
  views: number;
  pinned: boolean;
  locked: boolean;
  approved: boolean;
  deleted: boolean;
}

export interface SrcPost {
  id: string;
  topicId: string;
  userId: string | null;
  authorName: string;
  createdAt: number;
  ip: string | null;
  body: string;
  approved: boolean;
  deleted: boolean;
  editedAt: number | null;
  editReason: string | null;
}

export interface SrcAttachment {
  id: string;
  postId: string;
  name: string;
  url: string;
  isImage: boolean;
  size: number;
}

export interface SrcPoll {
  topicId: string;
  question: string;
  maxChoices: number;
  allowChange: boolean;
  closesAt: number | null;
  createdAt: number;
  options: Array<{ id: string; label: string; votes: number }>;
  votes: Array<{ userId: string; optionId: string }>;
}

export interface SrcConversation {
  id: string;
  title: string;
  participants: string[];
  messages: Array<{ userId: string | null; authorName: string; createdAt: number; body: string }>;
}

export interface SrcBan {
  kind: 'ip' | 'email';
  value: string;
  reason: string;
  expiresAt: number | null;
}

export interface SourceCounts {
  users: number;
  groups: number;
  categories: number;
  boards: number;
  topics: number;
  posts: number;
  polls: number;
  conversations: number;
  attachments: number;
}

export interface ReaderContext {
  /** Ara depodaki değer → metin (seçilen karakter seti + çift kodlama düzeltmesi) */
  text: (v: SqlValue | undefined) => string;
  /** Eski forumun adresi (görseller, rütbe resimleri, eklentiler için); sonunda / yok */
  baseUrl: string;
  charset: SourceCharset;
}

/** Okuyucu arayüzü. Büyük tablolar (üyeler, konular, mesajlar) üreteçle, sayfa sayfa okunur. */
export interface SourceReader {
  readonly platform: Platform;
  version(): string;
  counts(): SourceCounts;
  /** Karakter seti önizlemesi için örnek dizeler (üye adları, konu başlıkları) */
  samples(): SqlValue[];
  /** Ayarlardan bulunan eski forum adresi */
  guessBaseUrl(): string | null;
  groups(): SrcGroup[];
  users(): Iterable<SrcUser>;
  categories(): SrcCategory[];
  boards(): SrcBoard[];
  moderators(): SrcModerator[];
  topics(): Iterable<SrcTopic>;
  /** Mesajlar kaynak kimliğe göre artan sırada (alıntıların önceki mesajlara çözülebilmesi için) */
  posts(): Iterable<SrcPost>;
  attachments(postId: string): SrcAttachment[];
  polls(): Iterable<SrcPoll>;
  conversations(): Iterable<SrcConversation>;
  bans(): SrcBan[];
}
