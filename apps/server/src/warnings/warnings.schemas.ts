import { z } from 'zod';

export const warningTemplateSchema = z.object({
  title: z.string().trim().min(1, 'Başlık gerekli.').max(80),
  reasonTemplate: z.string().trim().min(1, 'Gerekçe gerekli.').max(1000),
  points: z.number().int().min(0).max(1000),
  expiryDays: z.number().int().min(1).max(3650).nullable().default(null),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type WarningTemplateInput = z.infer<typeof warningTemplateSchema>;

export const warningActionSchema = z
  .object({
    thresholdPoints: z.number().int().min(1).max(10000),
    action: z.enum(['watch', 'moderate', 'mute', 'temp_ban']),
    mode: z.enum(['while_above', 'timed']),
    durationDays: z.number().int().min(1).max(3650).nullable().default(null),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'timed' && v.action !== 'watch' && !v.durationDays) {
      ctx.addIssue({ code: 'custom', path: ['durationDays'], message: 'Süreli eylemler için süre gerekli.' });
    }
    if (v.action === 'temp_ban' && v.mode !== 'timed') {
      ctx.addIssue({ code: 'custom', path: ['mode'], message: 'Geçici yasak yalnızca süreli olabilir.' });
    }
  });
export type WarningActionInput = z.infer<typeof warningActionSchema>;

export const issueWarningSchema = z.object({
  templateId: z.number().int().positive().nullable().default(null),
  points: z.number().int().min(0).max(1000),
  reason: z.string().trim().min(1, 'Gerekçe gerekli.').max(1000),
  messageToUser: z.string().trim().max(2000).nullable().default(null),
  notes: z.string().trim().max(2000).nullable().default(null),
  expiryDays: z.number().int().min(1).max(3650).nullable().default(null),
});
export type IssueWarningInput = z.infer<typeof issueWarningSchema>;

export const revokeWarningSchema = z.object({
  reason: z.string().trim().max(500).nullable().default(null),
});
