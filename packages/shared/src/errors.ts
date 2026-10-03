export const ErrorCode = {
  VALIDATION: 'VALIDATION',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  BAD_ORIGIN: 'BAD_ORIGIN',
  INTERNAL: 'INTERNAL',
  WAF_CHALLENGE: 'WAF_CHALLENGE',
  WAF_BLOCKED: 'WAF_BLOCKED',
  INSTALL_REQUIRED: 'INSTALL_REQUIRED',

  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_PENDING_EMAIL: 'ACCOUNT_PENDING_EMAIL',
  ACCOUNT_PENDING_APPROVAL: 'ACCOUNT_PENDING_APPROVAL',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TWO_FACTOR_INVALID: 'TWO_FACTOR_INVALID',
  ELEVATION_REQUIRED: 'ELEVATION_REQUIRED',

  POLICY_ACCEPTANCE_REQUIRED: 'POLICY_ACCEPTANCE_REQUIRED',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  TWO_FACTOR_SETUP_REQUIRED: 'TWO_FACTOR_SETUP_REQUIRED',
  MAINTENANCE: 'MAINTENANCE',

  BANNED: 'BANNED',
  MUTED: 'MUTED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string>;
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
