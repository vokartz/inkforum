import { z } from 'zod';
import type { UserSummary } from './dto.js';
import { ICON_NAME, type IconNode } from './forum.js';

/**
 * Başvuru sistemi: yönetimin tanımladığı formlar (sorular + gereksinimler), üyelerin başvuruları,
 * inceleme (not, onay / ret) ve onayda otomatik grup ataması.
 */

export const APPLICATION_FIELD_TYPES = ['text', 'textarea', 'select', 'radio', 'checkboxes', 'number', 'url', 'yesno'] as const;
export type ApplicationFieldType = (typeof APPLICATION_FIELD_TYPES)[number];
export const APPLICATION_FIELD_LABELS: Record<ApplicationFieldType, string> = {
  text: 'Kısa metin',
  textarea: 'Uzun metin',
  select: 'Açılır liste',
  radio: 'Tek seçim',
  checkboxes: 'Çoklu seçim',
  number: 'Sayı',
  url: 'Bağlantı',
  yesno: 'Evet / hayır',
};

export const applicationQuestionSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9_-]{1,40}$/, 'Geçersiz soru kimliği.'),
  type: z.enum(APPLICATION_FIELD_TYPES),
  label: z.string().trim().min(1, 'Soru metni gerekli.').max(300),
  help: z.string().trim().max(600).default(''),
  required: z.boolean().default(true),
  options: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  minLength: z.number().int().min(0).max(10_000).default(0),
  maxLength: z.number().int().min(1).max(20_000).default(2000),
});
export type ApplicationQuestion = z.output<typeof applicationQuestionSchema>;

export const applicationRequirementsSchema = z.object({
  /** Üyelik en az kaç günlük olmalı */
  minAccountDays: z.number().int().min(0).max(3650).default(0),
  /** En az mesaj sayısı */
  minPosts: z.number().int().min(0).max(1_000_000).default(0),
  emailVerified: z.boolean().default(true),
  /** Bu gruplardan en az birinde olmalı (boşsa şart yok) */
  requiredGroupIds: z.array(z.number().int().positive()).max(20).default([]),
  /** Bu gruplardaysa başvuramaz */
  blockedGroupIds: z.array(z.number().int().positive()).max(20).default([]),
  /** Uyarı puanı en fazla (boşsa şart yok) */
  maxWarningPoints: z.number().int().min(0).max(10_000).nullable().default(null),
  /** Reddedildikten sonra yeniden başvurmak için beklenecek gün */
  cooldownDays: z.number().int().min(0).max(365).default(7),
});
export type ApplicationRequirements = z.output<typeof applicationRequirementsSchema>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const applicationFormInput = z
  .object({
    slug: z.string().trim().toLowerCase().min(1, 'Adres gerekli.').max(60).regex(SLUG, 'Yalnızca küçük harf, rakam ve tire kullanın.'),
    title: z.string().trim().min(1, 'Başlık gerekli.').max(120),
    description: z.string().max(20_000).default(''),
    icon: z.string().trim().max(60).regex(ICON_NAME, 'Geçersiz ikon.').nullable().default(null),
    isOpen: z.boolean().default(true),
    questions: z.array(applicationQuestionSchema).min(1, 'En az bir soru ekleyin.').max(60),
    requirements: applicationRequirementsSchema.default(applicationRequirementsSchema.parse({})),
    /** Onaylanınca eklenecek grup */
    targetGroupId: z.number().int().positive().nullable().default(null),
    setPrimary: z.boolean().default(false),
    /** Başvuruları inceleyebilecek gruplar (yöneticiler her zaman inceleyebilir) */
    reviewerGroupIds: z.array(z.number().int().positive()).max(20).default([]),
    acceptMessage: z.string().trim().max(2000).default(''),
    rejectMessage: z.string().trim().max(2000).default(''),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .superRefine((v, ctx) => {
    const ids = new Set<string>();
    v.questions.forEach((q, i) => {
      if (ids.has(q.id)) ctx.addIssue({ code: 'custom', path: ['questions', i, 'id'], message: 'Soru kimlikleri benzersiz olmalı.' });
      ids.add(q.id);
      if (['select', 'radio', 'checkboxes'].includes(q.type) && q.options.length < 2) ctx.addIssue({ code: 'custom', path: ['questions', i, 'options'], message: `"${q.label}" için en az iki seçenek girin.` });
      if (q.minLength > q.maxLength) ctx.addIssue({ code: 'custom', path: ['questions', i, 'minLength'], message: 'En az uzunluk en fazladan büyük olamaz.' });
    });
  });
export type ApplicationFormInput = z.output<typeof applicationFormInput>;

export const applicationAnswerValue = z.union([z.string().max(20_000), z.array(z.string().max(200)).max(30), z.number(), z.boolean(), z.null()]);
export const applicationSubmitInput = z.object({ answers: z.record(z.string().max(40), applicationAnswerValue) });
export type ApplicationSubmitInput = z.output<typeof applicationSubmitInput>;

export const applicationDecisionInput = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(2000).default('') });
export const applicationNoteInput = z.object({ body: z.string().trim().min(1, 'Not boş olamaz.').max(4000), internal: z.boolean().default(false) });

export type ApplicationStatus = 'pending' | 'reviewing' | 'approved' | 'rejected' | 'withdrawn';
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: 'Bekliyor',
  reviewing: 'İnceleniyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  withdrawn: 'Geri çekildi',
};

export interface EligibilityCheck {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}
export interface Eligibility {
  ok: boolean;
  checks: EligibilityCheck[];
  /** Başvuramama nedeni (form kapalı, bekleyen başvuru, bekleme süresi…) */
  blocker: string | null;
}

export interface ApplicationFormSummary {
  id: number;
  slug: string;
  title: string;
  icon: string | null;
  iconNodes: IconNode | null;
  excerpt: string;
  isOpen: boolean;
  questionCount: number;
  targetGroup: { id: number; name: string; color: string | null } | null;
  /** Giriş yapmış üye için */
  eligibility: Eligibility | null;
  myLatest: { id: number; status: ApplicationStatus; createdAt: number } | null;
  /** İnceleyiciler için bekleyen başvuru sayısı */
  pendingCount: number | null;
}

export interface ApplicationFormView extends ApplicationFormSummary {
  descriptionHtml: string;
  questions: ApplicationQuestion[];
  requirements: ApplicationRequirements;
  canReview: boolean;
}

export interface AdminApplicationForm extends ApplicationFormInput {
  id: number;
  pendingCount: number;
  totalCount: number;
  updatedAt: number;
}

export interface ApplicationNote {
  id: number;
  user: UserSummary | null;
  body: string;
  isInternal: boolean;
  createdAt: number;
}

export interface ApplicationItem {
  id: number;
  form: { id: number; slug: string; title: string; iconNodes: IconNode | null };
  user: UserSummary | null;
  status: ApplicationStatus;
  reviewer: UserSummary | null;
  decidedBy: UserSummary | null;
  decisionReason: string | null;
  createdAt: number;
  updatedAt: number;
  decidedAt: number | null;
}

export interface ApplicationDetail extends ApplicationItem {
  answers: Array<{ question: ApplicationQuestion; value: string | string[] | number | boolean | null }>;
  notes: ApplicationNote[];
  canReview: boolean;
  canWithdraw: boolean;
  /** İnceleyicilere: başvuranın özeti */
  applicant: { postCount: number; registeredAt: number; warningPoints: number; emailVerified: boolean } | null;
}
