import { type ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UuidV7IdGenerator } from '../../../common/ids/id-generator';
import { Clock } from '../../../common/time/clock';
import { type Env } from '../../../config/env';
import { AccessTokens } from './access-tokens';

class FixedClock extends Clock {
  constructor(public current: Date) {
    super();
  }
  now(): Date {
    return this.current;
  }
}

const SECRET = 'unit-test-secret-with-more-than-32-characters';
const config = { get: () => 900 } as unknown as ConfigService<Env, true>;

function setup() {
  const clock = new FixedClock(new Date('2026-10-04T12:00:00.000Z'));
  const jwt = new JwtService({ secret: SECRET });
  return { clock, jwt, tokens: new AccessTokens(jwt, new UuidV7IdGenerator(), clock, config) };
}

/** Machine code of the error thrown by `fn`, if any. */
function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('AccessTokens', () => {
  it('issues a token that expires after the configured TTL and verifies to the user id', () => {
    const { tokens } = setup();
    const issued = tokens.issue('user-1');
    expect(issued.expiresAt.toISOString()).toBe('2026-10-04T12:15:00.000Z');
    expect(tokens.verify(issued.token)).toBe('user-1');
  });

  it('carries only identity claims (no household or role data)', () => {
    const { tokens, jwt } = setup();
    const claims = jwt.decode<Record<string, unknown>>(tokens.issue('user-1').token);
    expect(Object.keys(claims).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'jti', 'sub']);
  });

  it('reports expiry as TOKEN_EXPIRED', () => {
    const { tokens, clock } = setup();
    const issued = tokens.issue('user-1');
    clock.current = new Date(issued.expiresAt.getTime() + 1000);
    expect(errorCode(() => tokens.verify(issued.token))).toBe('TOKEN_EXPIRED');
  });

  it('rejects a token signed with another secret', () => {
    const { tokens } = setup();
    const foreign = new JwtService({ secret: 'another-secret-that-is-also-long-enough!!' }).sign(
      { sub: 'user-1' },
      { issuer: 'couple-finance-api', audience: 'couple-finance-web' },
    );
    expect(errorCode(() => tokens.verify(foreign))).toBe('UNAUTHENTICATED');
  });

  it('rejects unsigned (alg: none) tokens', () => {
    const { tokens } = setup();
    const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
      sub: 'user-1',
      iss: 'couple-finance-api',
      aud: 'couple-finance-web',
      exp: 4_102_444_800,
    })}.`;
    expect(errorCode(() => tokens.verify(unsigned))).toBe('UNAUTHENTICATED');
  });

  it('rejects a tampered payload', () => {
    const { tokens } = setup();
    const [header, , signature] = tokens.issue('user-1').token.split('.');
    const forged = `${header}.${base64url({ sub: 'user-2', iss: 'couple-finance-api', aud: 'couple-finance-web', exp: 4_102_444_800 })}.${signature}`;
    expect(errorCode(() => tokens.verify(forged))).toBe('UNAUTHENTICATED');
  });
});
