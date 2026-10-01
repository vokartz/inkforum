import { z } from 'zod';
import type { UserSummary } from './dto.js';
import type { Paginated } from './validation.js';

/** Gelen kutusundaki konuşma */
export interface ConversationListItem {
  id: number;
  title: string | null;
  /** Görüntüleyen dışındaki etkin katılımcılar (en fazla 5) */
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
  /** Konuşmadan ayrıldıysa zamanı */
  leftAt: number | null;
  /** Okuduğu son mesaj (okundu bilgisi için) */
  lastReadMessageId: number;
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
  /** Onay bekleyen konu/mesaj (yalnızca onaylayabildiği bölümler; diğer üyelerde 0) */
  modQueue: number;
}
