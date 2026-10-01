import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

/**
 * Veritabanı tipleri (elle yazılır; SQLite ve PostgreSQL için ortak).
 * - Zaman damgaları: epoch ms (number)
 * - Bayraklar: smallint 0/1 (yazarken boolean da kabul edilir, BooleanToIntPlugin çevirir)
 * - JSON: text (repository katmanında parse edilir)
 */

type Id = Generated<number>;
/** DB varsayılanı olan bayrak. */
type Flag = ColumnType<number, number | boolean | undefined, number | boolean>;
/** DB varsayılanı olan sayı/metin. */
type Def<T> = ColumnType<T, T | undefined, T>;

// ---------- Altyapı ----------

export interface SettingsTable {
  key: string;
  value_json: string;
  updated_at: number;
  updated_by: number | null;
}

export interface SystemStateTable {
  key: string;
  value: string;
  updated_at: number;
}

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface JobsTable {
  id: Id;
  queue: Def<string>;
  type: string;
  payload_json: string;
  status: Def<JobStatus>;
  priority: Def<number>;
  attempts: Def<number>;
  max_attempts: Def<number>;
  run_at: number;
  locked_by: string | null;
  locked_until: number | null;
  last_error: string | null;
  created_at: number;
  finished_at: number | null;
}

export interface ScheduledTasksTable {
  name: string;
  interval_ms: number;
  next_run_at: number;
  last_run_at: number | null;
  last_status: string | null;
  last_error: string | null;
  locked_until: number | null;
  is_enabled: Flag;
}

export type FilePurpose = 'avatar' | 'group_icon' | 'achievement_icon' | 'profile_field' | 'board_icon' | 'post_image' | 'branding' | 'cover' | 'category_bg' | 'home_block' | 'emoji' | 'board_cover' | 'oauth_logo' | 'page_image' | 'wiki_image';

export interface FilesTable {
  id: Id;
  owner_user_id: number | null;
  purpose: FilePurpose;
  driver: string;
  path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  sha256: string;
  created_at: number;
}

export type AuditLogType = 'admin' | 'moderation' | 'security' | 'user';

export interface AuditLogTable {
  id: Id;
  log_type: AuditLogType;
  action: string;
  actor_id: number | null;
  target_type: string | null;
  target_id: number | null;
  ip: string | null;
  user_agent: string | null;
  data_json: string | null;
  created_at: number;
}

// ---------- Gruplar ----------

export type GroupKind = 'regular' | 'post_count' | 'system';
export type GroupJoinType = 'closed' | 'requestable' | 'free';
export type GroupVisibility = 'visible' | 'hidden' | 'additional_only';

export interface MemberGroupsTable {
  id: Id;
  system_key: string | null;
  name: string;
  description: Def<string>;
  color: string | null;
  icon_file_id: number | null;
  icon_count: Def<number>;
  kind: GroupKind;
  min_posts: number | null;
  join_type: Def<GroupJoinType>;
  is_protected: Flag;
  visibility: Def<GroupVisibility>;
  parent_id: number | null;
  require_2fa: Flag;
  sort_order: Def<number>;
  member_count: Def<number>;
  created_at: number;
  updated_at: number;
}

export type GroupMemberSource = 'manual' | 'request' | 'free' | 'auto';

export interface GroupMembersTable {
  user_id: number;
  group_id: number;
  source: GroupMemberSource;
  added_by: number | null;
  added_at: number;
  expires_at: number | null;
}

export interface GroupModeratorsTable {
  group_id: number;
  user_id: number;
  added_at: number;
}

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface GroupJoinRequestsTable {
  id: Id;
  group_id: number;
  user_id: number;
  reason: Def<string>;
  status: Def<JoinRequestStatus>;
  handled_by: number | null;
  handled_at: number | null;
  response: string | null;
  created_at: number;
}

export interface GroupPermissionsTable {
  group_id: number;
  permission: string;
  value: number;
}

export interface PermissionProfilesTable {
  id: Id;
  /** Sistem profilleri için sabit anahtar (default, read_only, members_only). */
  key: string | null;
  name: string;
  description: Def<string>;
  is_system: Flag;
  created_at: number;
}

export interface PermissionProfileEntriesTable {
  profile_id: number;
  group_id: number;
  permission: string;
  value: number;
}

// ---------- Kullanıcılar ----------

export type UserStatusValue = 'active' | 'pending_email' | 'pending_approval' | 'deactivated';

export interface UsersTable {
  id: Id;
  username: string;
  username_canonical: string;
  display_name: string;
  display_name_canonical: string;
  email: string;
  email_canonical: string;
  password_hash: string;
  must_change_password: Flag;
  email_verified_at: number | null;
  status: UserStatusValue;
  primary_group_id: number | null;
  primary_group_expires_at: number | null;
  post_group_id: number | null;
  post_count: Def<number>;
  warning_points: Def<number>;
  achievement_points: Def<number>;
  unread_notifications: Def<number>;
  is_watched: Flag;
  moderated_until: number | null;
  muted_until: number | null;
  policies_epoch: Def<number>;
  timezone: Def<string>;
  locale: Def<string>;
  theme: Def<string>;
  avatar_file_id: number | null;
  custom_title: string | null;
  username_changed_at: number | null;
  registered_at: number;
  registered_ip: string | null;
  approved_by: number | null;
  approved_at: number | null;
  last_login_at: number | null;
  last_active_at: number | null;
  last_ip: string | null;
  deleted_at: number | null;
  reputation: Def<number>;
  /** "Siteyi okundu say" zamanı. */
  mark_read_at: number | null;
  cover_file_id: number | null;
  /** Kapak fotoğrafının dikey konumu (0–100, yüzde). */
  cover_offset: Def<number>;
  created_at: number;
  updated_at: number;
}

export interface UserProfilesTable {
  user_id: number;
  signature: Def<string>;
  bio: Def<string>;
  birthdate: string | null;
  birth_md: string | null;
  location: Def<string>;
  website_url: Def<string>;
  privacy_json: Def<string>;
  updated_at: number;
}

export interface UserNameHistoryTable {
  id: Id;
  user_id: number;
  old_username: string;
  new_username: string;
  old_display_name: string;
  new_display_name: string;
  changed_by: number | null;
  changed_at: number;
}

export interface UserNotesTable {
  id: Id;
  user_id: number;
  author_id: number | null;
  body: string;
  created_at: number;
}

export type UserTokenType = 'email_verify' | 'password_reset' | 'email_change';

export interface UserTokensTable {
  id: Id;
  user_id: number;
  type: UserTokenType;
  token_hash: string;
  payload_json: string | null;
  expires_at: number;
  used_at: number | null;
  created_ip: string | null;
  created_at: number;
}

export interface SessionsTable {
  id: Id;
  token_hash: string;
  user_id: number;
  is_persistent: Flag;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  absolute_expires_at: number;
  elevated_until: number | null;
  ip: string | null;
  user_agent: string | null;
  device_label: string | null;
}

export interface LoginChallengesTable {
  id: Id;
  token_hash: string;
  user_id: number;
  is_persistent: Flag;
  attempts: Def<number>;
  expires_at: number;
  created_at: number;
  ip: string | null;
}

export type AuthAttemptKind = 'login' | 'reset' | 'register' | '2fa' | 'verify_resend' | 'elevate';

export interface AuthAttemptsTable {
  id: Id;
  kind: AuthAttemptKind;
  identifier: string;
  ip: string | null;
  success: Flag;
  created_at: number;
}

export interface UserTotpTable {
  user_id: number;
  secret_enc: string;
  enabled_at: number | null;
  last_used_step: number | null;
  created_at: number;
}

export interface UserRecoveryCodesTable {
  id: Id;
  user_id: number;
  code_hash: string;
  used_at: number | null;
  created_at: number;
}

// ---------- Politikalar ----------

export interface PoliciesTable {
  id: Id;
  key: string;
  is_required: Flag;
  show_on_register: Flag;
  is_active: Flag;
  sort_order: Def<number>;
  created_at: number;
  updated_at: number;
}

export interface PolicyVersionsTable {
  id: Id;
  policy_id: number;
  version: number;
  requires_reacceptance: Flag;
  change_note: string | null;
  published_at: number | null;
  created_by: number | null;
  created_at: number;
}

export interface PolicyVersionTextsTable {
  policy_version_id: number;
  locale: string;
  title: string;
  body_md: string;
}

export interface PolicyAcceptancesTable {
  id: Id;
  user_id: number;
  policy_version_id: number;
  accepted_at: number;
  ip: string | null;
  user_agent: string | null;
}

// ---------- Özel profil alanları ----------

export type ProfileFieldType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'url' | 'number' | 'date';
export type ProfileFieldVisibility = 'public' | 'members' | 'owner_staff' | 'staff';

export interface ProfileFieldsTable {
  id: Id;
  key: string;
  name: string;
  description: Def<string>;
  type: ProfileFieldType;
  options_json: string | null;
  regex: string | null;
  max_length: Def<number>;
  is_required: Flag;
  show_on_register: Flag;
  show_in_profile: Flag;
  show_in_posts: Flag;
  visibility: Def<ProfileFieldVisibility>;
  editable_by: Def<'owner' | 'staff'>;
  is_active: Flag;
  sort_order: Def<number>;
  created_at: number;
  updated_at: number;
}

export interface UserProfileFieldValuesTable {
  user_id: number;
  field_id: number;
  value: string;
}

// ---------- Yasaklar ----------

export interface BansTable {
  id: Id;
  name: string;
  reason_public: string | null;
  notes_private: string | null;
  cannot_access: Flag;
  cannot_login: Flag;
  cannot_register: Flag;
  cannot_post: Flag;
  expires_at: number | null;
  lifted_at: number | null;
  lifted_by: number | null;
  source: Def<'manual' | 'warning'>;
  source_ref: number | null;
  created_by: number | null;
  created_at: number;
  updated_at: number;
}

export type BanTriggerType = 'ip' | 'ip_range' | 'email' | 'email_domain' | 'username' | 'user';

export interface BanTriggersTable {
  id: Id;
  ban_id: number;
  type: BanTriggerType;
  value: string;
  ip_low: string | null;
  ip_high: string | null;
  user_id: number | null;
  hits: Def<number>;
  last_hit_at: number | null;
  created_at: number;
}

export interface BanLogTable {
  id: Id;
  ban_id: number;
  trigger_id: number | null;
  user_id: number | null;
  ip: string | null;
  email: string | null;
  context: 'access' | 'login' | 'register' | 'post';
  created_at: number;
}

// ---------- Uyarılar ----------

export interface WarningTemplatesTable {
  id: Id;
  title: string;
  reason_template: string;
  points: number;
  expiry_days: number | null;
  is_active: Flag;
  sort_order: Def<number>;
  created_at: number;
  updated_at: number;
}

export interface UserWarningsTable {
  id: Id;
  user_id: number;
  issued_by: number | null;
  template_id: number | null;
  points: number;
  reason: string;
  message_to_user: string | null;
  notes: string | null;
  content_type: string | null;
  content_id: number | null;
  expires_at: number | null;
  expired_at: number | null;
  revoked_at: number | null;
  revoked_by: number | null;
  revoke_reason: string | null;
  created_at: number;
}

export type WarningActionType = 'watch' | 'moderate' | 'mute' | 'temp_ban';
export type WarningActionMode = 'while_above' | 'timed';

export interface WarningActionsTable {
  id: Id;
  threshold_points: number;
  action: WarningActionType;
  mode: WarningActionMode;
  duration_ms: number | null;
  is_active: Flag;
  sort_order: Def<number>;
  created_at: number;
  updated_at: number;
}

export interface WarningActionApplicationsTable {
  id: Id;
  user_id: number;
  action_id: number;
  warning_id: number | null;
  applied_at: number;
  expires_at: number | null;
  reverted_at: number | null;
}

// ---------- Başarılar ----------

export interface AchievementCategoriesTable {
  id: Id;
  name: string;
  description: Def<string>;
  sort_order: Def<number>;
  created_at: number;
}

export interface AchievementsTable {
  id: Id;
  key: string;
  category_id: number | null;
  name: string;
  description: Def<string>;
  icon_file_id: number | null;
  tier: Def<number>;
  series_key: string | null;
  points: Def<number>;
  is_hidden: Flag;
  is_active: Flag;
  criteria_type: string | null;
  criteria_json: string | null;
  awarded_count: Def<number>;
  sort_order: Def<number>;
  created_at: number;
  updated_at: number;
}

export interface UserAchievementsTable {
  id: Id;
  user_id: number;
  achievement_id: number;
  source: 'auto' | 'manual' | 'backfill';
  awarded_by: number | null;
  reason: string | null;
  is_featured: Flag;
  awarded_at: number;
}

// ---------- Bildirimler ----------

export interface NotificationsTable {
  id: Id;
  user_id: number;
  type: string;
  actor_id: number | null;
  data_json: string;
  read_at: number | null;
  created_at: number;
}

export interface NotificationPreferencesTable {
  user_id: number;
  type: string;
  channel: 'web' | 'email';
  enabled: Flag;
}

// ---------- Forum ----------

export interface ForumCategoriesTable {
  id: Id;
  name: string;
  description: Def<string>;
  is_collapsible: Flag;
  sort_order: Def<number>;
  bg_file_id: number | null;
  created_at: number;
  updated_at: number;
}

export type BoardType = 'forum' | 'redirect';
export type BoardIconKind = 'icon' | 'image' | 'none';

export interface BoardsTable {
  id: Id;
  category_id: number;
  parent_id: number | null;
  type: Def<BoardType>;
  name: string;
  slug: string;
  description: Def<string>;
  icon_kind: Def<BoardIconKind>;
  icon_name: string | null;
  icon_color: string | null;
  icon_file_id: number | null;
  redirect_url: string | null;
  redirect_clicks: Def<number>;
  permission_profile_id: number | null;
  count_posts: Flag;
  require_approval_topics: Flag;
  require_approval_posts: Flag;
  private_topics: Flag;
  topic_template_json: Def<string>;
  is_hidden: Flag;
  sort_order: Def<number>;
  topic_count: Def<number>;
  post_count: Def<number>;
  last_post_id: number | null;
  last_post_at: number | null;
  created_at: number;
  updated_at: number;
  cover_file_id: number | null;
  about: Def<string>;
  about_html: Def<string>;
}

export interface BoardModeratorsTable {
  id: Id;
  board_id: number;
  user_id: number | null;
  group_id: number | null;
  created_at: number;
}

export interface TopicPrefixesTable {
  id: Id;
  name: string;
  color: string | null;
  /** null = tüm bölümler */
  board_ids_json: string | null;
  sort_order: Def<number>;
  created_at: number;
}

export interface TopicsTable {
  id: Id;
  board_id: number;
  title: string;
  slug: string;
  prefix_id: number | null;
  user_id: number | null;
  author_name: string;
  first_post_id: number | null;
  last_post_id: number | null;
  last_post_at: number;
  last_poster_id: number | null;
  last_poster_name: string | null;
  reply_count: Def<number>;
  view_count: Def<number>;
  is_pinned: Flag;
  is_locked: Flag;
  is_featured: Flag;
  is_approved: Flag;
  is_hidden: Flag;
  moved_to_topic_id: number | null;
  deleted_at: number | null;
  deleted_by: number | null;
  created_at: number;
  updated_at: number;
}

export interface PostsTable {
  id: Id;
  topic_id: number;
  board_id: number;
  user_id: number | null;
  author_name: string;
  body_bbcode: string;
  body_html: string;
  render_version: Def<number>;
  ip: string | null;
  is_approved: Flag;
  deleted_at: number | null;
  deleted_by: number | null;
  edited_at: number | null;
  edited_by: number | null;
  edit_reason: string | null;
  edit_count: Def<number>;
  created_at: number;
  updated_at: number;
}

export interface PostRevisionsTable {
  id: Id;
  post_id: number;
  user_id: number | null;
  body_bbcode: string;
  reason: string | null;
  created_at: number;
}

export interface TopicReadsTable {
  user_id: number;
  topic_id: number;
  last_read_post_id: number;
  read_at: number;
}

export interface BoardReadsTable {
  user_id: number;
  board_id: number;
  read_at: number;
}

export type NavItemKind = 'builtin' | 'link' | 'dropdown';
export type NavVisibility = 'all' | 'members' | 'guests';

export interface NavItemsTable {
  id: Id;
  parent_id: number | null;
  kind: Def<NavItemKind>;
  builtin_key: string | null;
  label: string;
  url: string | null;
  icon: string | null;
  new_tab: Flag;
  visibility: Def<NavVisibility>;
  permission: string | null;
  is_enabled: Flag;
  sort_order: Def<number>;
  style: Def<'link' | 'button'>;
  created_at: number;
  updated_at: number;
}

export interface HomeBlocksTable {
  id: Id;
  position: Def<string>;
  kind: string;
  title: string | null;
  config_json: Def<string>;
  visibility: Def<NavVisibility>;
  is_enabled: Flag;
  starts_at: number | null;
  ends_at: number | null;
  sort_order: Def<number>;
  created_at: number;
  updated_at: number;
}

export interface ReactionsTable {
  id: Id;
  key: string;
  label: string;
  emoji: string;
  points: Def<number>;
  is_enabled: Flag;
  sort_order: Def<number>;
  created_at: number;
}

export interface PostReactionsTable {
  post_id: number;
  user_id: number;
  reaction_id: number;
  post_author_id: number | null;
  created_at: number;
}

export interface TopicViewersTable {
  topic_id: number;
  user_id: number;
  views: Def<number>;
  first_at: number;
  last_at: number;
}

export interface ConversationsTable {
  id: Id;
  title: string | null;
  created_by: number | null;
  last_message_id: number | null;
  last_message_at: number;
  last_message_user_id: number | null;
  message_count: Def<number>;
  created_at: number;
}

export interface ConversationParticipantsTable {
  conversation_id: number;
  user_id: number;
  last_read_message_id: Def<number>;
  joined_at: number;
  left_at: number | null;
}

export interface ConversationMessagesTable {
  id: Id;
  conversation_id: number;
  user_id: number | null;
  author_name: string;
  body_bbcode: string;
  body_html: string;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
}

export type ContentVisibility = 'all' | 'members' | 'guests' | 'groups';

export interface CustomPagesTable {
  id: Id;
  slug: string;
  title: string;
  format: Def<'bbcode' | 'html' | 'builder'>;
  body: Def<string>;
  body_html: Def<string>;
  layout: Def<'default' | 'wide' | 'blank'>;
  show_title: Flag;
  meta_description: string | null;
  visibility: Def<ContentVisibility>;
  group_ids_json: Def<string>;
  is_published: Flag;
  updated_by: number | null;
  created_at: number;
  updated_at: number;
}

export interface WikiPagesTable {
  id: Id;
  parent_id: number | null;
  slug: string;
  title: string;
  icon: string | null;
  summary: string | null;
  body: Def<string>;
  body_html: Def<string>;
  sort_order: Def<number>;
  is_published: Flag;
  is_locked: Flag;
  view_count: Def<number>;
  created_by: number | null;
  updated_by: number | null;
  created_at: number;
  updated_at: number;
}

export interface WikiRevisionsTable {
  id: Id;
  page_id: number;
  title: string;
  body: Def<string>;
  note: string | null;
  user_id: number | null;
  created_at: number;
}

export interface ApplicationFormsTable {
  id: Id;
  slug: string;
  title: string;
  description: Def<string>;
  description_html: Def<string>;
  icon: string | null;
  is_open: Flag;
  questions_json: Def<string>;
  requirements_json: Def<string>;
  target_group_id: number | null;
  set_primary: Flag;
  reviewer_group_ids_json: Def<string>;
  accept_message: Def<string>;
  reject_message: Def<string>;
  sort_order: Def<number>;
  created_at: number;
  updated_at: number;
}

export interface ApplicationsTable {
  id: Id;
  form_id: number;
  user_id: number;
  status: Def<'pending' | 'reviewing' | 'approved' | 'rejected' | 'withdrawn'>;
  answers_json: Def<string>;
  reviewer_id: number | null;
  decided_by: number | null;
  decision_reason: string | null;
  decided_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ApplicationNotesTable {
  id: Id;
  application_id: number;
  user_id: number | null;
  body: string;
  is_internal: Flag;
  created_at: number;
}

export interface TicketCategoriesTable {
  id: Id;
  name: string;
  description: Def<string>;
  icon: string | null;
  color: string | null;
  handler_group_ids_json: Def<string>;
  is_active: Flag;
  sort_order: Def<number>;
  default_priority: Def<'low' | 'normal' | 'high' | 'urgent'>;
  intro: Def<string>;
  intro_html: Def<string>;
  created_at: number;
  updated_at: number;
}

export interface TicketsTable {
  id: Id;
  category_id: number;
  user_id: number;
  subject: string;
  status: Def<'open' | 'answered' | 'customer_reply' | 'on_hold' | 'closed'>;
  priority: Def<'low' | 'normal' | 'high' | 'urgent'>;
  assignee_id: number | null;
  message_count: Def<number>;
  last_reply_at: number;
  last_reply_by_staff: Flag;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
}

export interface TicketMessagesTable {
  id: Id;
  ticket_id: number;
  user_id: number | null;
  body: string;
  body_html: Def<string>;
  is_internal: Flag;
  is_staff: Flag;
  created_at: number;
}

export interface CustomSnippetsTable {
  id: Id;
  name: string;
  placement: string;
  title: string | null;
  html: Def<string>;
  visibility: Def<ContentVisibility>;
  group_ids_json: Def<string>;
  is_enabled: Flag;
  sort_order: Def<number>;
  created_at: number;
  updated_at: number;
}

export interface TagsTable {
  id: Id;
  name: string;
  slug: string;
  color: string | null;
  topic_count: Def<number>;
  is_official: Flag;
  created_by: number | null;
  created_at: number;
}

export interface TopicTagsTable {
  topic_id: number;
  tag_id: number;
}

export type PollShowResults = 'always' | 'after_vote' | 'after_close';

export interface PollsTable {
  id: Id;
  topic_id: number;
  question: string;
  max_choices: Def<number>;
  allow_change: Flag;
  public_votes: Flag;
  show_results: Def<PollShowResults>;
  closes_at: number | null;
  closed_at: number | null;
  voter_count: Def<number>;
  created_at: number;
}

export interface PollOptionsTable {
  id: Id;
  poll_id: number;
  label: string;
  sort_order: Def<number>;
  vote_count: Def<number>;
}

export interface PollVotesTable {
  poll_id: number;
  option_id: number;
  user_id: number;
  created_at: number;
}

export interface TopicSubscriptionsTable {
  topic_id: number;
  user_id: number;
  created_at: number;
}

export interface CustomEmojisTable {
  id: Id;
  shortcode: string;
  name: string;
  category: Def<string>;
  file_id: number | null;
  url: string;
  is_enabled: Flag;
  sort_order: Def<number>;
  created_by: number | null;
  created_at: number;
}

export interface MailTemplatesTable {
  key: string;
  subject: string;
  body: string;
  updated_by: number | null;
  updated_at: number;
}

export interface OauthClientsTable {
  id: Id;
  client_id: string;
  name: string;
  description: Def<string>;
  homepage_url: string | null;
  logo_url: string | null;
  redirect_uris_json: Def<string>;
  scopes_json: Def<string>;
  is_confidential: Flag;
  secret_hash: string | null;
  is_trusted: Flag;
  is_enabled: Flag;
  created_by: number | null;
  created_at: number;
  updated_at: number;
}

export interface OauthCodesTable {
  code_hash: string;
  client_id: number;
  user_id: number;
  redirect_uri: string;
  scopes_json: string;
  code_challenge: string | null;
  challenge_method: string | null;
  expires_at: number;
  created_at: number;
}

export interface OauthTokensTable {
  id: Id;
  access_hash: string;
  refresh_hash: string | null;
  client_id: number;
  user_id: number | null;
  scopes_json: string;
  expires_at: number;
  refresh_expires_at: number | null;
  revoked_at: number | null;
  last_used_at: number | null;
  created_at: number;
}

export interface OauthConsentsTable {
  client_id: number;
  user_id: number;
  scopes_json: string;
  created_at: number;
  updated_at: number;
}

export interface ApiKeysTable {
  id: Id;
  name: string;
  prefix: string;
  key_hash: string;
  user_id: number;
  scopes_json: string;
  created_by: number | null;
  expires_at: number | null;
  revoked_at: number | null;
  last_used_at: number | null;
  last_ip: string | null;
  created_at: number;
}

export interface WebhooksTable {
  id: Id;
  name: string;
  url: string;
  secret: string;
  events_json: Def<string>;
  is_enabled: Flag;
  failure_count: Def<number>;
  last_status: number | null;
  last_delivery_at: number | null;
  created_by: number | null;
  created_at: number;
  updated_at: number;
}

export interface WebhookDeliveriesTable {
  id: Id;
  webhook_id: number;
  uuid: string;
  event: string;
  payload_json: string;
  status: Def<'pending' | 'success' | 'failed'>;
  response_code: number | null;
  response_body: string | null;
  error: string | null;
  attempts: Def<number>;
  duration_ms: number | null;
  created_at: number;
  delivered_at: number | null;
}

export interface UserIdentitiesTable {
  id: Id;
  user_id: number;
  provider: string;
  subject: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: number;
  last_login_at: number | null;
}

export type ImportRunStatus = 'staging' | 'ready' | 'running' | 'done' | 'failed' | 'cancelled';

export interface ImportRunsTable {
  id: Id;
  platform: Def<string>;
  version: Def<string>;
  source_name: string;
  source_size: Def<number>;
  status: Def<ImportRunStatus>;
  options_json: Def<string>;
  analysis_json: Def<string>;
  stats_json: Def<string>;
  log_json: Def<string>;
  error: string | null;
  created_by: number | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

export interface ImportRedirectsTable {
  kind: string;
  old_id: string;
  new_id: number;
  run_id: number;
}

export interface DB {
  settings: SettingsTable;
  system_state: SystemStateTable;
  jobs: JobsTable;
  scheduled_tasks: ScheduledTasksTable;
  files: FilesTable;
  audit_log: AuditLogTable;

  member_groups: MemberGroupsTable;
  group_members: GroupMembersTable;
  group_moderators: GroupModeratorsTable;
  group_join_requests: GroupJoinRequestsTable;
  group_permissions: GroupPermissionsTable;
  permission_profiles: PermissionProfilesTable;
  permission_profile_entries: PermissionProfileEntriesTable;

  users: UsersTable;
  user_profiles: UserProfilesTable;
  user_name_history: UserNameHistoryTable;
  user_notes: UserNotesTable;
  user_tokens: UserTokensTable;
  sessions: SessionsTable;
  login_challenges: LoginChallengesTable;
  auth_attempts: AuthAttemptsTable;
  user_totp: UserTotpTable;
  user_recovery_codes: UserRecoveryCodesTable;

  policies: PoliciesTable;
  policy_versions: PolicyVersionsTable;
  policy_version_texts: PolicyVersionTextsTable;
  policy_acceptances: PolicyAcceptancesTable;

  profile_fields: ProfileFieldsTable;
  user_profile_field_values: UserProfileFieldValuesTable;

  bans: BansTable;
  ban_triggers: BanTriggersTable;
  ban_log: BanLogTable;

  warning_templates: WarningTemplatesTable;
  user_warnings: UserWarningsTable;
  warning_actions: WarningActionsTable;
  warning_action_applications: WarningActionApplicationsTable;

  achievement_categories: AchievementCategoriesTable;
  achievements: AchievementsTable;
  user_achievements: UserAchievementsTable;

  notifications: NotificationsTable;
  notification_preferences: NotificationPreferencesTable;

  forum_categories: ForumCategoriesTable;
  boards: BoardsTable;
  board_moderators: BoardModeratorsTable;
  topic_prefixes: TopicPrefixesTable;
  topics: TopicsTable;
  posts: PostsTable;
  post_revisions: PostRevisionsTable;
  topic_reads: TopicReadsTable;
  board_reads: BoardReadsTable;

  nav_items: NavItemsTable;
  home_blocks: HomeBlocksTable;
  reactions: ReactionsTable;
  post_reactions: PostReactionsTable;
  topic_viewers: TopicViewersTable;
  conversations: ConversationsTable;
  conversation_participants: ConversationParticipantsTable;
  conversation_messages: ConversationMessagesTable;
  custom_pages: CustomPagesTable;
  custom_snippets: CustomSnippetsTable;
  tags: TagsTable;
  topic_tags: TopicTagsTable;
  polls: PollsTable;
  poll_options: PollOptionsTable;
  poll_votes: PollVotesTable;
  topic_subscriptions: TopicSubscriptionsTable;
  custom_emojis: CustomEmojisTable;
  mail_templates: MailTemplatesTable;
  oauth_clients: OauthClientsTable;
  oauth_codes: OauthCodesTable;
  oauth_tokens: OauthTokensTable;
  oauth_consents: OauthConsentsTable;
  api_keys: ApiKeysTable;
  webhooks: WebhooksTable;
  webhook_deliveries: WebhookDeliveriesTable;
  user_identities: UserIdentitiesTable;
  wiki_pages: WikiPagesTable;
  wiki_revisions: WikiRevisionsTable;
  application_forms: ApplicationFormsTable;
  applications: ApplicationsTable;
  application_notes: ApplicationNotesTable;
  ticket_categories: TicketCategoriesTable;
  tickets: TicketsTable;
  ticket_messages: TicketMessagesTable;
  import_runs: ImportRunsTable;
  import_redirects: ImportRedirectsTable;
}

export type Row<T extends keyof DB> = Selectable<DB[T]>;
export type NewRow<T extends keyof DB> = Insertable<DB[T]>;
export type RowUpdate<T extends keyof DB> = Updateable<DB[T]>;
