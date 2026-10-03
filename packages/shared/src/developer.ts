import { z } from 'zod';

export const API_SCOPES = ['profile', 'email', 'read', 'write', 'messages', 'admin'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_INFO: Record<ApiScope, { label: string; description: string; oauth: boolean }> = {
  profile: { label: 'Temel profil', description: 'Üye numarası, kullanıcı adı, görünen ad, avatar ve gruplar.', oauth: true },
  email: { label: 'E-posta adresi', description: 'Hesabın e-posta adresi ve doğrulanma durumu.', oauth: true },
  read: { label: 'Forumu okuma', description: 'Bölümler, konular, mesajlar, üye profilleri ve arama (üyenin görebildiği kadar).', oauth: true },
  write: { label: 'Üye adına yazma', description: 'Konu açma, yanıt yazma, tepki verme, ankette oy kullanma.', oauth: true },
  messages: { label: 'Özel mesajlar', description: 'Özel mesajları okuma ve gönderme.', oauth: true },
  admin: { label: 'Yönetim API\'si', description: 'Anahtarın bağlı olduğu hesabın yetkileriyle yönetim uç noktaları (yalnızca API anahtarları).', oauth: false },
};

export const OAUTH_SCOPES = API_SCOPES.filter((s) => API_SCOPE_INFO[s].oauth);

const redirectUri = z
  .string()
  .trim()
  .max(500)
  .refine((u) => {
    try {
      const url = new URL(u);
      if (url.hash) return false;
      if (url.protocol === 'https:') return true;
      if (url.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) && !['javascript:', 'data:', 'file:', 'vbscript:'].includes(url.protocol);
    } catch {
      return false;
    }
  }, 'Geçersiz yönlendirme adresi (https:// ya da http://localhost olmalı).');

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .regex(/^https?:\/\//i, 'Adres http(s):// ile başlamalı.')
  .nullable()
  .default(null);

export const oauthClientInput = z.object({
  name: z.string().trim().min(2, 'Ad en az 2 karakter.').max(60),
  description: z.string().trim().max(300).default(''),
  homepageUrl: optionalUrl,
  logoUrl: optionalUrl,
  redirectUris: z.array(redirectUri).min(1, 'En az bir yönlendirme adresi girin.').max(10),
  scopes: z.array(z.enum(API_SCOPES)).min(1, 'En az bir izin seçin.'),
  isConfidential: z.boolean().default(true),
  isTrusted: z.boolean().default(false),
  isEnabled: z.boolean().default(true),
});
export type OAuthClientInput = z.output<typeof oauthClientInput>;

export interface AdminOAuthClient extends OAuthClientInput {
  id: number;
  clientId: string;
  hasSecret: boolean;
  activeUsers: number;
  createdAt: number;
}

export const apiKeyInput = z.object({
  name: z.string().trim().min(2, 'Ad en az 2 karakter.').max(60),
  userId: z.number().int().positive().nullable().default(null),
  scopes: z.array(z.enum(API_SCOPES)).min(1, 'En az bir izin seçin.'),
  expiresAt: z.number().int().nullable().default(null),
});

export interface AdminApiKey {
  id: number;
  name: string;
  prefix: string;
  user: { id: number; username: string; displayName: string } | null;
  scopes: ApiScope[];
  expiresAt: number | null;
  revokedAt: number | null;
  lastUsedAt: number | null;
  lastIp: string | null;
  createdAt: number;
}

export const WEBHOOK_EVENTS = ['topic.created', 'post.created', 'user.registered', 'user.activated', 'user.groupsChanged', 'user.banned'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const WEBHOOK_EVENT_INFO: Record<WebhookEvent, string> = {
  'topic.created': 'Yeni konu açıldı',
  'post.created': 'Konuya yanıt yazıldı',
  'user.registered': 'Yeni üye kaydoldu',
  'user.activated': 'Üyelik etkinleşti (doğrulama / onay sonrası)',
  'user.groupsChanged': 'Üyenin grupları değişti',
  'user.banned': 'Üye yasaklandı',
};

export const webhookInput = z.object({
  name: z.string().trim().min(2, 'Ad en az 2 karakter.').max(60),
  url: z.string().trim().max(500).regex(/^https?:\/\//i, 'Adres http(s):// ile başlamalı.'),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'En az bir olay seçin.'),
  isEnabled: z.boolean().default(true),
});

export interface AdminWebhook {
  id: number;
  name: string;
  url: string;
  events: WebhookEvent[];
  isEnabled: boolean;
  failureCount: number;
  lastStatus: number | null;
  lastDeliveryAt: number | null;
  secretHint: string;
  createdAt: number;
}

export interface WebhookDelivery {
  id: number;
  uuid: string;
  event: string;
  status: 'pending' | 'success' | 'failed';
  responseCode: number | null;
  responseBody: string | null;
  error: string | null;
  attempts: number;
  durationMs: number | null;
  payload: unknown;
  createdAt: number;
  deliveredAt: number | null;
}

export interface OAuthAuthorizeInfo {
  client: { name: string; description: string; homepageUrl: string | null; logoUrl: string | null; isTrusted: boolean };
  scopes: Array<{ key: ApiScope; label: string; description: string }>;
  redirectHost: string;
  alreadyApproved: boolean;
}

export interface AuthorizedApp {
  clientId: string;
  name: string;
  logoUrl: string | null;
  homepageUrl: string | null;
  scopes: ApiScope[];
  approvedAt: number;
  lastUsedAt: number | null;
}

export const SOCIAL_PROVIDERS = [
  { key: 'discord', label: 'Discord', color: '#5865F2' },
  { key: 'google', label: 'Google', color: '#4285F4' },
  { key: 'github', label: 'GitHub', color: '#24292f' },
] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]['key'];

export const socialProvidersInput = z.partialRecord(
  z.enum(['discord', 'google', 'github']),
  z.object({
    enabled: z.boolean(),
    clientId: z.string().trim().max(200).default(''),
    clientSecret: z.string().trim().max(300).optional(),
  }),
);

export interface AdminSocialProvider {
  key: SocialProvider;
  label: string;
  enabled: boolean;
  clientId: string;
  hasSecret: boolean;
  callbackUrl: string;
}

export interface LinkedIdentity {
  provider: SocialProvider;
  email: string | null;
  displayName: string | null;
  createdAt: number;
  lastLoginAt: number | null;
}

export interface SocialSignupInfo {
  provider: SocialProvider;
  suggestedUsername: string;
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string | null;
  displayName: string | null;
}

export const socialCompleteSchema = z.object({
  username: z.string().trim().min(1).max(40),
  email: z.email('Geçerli bir e-posta girin.').optional(),
  acceptedPolicyVersionIds: z.array(z.number().int().positive()).default([]),
});
