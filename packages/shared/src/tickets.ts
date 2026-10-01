import { z } from 'zod';
import type { UserSummary } from './dto.js';
import { ICON_NAME, type IconNode } from './forum.js';

/** Destek talepleri (eklenti): kategoriler, sorumlu yetkili grupları, durumlar ve öncelikler. */

export const TICKET_STATUSES = ['open', 'answered', 'customer_reply', 'on_hold', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Yeni',
  answered: 'Yanıtlandı',
  customer_reply: 'Yanıt bekliyor',
  on_hold: 'Beklemede',
  closed: 'Kapalı',
};

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = { low: 'Düşük', normal: 'Normal', high: 'Yüksek', urgent: 'Acil' };

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı.').nullable().default(null);

export const ticketCategoryInput = z.object({
  name: z.string().trim().min(1, 'Ad gerekli.').max(80),
  description: z.string().trim().max(300).default(''),
  icon: z.string().trim().max(60).regex(ICON_NAME, 'Geçersiz ikon.').nullable().default(null),
  color,
  /** Bu kategorideki talepleri görebilen ve yanıtlayabilen gruplar */
  handlerGroupIds: z.array(z.number().int().positive()).max(20).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  defaultPriority: z.enum(TICKET_PRIORITIES).default('normal'),
  /** Yeni talep formunda gösterilen bilgi (BBCode) */
  intro: z.string().max(5000).default(''),
});
export type TicketCategoryInput = z.output<typeof ticketCategoryInput>;

export const ticketCreateInput = z.object({
  categoryId: z.number().int().positive(),
  subject: z.string().trim().min(3, 'Konu en az 3 karakter olmalı.').max(160),
  body: z.string().trim().min(10, 'Lütfen sorunu biraz daha ayrıntılı anlatın.').max(20_000),
  priority: z.enum(TICKET_PRIORITIES).default('normal'),
});
export type TicketCreateInput = z.output<typeof ticketCreateInput>;

export const ticketReplyInput = z.object({
  body: z.string().trim().min(1, 'Mesaj boş olamaz.').max(20_000),
  /** Yetkililer: yalnızca ekibin göreceği not */
  internal: z.boolean().default(false),
  /** Yetkililer: yanıtla birlikte durum değişikliği */
  status: z.enum(TICKET_STATUSES).optional(),
});
export type TicketReplyInput = z.output<typeof ticketReplyInput>;

export const ticketUpdateInput = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  categoryId: z.number().int().positive().optional(),
});
export type TicketUpdateInput = z.output<typeof ticketUpdateInput>;

export interface TicketCategory {
  id: number;
  name: string;
  description: string;
  icon: string | null;
  iconNodes: IconNode | null;
  color: string | null;
  defaultPriority: TicketPriority;
  introHtml: string;
}

export interface AdminTicketCategory extends TicketCategoryInput {
  id: number;
  openCount: number;
  totalCount: number;
}

export interface TicketItem {
  id: number;
  subject: string;
  category: { id: number; name: string; color: string | null; iconNodes: IconNode | null };
  user: UserSummary | null;
  status: TicketStatus;
  priority: TicketPriority;
  assignee: UserSummary | null;
  messageCount: number;
  lastReplyAt: number;
  lastReplyByStaff: boolean;
  createdAt: number;
  closedAt: number | null;
}

export interface TicketMessage {
  id: number;
  user: UserSummary | null;
  html: string;
  isInternal: boolean;
  isStaff: boolean;
  createdAt: number;
}

export interface TicketDetail extends TicketItem {
  messages: TicketMessage[];
  /** Yetkili (kategorinin sorumlu grubunda ya da destek yöneticisi) */
  canManage: boolean;
  canReply: boolean;
  canClose: boolean;
  canReopen: boolean;
  /** Atanabilecek yetkililer (yalnızca yetkililere) */
  staff: UserSummary[];
  categories: Array<{ id: number; name: string }>;
}

export interface TicketDesk {
  items: TicketItem[];
  total: number;
  page: number;
  perPage: number;
  counts: Record<TicketStatus | 'mine' | 'unassigned', number>;
  categories: Array<{ id: number; name: string; open: number }>;
}
