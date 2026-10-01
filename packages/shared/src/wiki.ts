import { z } from 'zod';
import type { UserSummary } from './dto.js';
import { ICON_NAME, type IconNode } from './forum.js';

/** Wiki: iç içe sayfalar. Adres = üst sayfaların kısa adları: /wiki/kurallar/rol-kurallari */

export const WIKI_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const wikiPageInput = z.object({
  title: z.string().trim().min(1, 'Başlık gerekli.').max(120),
  slug: z.string().trim().toLowerCase().min(1, 'Adres gerekli.').max(60).regex(WIKI_SLUG, 'Yalnızca küçük harf, rakam ve tire kullanın.'),
  parentId: z.number().int().positive().nullable().default(null),
  /** Phosphor ikon adı (ör. book-open-text) */
  icon: z.string().trim().max(60).regex(ICON_NAME, 'Geçersiz ikon.').nullable().default(null),
  summary: z.string().trim().max(300).nullable().default(null),
  body: z.string().max(300_000, 'En fazla 300.000 karakter.').default(''),
  isPublished: z.boolean().default(true),
  isLocked: z.boolean().default(false),
  /** Geçmişte görünen kısa değişiklik notu */
  note: z.string().trim().max(200).nullable().default(null),
});
export type WikiPageInput = z.output<typeof wikiPageInput>;

export const wikiReorderInput = z.object({
  items: z
    .array(z.object({ id: z.number().int().positive(), parentId: z.number().int().positive().nullable(), sortOrder: z.number().int().min(0).max(100_000) }))
    .max(5000),
});
export type WikiReorderInput = z.output<typeof wikiReorderInput>;

export interface WikiTreeNode {
  id: number;
  parentId: number | null;
  slug: string;
  /** /wiki/… adresi (baştaki /wiki olmadan: "kurallar/rol-kurallari") */
  path: string;
  title: string;
  icon: string | null;
  iconNodes: IconNode | null;
  summary: string | null;
  sortOrder: number;
  isPublished: boolean;
  updatedAt: number;
  children: WikiTreeNode[];
}

export interface WikiLink {
  title: string;
  path: string;
  icon: string | null;
  iconNodes: IconNode | null;
}

export interface WikiPageView {
  id: number;
  parentId: number | null;
  slug: string;
  path: string;
  title: string;
  icon: string | null;
  iconNodes: IconNode | null;
  summary: string | null;
  html: string;
  /** Düzenleme için (yalnızca düzenleyebilenlere) */
  body: string | null;
  isPublished: boolean;
  isLocked: boolean;
  views: number;
  createdAt: number;
  updatedAt: number;
  updatedBy: UserSummary | null;
  revisionCount: number;
  breadcrumbs: WikiLink[];
  children: Array<WikiLink & { summary: string | null }>;
  prev: WikiLink | null;
  next: WikiLink | null;
  canEdit: boolean;
  canManage: boolean;
}

export interface WikiIndex {
  title: string;
  description: string;
  tree: WikiTreeNode[];
  recent: Array<WikiLink & { updatedAt: number; updatedBy: UserSummary | null }>;
  pageCount: number;
  canEdit: boolean;
  canManage: boolean;
}

export interface WikiRevisionItem {
  id: number;
  title: string;
  note: string | null;
  user: UserSummary | null;
  createdAt: number;
  size: number;
}

export interface WikiRevisionDetail extends WikiRevisionItem {
  body: string;
  html: string;
}
