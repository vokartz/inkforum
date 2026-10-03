import { z } from 'zod';
import type { UserSummary } from './dto.js';
import type { Paginated } from './validation.js';

export interface ConversationListItem {
  id: number;
  title: string | null;
  participants: UserSummary[];
  participantCount: number;
  lastMessage: { author: UserSummary | null; authorName: string; excerpt: string; at: number } | null;
  unread: boolean;
  messageCount: number;
}

export interface ConversationMessage {
  id: number;
  author: UserSummary | null;
  authorName: string;
  html: string;
  createdAt: number;
  isMine: boolean;
}

export interface ConversationParticipant {
  user: UserSummary;
  isCreator: boolean;
  leftAt: number | null;
  lastReadMessageId: number;
  lastReadAt: number | null;
}

export interface ConversationDetail {
  id: number;
  title: string | null;
  participants: ConversationParticipant[];
  messages: Paginated<ConversationMessage>;
  can: { reply: boolean; invite: boolean };
  replyBlockedReason: string | null;
  limits: { maxLength: number; maxRecipients: number };
}

export const newConversationSchema = z.object({
  recipientIds: z.array(z.number().int().positive()).min(1, 'En az bir alıcı seçin.').max(50),
  title: z.string().trim().max(100).optional().default(''),
  body: z.string().trim().min(1, 'Mesaj boş olamaz.').max(50000),
});
export type NewConversationInput = z.output<typeof newConversationSchema>;

export const conversationReplySchema = z.object({
  body: z.string().trim().min(1, 'Mesaj boş olamaz.').max(50000),
});

export const conversationInviteSchema = z.object({
  userIds: z.array(z.number().int().positive()).min(1).max(50),
});

export interface MeCounters {
  notifications: number;
  messages: number;
  modQueue: number;
}

export type RealtimeEvent =
  | { type: 'hello' }
  | { type: 'notification'; notificationType: string }
  | { type: 'message'; conversationId: number; messageId: number; title: string; from: { id: number; name: string; avatarUrl: string | null }; excerpt: string }
  | { type: 'conversationRead'; conversationId: number; userId: number; messageId: number }
  | { type: 'counters' };
