import { z } from 'zod';
import type { PostReactionCount, ReactionDef } from './reactions.js';
import type { GroupBadge, UserSummary } from './dto.js';
import type { Paginated } from './validation.js';
import { hexColor } from './validation.js';
import type { PollView, TopicTag } from './topics-extra.js';
import { pollInputSchema, tagsInputSchema } from './topics-extra.js';

export type BoardIconKind = 'icon' | 'image' | 'none';

export type IconNode = Array<[string, Record<string, string | number>]>;

export interface BoardIcon {
  kind: BoardIconKind;
  name: string | null;
  nodes: IconNode | null;
  color: string | null;
  url: string | null;
}

export interface Breadcrumb {
  label: string;
  href: string;
}

export interface TopicPrefix {
  id: number;
  name: string;
  color: string | null;
}

export interface LastPostInfo {
  postId: number;
  topicId: number;
  topicTitle: string;
  topicSlug: string;
  at: number;
  author: UserSummary | null;
  authorName: string;
}

export interface BoardChild {
  id: number;
  name: string;
  slug: string;
  type: 'forum' | 'redirect';
  unread: boolean;
}

export interface BoardModerators {
  users: UserSummary[];
  groups: GroupBadge[];
}

export interface BoardSummary {
  id: number;
  name: string;
  slug: string;
  description: string;
  type: 'forum' | 'redirect';
  icon: BoardIcon;
  redirectUrl: string | null;
  redirectClicks: number;
  topicCount: number;
  postCount: number;
  lastPost: LastPostInfo | null;
  unread: boolean;
  children: BoardChild[];
  moderators: BoardModerators;
}

export interface ForumCategory {
  id: number;
  name: string;
  description: string;
  isCollapsible: boolean;
  background: string | null;
  boards: BoardSummary[];
}

export interface ForumStats {
  topics: number;
  posts: number;
  members: number;
  newestMember: UserSummary | null;
}

export interface OnlineUser extends UserSummary {
  hidden: boolean;
  lastActiveAt?: number;
}

export interface OnlineSummary {
  users: OnlineUser[];
  total: number;
  hiddenCount: number;
  guests: number;
  windowMinutes: number;
}

export interface ForumIndex {
  categories: ForumCategory[];
  stats: ForumStats;
  online: OnlineSummary | null;
  postableBoards: Array<{ id: number; name: string; category: string }>;
}

export interface RecentTopicItem {
  topicId: number;
  postId: number | null;
  title: string;
  slug: string;
  board: { id: number; name: string; slug: string };
  replyCount: number;
  at: number;
  author: UserSummary | null;
  authorName: string;
  excerpt: string;
  unread: boolean;
}

export interface TopicListItem {
  id: number;
  boardId: number;
  title: string;
  slug: string;
  prefix: TopicPrefix | null;
  author: UserSummary | null;
  authorName: string;
  createdAt: number;
  replyCount: number;
  viewCount: number;
  isPinned: boolean;
  isLocked: boolean;
  isFeatured: boolean;
  isApproved: boolean;
  isHidden: boolean;
  isDeleted: boolean;
  isMoved: boolean;
  movedToTopicId: number | null;
  lastPost: { postId: number | null; at: number; author: UserSummary | null; authorName: string };
  unread: boolean;
  pages: number;
  hot: boolean;
  tags: TopicTag[];
  hasPoll: boolean;
}

export interface BoardPermissions {
  view: boolean;
  createTopic: boolean;
  reply: boolean;
  images: boolean;
  moderate: boolean;
  pin: boolean;
  lock: boolean;
  move: boolean;
  merge: boolean;
  editTopic: boolean;
  deleteTopic: boolean;
  approve: boolean;
  viewDeleted: boolean;
  poll: boolean;
  vote: boolean;
}

export interface BoardDetail {
  id: number;
  name: string;
  slug: string;
  description: string;
  type: 'forum' | 'redirect';
  icon: BoardIcon;
  categoryId: number;
  parentId: number | null;
  topicCount: number;
  postCount: number;
  requireApprovalTopics: boolean;
  requireApprovalPosts: boolean;
  moderators: BoardModerators;
  cover: string | null;
  aboutHtml: string;
}

export type TopicSort = 'last_post' | 'created' | 'replies' | 'views' | 'title';

export interface BoardPage {
  board: BoardDetail;
  breadcrumbs: Breadcrumb[];
  children: BoardSummary[];
  pinned: TopicListItem[];
  topics: Paginated<TopicListItem>;
  prefixes: TopicPrefix[];
  can: BoardPermissions;
  sort: TopicSort;
  dir: 'asc' | 'desc';
  prefixId: number | null;
}

export interface PostAuthor extends UserSummary {
  postCount: number;
  registeredAt: number;
  achievementPoints: number;
  reputation: number;
  groups: GroupBadge[];
  signatureHtml: string | null;
  isOnline: boolean;
  warningPoints: number | null;
}

export interface PostItem {
  id: number;
  number: number;
  isFirst: boolean;
  author: PostAuthor | null;
  authorName: string;
  html: string;
  createdAt: number;
  editedAt: number | null;
  editedByName: string | null;
  editReason: string | null;
  editCount: number;
  isApproved: boolean;
  isDeleted: boolean;
  can: { edit: boolean; delete: boolean; history: boolean; approve: boolean; restore: boolean; react: boolean };
  reactions: PostReactionCount[];
  myReaction: number | null;
}

export interface TopicDetail {
  id: number;
  boardId: number;
  title: string;
  slug: string;
  prefix: TopicPrefix | null;
  author: UserSummary | null;
  authorName: string;
  createdAt: number;
  replyCount: number;
  viewCount: number;
  isPinned: boolean;
  isLocked: boolean;
  isFeatured: boolean;
  isApproved: boolean;
  isHidden: boolean;
  isDeleted: boolean;
  firstPostId: number | null;
  lastPostId: number | null;
}

export interface TopicPage {
  topic: TopicDetail;
  board: { id: number; name: string; slug: string };
  moderators: BoardModerators;
  reactions: ReactionDef[];
  breadcrumbs: Breadcrumb[];
  posts: Paginated<PostItem>;
  can: BoardPermissions & { replyLocked: boolean; editOwnTopic: boolean; lockOwn: boolean };
  firstUnreadPostId: number | null;
  prefixes: TopicPrefix[];
  replyBlockedReason: string | null;
  limits: ForumLimits;
  tags: TopicTag[];
  poll: PollView | null;
  subscribed: boolean;
  tagging: TaggingOptions;
}

export interface TaggingOptions {
  enabled: boolean;
  max: number;
  allowNew: boolean;
}

export interface ForumLimits {
  titleMaxLength: number;
  postMaxLength: number;
  imageMaxKb: number;
}

export interface PostRevisionItem {
  id: number;
  user: UserSummary | null;
  bbcode: string;
  html: string;
  reason: string | null;
  createdAt: number;
}

export interface PostLocation {
  topicId: number;
  topicSlug: string;
  page: number;
  postId: number;
}

export interface UnreadTopicItem extends TopicListItem {
  board: { id: number; name: string; slug: string };
  firstUnreadPostId: number | null;
}

export interface NewTopicContext {
  board: BoardDetail;
  breadcrumbs: Breadcrumb[];
  prefixes: TopicPrefix[];
  can: BoardPermissions;
  limits: ForumLimits;
  tagging: TaggingOptions;
  popularTags: TopicTag[];
  pollMaxOptions: number;
  template: TopicTemplate;
  privateTopics: boolean;
}

export interface AdminBoard {
  id: number;
  categoryId: number;
  parentId: number | null;
  type: 'forum' | 'redirect';
  name: string;
  slug: string;
  description: string;
  icon: BoardIcon;
  redirectUrl: string | null;
  redirectClicks: number;
  permissionProfileId: number | null;
  countPosts: boolean;
  requireApprovalTopics: boolean;
  requireApprovalPosts: boolean;
  privateTopics: boolean;
  topicTemplate: TopicTemplate;
  isHidden: boolean;
  sortOrder: number;
  topicCount: number;
  postCount: number;
  moderators: Array<{ id: number; kind: 'user' | 'group'; user: UserSummary | null; group: GroupBadge | null }>;
  cover: string | null;
  about: string;
}

export interface AdminCategory {
  id: number;
  name: string;
  description: string;
  isCollapsible: boolean;
  background: string | null;
  sortOrder: number;
  boards: AdminBoard[];
}

export interface PermissionProfileSummary {
  id: number;
  key: string | null;
  name: string;
  description: string;
  isSystem: boolean;
  boardCount: number;
}

export const ICON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const topicTitleSchema = z
  .string()
  .trim()
  .min(3, 'Başlık en az 3 karakter olmalı.')
  .max(150, 'Başlık çok uzun.');

export const postBodySchema = z.string().max(200_000, 'Mesaj çok uzun.');

export const TOPIC_FIELD_TYPES = ['text', 'textarea', 'number', 'url', 'select', 'radio', 'checkbox'] as const;
export type TopicFieldType = (typeof TOPIC_FIELD_TYPES)[number];

export const topicTemplateFieldSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9_]{1,32}$/, 'Alan kimliği küçük harf, rakam ve _ olmalı.'),
  label: z.string().trim().min(1, 'Soru gerekli.').max(150),
  hint: z.string().trim().max(300).default(''),
  type: z.enum(TOPIC_FIELD_TYPES).default('text'),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  placeholder: z.string().trim().max(150).default(''),
});
export type TopicTemplateField = z.output<typeof topicTemplateFieldSchema>;

export const topicTemplateSchema = z
  .object({
    enabled: z.boolean().default(false),
    intro: z.string().trim().max(2000).default(''),
    titleTemplate: z.string().trim().max(150).default(''),
    fields: z.array(topicTemplateFieldSchema).max(30).default([]),
    allowMessage: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    const ids = new Set<string>();
    v.fields.forEach((f, i) => {
      if (ids.has(f.id)) ctx.addIssue({ code: 'custom', path: ['fields', i, 'id'], message: 'Alan kimlikleri benzersiz olmalı.' });
      ids.add(f.id);
      if ((f.type === 'select' || f.type === 'radio' || f.type === 'checkbox') && !f.options.length) {
        ctx.addIssue({ code: 'custom', path: ['fields', i, 'options'], message: 'Seçmeli sorular için en az bir seçenek ekleyin.' });
      }
    });
  });
export type TopicTemplate = z.output<typeof topicTemplateSchema>;

export const EMPTY_TOPIC_TEMPLATE: TopicTemplate = { enabled: false, intro: '', titleTemplate: '', fields: [], allowMessage: true };

export function parseTopicTemplate(json: string | null | undefined): TopicTemplate {
  if (!json) return EMPTY_TOPIC_TEMPLATE;
  try {
    const r = topicTemplateSchema.safeParse(JSON.parse(json));
    return r.success ? r.data : EMPTY_TOPIC_TEMPLATE;
  } catch {
    return EMPTY_TOPIC_TEMPLATE;
  }
}

export const topicAnswersSchema = z.record(z.string().max(32), z.union([z.string().max(10_000), z.array(z.string().max(100)).max(30)]));

export const createTopicSchema = z.object({
  title: z.string().trim().max(150, 'Başlık çok uzun.'),
  body: postBodySchema,
  answers: topicAnswersSchema.optional(),
  prefixId: z.number().int().positive().nullable().default(null),
  pinned: z.boolean().optional(),
  locked: z.boolean().optional(),
  tags: tagsInputSchema,
  poll: pollInputSchema.nullable().default(null),
  subscribe: z.boolean().default(true),
});

export const replySchema = z.object({
  body: postBodySchema,
});

export const editPostSchema = z.object({
  body: postBodySchema,
  reason: z.string().trim().max(200).optional().default(''),
  title: topicTitleSchema.optional(),
  prefixId: z.number().int().positive().nullable().optional(),
  tags: tagsInputSchema.optional(),
});

export const topicListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  sort: z.enum(['last_post', 'created', 'replies', 'views', 'title']).default('last_post'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  prefix: z.coerce.number().int().positive().optional(),
});

export const moveTopicSchema = z.object({
  boardId: z.number().int().positive(),
  leaveRedirect: z.boolean().default(false),
});

export const mergeTopicSchema = z.object({
  targetTopicId: z.number().int().positive(),
});

export const boardIconSchema = z.object({
  kind: z.preprocess((v) => (v === 'lucide' ? 'icon' : v), z.enum(['icon', 'image', 'none'])),
  name: z.string().trim().regex(ICON_NAME, 'Geçersiz ikon adı.').max(60).nullable().default(null),
  color: hexColor.nullable().default(null),
});

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Kategori adı gerekli.').max(80),
  description: z.string().trim().max(300).default(''),
  isCollapsible: z.boolean().default(true),
});

export const boardInputSchema = z
  .object({
    categoryId: z.number().int().positive(),
    parentId: z.number().int().positive().nullable().default(null),
    type: z.enum(['forum', 'redirect']).default('forum'),
    name: z.string().trim().min(1, 'Bölüm adı gerekli.').max(80),
    description: z.string().trim().max(500).default(''),
    icon: boardIconSchema.default({ kind: 'icon', name: 'chats-circle', color: null }),
    redirectUrl: z.string().trim().max(500).regex(/^(https?:\/\/[^\s]+|\/(?![\\/])[^\s]*)$/i, 'Adres http(s):// ya da / ile başlamalı.').nullable().default(null),
    permissionProfileId: z.number().int().positive().nullable().default(null),
    about: z.string().max(20_000, 'Açıklama çok uzun.').default(''),
    countPosts: z.boolean().default(true),
    requireApprovalTopics: z.boolean().default(false),
    requireApprovalPosts: z.boolean().default(false),
    privateTopics: z.boolean().default(false),
    topicTemplate: topicTemplateSchema.default(EMPTY_TOPIC_TEMPLATE),
    isHidden: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'redirect' && !v.redirectUrl) {
      ctx.addIssue({ code: 'custom', path: ['redirectUrl'], message: 'Yönlendirme adresi gerekli.' });
    }
    if (v.redirectUrl && !/^(https?:\/\/|\/)/i.test(v.redirectUrl)) {
      ctx.addIssue({ code: 'custom', path: ['redirectUrl'], message: 'Adres http(s):// veya / ile başlamalı.' });
    }
  });

export const reorderSchema = z.object({
  categories: z.array(
    z.object({
      id: z.number().int().positive(),
      boards: z.array(z.object({ id: z.number().int().positive(), parentId: z.number().int().positive().nullable() })),
    }),
  ),
});

export const prefixInputSchema = z.object({
  name: z.string().trim().min(1, 'Önek adı gerekli.').max(40),
  color: hexColor.nullable().default(null),
  boardIds: z.array(z.number().int().positive()).nullable().default(null),
});

export const profileInputSchema = z.object({
  name: z.string().trim().min(1, 'Profil adı gerekli.').max(80),
  description: z.string().trim().max(300).default(''),
  copyFromId: z.number().int().positive().nullable().default(null),
});

export const boardModeratorsSchema = z.object({
  userIds: z.array(z.number().int().positive()).max(50).default([]),
  groupIds: z.array(z.number().int().positive()).max(50).default([]),
});

export interface ModQueueItem {
  postId: number;
  topicId: number;
  topicTitle: string;
  topicSlug: string;
  isTopic: boolean;
  isHidden: boolean;
  board: { id: number; name: string; slug: string };
  author: UserSummary | null;
  authorName: string;
  excerpt: string;
  createdAt: number;
}

export interface ModQueuePage {
  items: ModQueueItem[];
  total: number;
  page: number;
  perPage: number;
}

export interface TopicMember {
  user: UserSummary;
  addedBy: UserSummary | null;
  addedAt: number;
}
