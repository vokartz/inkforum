/**
 * API hata kodları. Sunucu `{ error: { code, message, fields? } }` döner;
 * istemci kodu kullanarak davranış belirler (ör. politika onayına yönlendirme).
 */
export const ErrorCode = {
  VALIDATION: 'VALIDATION',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  BAD_ORIGIN: 'BAD_ORIGIN',
  INTERNAL: 'INTERNAL',
  /** Güvenlik duvarı: doğrulama gerekli / istek engellendi */
  WAF_CHALLENGE: 'WAF_CHALLENGE',
  WAF_BLOCKED: 'WAF_BLOCKED',
  /** İlk kurulum tamamlanmadı (/install) */
  INSTALL_REQUIRED: 'INSTALL_REQUIRED',

  // Kimlik
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_PENDING_EMAIL: 'ACCOUNT_PENDING_EMAIL',
  ACCOUNT_PENDING_APPROVAL: 'ACCOUNT_PENDING_APPROVAL',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TWO_FACTOR_INVALID: 'TWO_FACTOR_INVALID',
  ELEVATION_REQUIRED: 'ELEVATION_REQUIRED',

  // Uyum (compliance)
  POLICY_ACCEPTANCE_REQUIRED: 'POLICY_ACCEPTANCE_REQUIRED',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  TWO_FACTOR_SETUP_REQUIRED: 'TWO_FACTOR_SETUP_REQUIRED',
  MAINTENANCE: 'MAINTENANCE',

  // Moderasyon
  BANNED: 'BANNED',
  MUTED: 'MUTED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Alan bazlı doğrulama hataları: alan yolu -> mesaj */
    fields?: Record<string, string>;
    /** Ek bilgi (ör. ban bitiş tarihi, bekleyen politika anahtarları) */
    details?: Record<string, unknown>;
  };
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.code === 'string'
  );
}
