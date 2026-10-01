import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().trim().min(1, 'Kullanıcı adı gerekli.').max(50),
  displayName: z.string().trim().max(60).optional().default(''),
  email: z.email('Geçerli bir e-posta adresi girin.').max(254),
  password: z.string().min(1, 'Şifre gerekli.').max(256),
  birthdate: z.string().trim().optional().default(''),
  acceptedPolicyVersionIds: z.array(z.number().int().positive()).max(50).default([]),
  customFields: z.record(z.string(), z.string().max(5000)).default({}),
  /** Honeypot: gerçek kullanıcılar bu alanı boş bırakır. */
  website: z.string().max(200).optional().default(''),
  /** Formun açıldığı an (ms) — çok hızlı gönderimleri engellemek için. */
  formStartedAt: z.number().int().nonnegative().optional(),
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Kullanıcı adı veya e-posta gerekli.').max(254),
  password: z.string().min(1, 'Şifre gerekli.').max(256),
  remember: z.boolean().default(false),
});
export type LoginInput = z.input<typeof loginSchema>;

export const twoFactorCodeSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\s+/g, ''))
  .pipe(z.string().min(6, 'Kod gerekli.').max(20));

export const loginTwoFactorSchema = z.object({
  challenge: z.string().min(10).max(200),
  code: twoFactorCodeSchema,
});

export const forgotPasswordSchema = z.object({
  email: z.email('Geçerli bir e-posta adresi girin.').max(254),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(1).max(256),
});

export const tokenSchema = z.object({
  token: z.string().min(10).max(200),
});

export const resendVerificationSchema = z.object({
  email: z.email('Geçerli bir e-posta adresi girin.').max(254),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(256).optional().default(''),
  newPassword: z.string().min(1, 'Yeni şifre gerekli.').max(256),
});

export const elevateSchema = z.object({
  password: z.string().max(256).optional(),
  code: twoFactorCodeSchema.optional(),
});

export const acceptPoliciesSchema = z.object({
  policyVersionIds: z.array(z.number().int().positive()).min(1).max(50),
});
