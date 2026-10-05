/**
 * Stable, machine-readable API error codes (docs/architecture/API_CONVENTIONS.md §6).
 * Add codes as stages introduce them; never rename or reuse an existing code.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // Authentication (Stage 03)
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  /** Access token expired: the client should refresh the session and retry once. */
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  /**
   * The refresh token was rotated moments ago by a concurrent request (e.g. another tab).
   * Not a security event: the client should retry the refresh once with the newer cookie.
   */
  REFRESH_TOKEN_ROTATED: 'REFRESH_TOKEN_ROTATED',
  // Households & invitations (Stage 04)
  /** The `version` sent with an update is stale: reload and retry. */
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  HOUSEHOLD_FULL: 'HOUSEHOLD_FULL',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  /** Unknown, expired, revoked or already-used invitation (deliberately not distinguished). */
  INVITATION_INVALID: 'INVITATION_INVALID',
  INVITATION_EMAIL_MISMATCH: 'INVITATION_EMAIL_MISMATCH',
  OWNERSHIP_TRANSFER_REQUIRED: 'OWNERSHIP_TRANSFER_REQUIRED',
  // Ledger (Stage 05)
  /** Custom amounts do not add up to the transaction amount. */
  SPLIT_SUM_MISMATCH: 'SPLIT_SUM_MISMATCH',
  /** A participant has no income on the transaction date (INCOME_PROPORTIONAL). */
  INCOME_BASIS_MISSING: 'INCOME_BASIS_MISSING',
  CATEGORY_ARCHIVED: 'CATEGORY_ARCHIVED',
  CATEGORY_NAME_TAKEN: 'CATEGORY_NAME_TAKEN',
  // Commitments (Stage 07)
  /** The occurrence already has a (non-deleted) expense. */
  OCCURRENCE_ALREADY_CONFIRMED: 'OCCURRENCE_ALREADY_CONFIRMED',
  /** The date is not an open occurrence of the recurring expense (outside schedule, paused, ended). */
  OCCURRENCE_NOT_SCHEDULED: 'OCCURRENCE_NOT_SCHEDULED',
  /** Frequency, interval and start date are fixed once an occurrence was confirmed or skipped. */
  RECURRENCE_SCHEDULE_LOCKED: 'RECURRENCE_SCHEDULE_LOCKED',
  /** The installment plan was already cancelled or paid off. */
  INSTALLMENT_PLAN_CLOSED: 'INSTALLMENT_PLAN_CLOSED',
  // Planning (Stage 09)
  /** A withdrawal larger than what the goal holds. */
  GOAL_INSUFFICIENT_BALANCE: 'GOAL_INSUFFICIENT_BALANCE',
  /** Archived goals and plans are read-only until restored. */
  ARCHIVED: 'ARCHIVED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export interface ApiErrorEnvelope {
  error: ApiError;
}
