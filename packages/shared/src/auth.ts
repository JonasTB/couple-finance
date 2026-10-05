/** Public projection of the authenticated user. */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  /** Instant in ISO-8601 UTC. */
  createdAt: string;
}

/** Body of a successful register/login/refresh. The refresh token travels only as a cookie. */
export interface AuthSession {
  accessToken: string;
  /** Instant in ISO-8601 UTC when the access token stops being accepted. */
  accessTokenExpiresAt: string;
  user: UserProfile;
}

/** Header required on cookie-authenticated auth endpoints (CSRF defense, ADR-004). */
export const AUTH_CSRF_HEADER = 'X-Requested-With';
export const AUTH_CSRF_HEADER_VALUE = 'couple-finance';

/** Password length bounds enforced by the API (ADR-004). */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MAX_LENGTH = 60;
