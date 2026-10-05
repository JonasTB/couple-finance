/**
 * Refresh-token rotation rules (ADR-004). Pure; persistence and HTTP live elsewhere.
 *
 * Every successful refresh rotates the token. Presenting a token that was already rotated means
 * either a benign race (two tabs refreshing at once — the browser had not yet stored the newer
 * cookie) or theft. A short grace window separates the two: inside it the client is told to
 * retry; outside it the whole token family is revoked.
 */
export type RefreshTokenRevokedReason = 'LOGOUT' | 'REUSE_DETECTED';

export const ROTATION_GRACE_PERIOD_MS = 10_000;

export interface RefreshTokenState {
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

export type RefreshDecision =
  'ROTATE' | 'REJECT_EXPIRED' | 'REJECT_REVOKED' | 'CONCURRENT_ROTATION' | 'REUSE_DETECTED';

export function decideRefresh(token: RefreshTokenState, now: Date): RefreshDecision {
  if (token.revokedAt) {
    return 'REJECT_REVOKED';
  }
  if (token.rotatedAt) {
    const sinceRotation = now.getTime() - token.rotatedAt.getTime();
    return sinceRotation <= ROTATION_GRACE_PERIOD_MS ? 'CONCURRENT_ROTATION' : 'REUSE_DETECTED';
  }
  if (token.expiresAt.getTime() <= now.getTime()) {
    return 'REJECT_EXPIRED';
  }
  return 'ROTATE';
}
