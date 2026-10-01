import { z } from 'zod';
import { hexColor } from '@forum/shared';

export const groupInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Grup adı gerekli.').max(50),
    description: z.string().trim().max(500).default(''),
    color: hexColor.nullable().default(null),
    iconCount: z.number().int().min(0).max(10).default(0),
    kind: z.enum(['regular', 'post_count']).default('regular'),
    minPosts: z.number().int().min(0).max(10_000_000).nullable().default(null),
    joinType: z.enum(['closed', 'requestable', 'free']).default('closed'),
    visibility: z.enum(['visible', 'hidden', 'additional_only']).default('visible'),
    parentId: z.number().int().positive().nullable().default(null),
    require2fa: z.boolean().default(false),
    sortOrder: z.number().int().min(-1000).max(1000).default(0),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'post_count' && v.minPosts === null) {
      ctx.addIssue({ code: 'custom', path: ['minPosts'], message: 'Mesaj grubu için minimum mesaj sayısı gerekli.' });
    }
  });
export type GroupInput = z.infer<typeof groupInputSchema>;

export const addMemberSchema = z.object({
  userId: z.number().int().positive(),
  asPrimary: z.boolean().default(false),
  /** Süreli üyelik: bitiş zamanı (ms). */
  expiresAt: z.number().int().positive().nullable().default(null),
});

export const joinRequestSchema = z.object({
  reason: z.string().trim().max(500).default(''),
});

export const handleRequestSchema = z.object({
  approve: z.boolean(),
  response: z.string().trim().max(500).nullable().default(null),
});

export const moderatorsSchema = z.object({
  userIds: z.array(z.number().int().positive()).max(50),
});

export const userGroupsSchema = z.object({
  primaryGroupId: z.number().int().positive().nullable(),
  primaryExpiresAt: z.number().int().positive().nullable().default(null),
  additional: z
    .array(z.object({ groupId: z.number().int().positive(), expiresAt: z.number().int().positive().nullable().default(null) }))
    .max(50),
});
