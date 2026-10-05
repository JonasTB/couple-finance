import { decideRefresh, ROTATION_GRACE_PERIOD_MS } from './refresh-token-policy';

const now = new Date('2026-10-04T12:00:00.000Z');
const later = (ms: number) => new Date(now.getTime() + ms);
const earlier = (ms: number) => new Date(now.getTime() - ms);

describe('decideRefresh', () => {
  const active = { expiresAt: later(60_000), rotatedAt: null, revokedAt: null };

  it('rotates an active token', () => {
    expect(decideRefresh(active, now)).toBe('ROTATE');
  });

  it('rejects an expired token (expiry instant is exclusive)', () => {
    expect(decideRefresh({ ...active, expiresAt: now }, now)).toBe('REJECT_EXPIRED');
    expect(decideRefresh({ ...active, expiresAt: earlier(1) }, now)).toBe('REJECT_EXPIRED');
  });

  it('rejects a revoked token, even if it was also rotated', () => {
    expect(decideRefresh({ ...active, revokedAt: earlier(1) }, now)).toBe('REJECT_REVOKED');
    expect(decideRefresh({ ...active, rotatedAt: earlier(1), revokedAt: earlier(1) }, now)).toBe(
      'REJECT_REVOKED',
    );
  });

  it('treats a replay inside the grace window as a concurrent rotation', () => {
    expect(decideRefresh({ ...active, rotatedAt: earlier(0) }, now)).toBe('CONCURRENT_ROTATION');
    expect(decideRefresh({ ...active, rotatedAt: earlier(ROTATION_GRACE_PERIOD_MS) }, now)).toBe(
      'CONCURRENT_ROTATION',
    );
  });

  it('detects reuse after the grace window', () => {
    expect(
      decideRefresh({ ...active, rotatedAt: earlier(ROTATION_GRACE_PERIOD_MS + 1) }, now),
    ).toBe('REUSE_DETECTED');
  });

  it('detects reuse of a rotated token even after it expired', () => {
    expect(
      decideRefresh({ expiresAt: earlier(1), rotatedAt: earlier(60_000), revokedAt: null }, now),
    ).toBe('REUSE_DETECTED');
  });
});
