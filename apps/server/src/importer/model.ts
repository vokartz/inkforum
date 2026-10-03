/* eslint-disable no-control-regex -- işaretçiler bilerek kontrol karakterleriyle yazılır */
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
  iconUrl: string | null;
  iconCount: number;
  role: GroupRole;
  minPosts: number | null;
  hidden: boolean;
}

export interface SrcUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
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
  text: (v: SqlValue | undefined) => string;
  baseUrl: string;
  charset: SourceCharset;
}

export interface SourceReader {
  readonly platform: Platform;
  version(): string;
  counts(): SourceCounts;
  samples(): SqlValue[];
  guessBaseUrl(): string | null;
  groups(): SrcGroup[];
  users(): Iterable<SrcUser>;
  categories(): SrcCategory[];
  boards(): SrcBoard[];
  moderators(): SrcModerator[];
  topics(): Iterable<SrcTopic>;
  posts(): Iterable<SrcPost>;
  attachments(postId: string): SrcAttachment[];
  polls(): Iterable<SrcPoll>;
  conversations(): Iterable<SrcConversation>;
  bans(): SrcBan[];
}
