import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { ErrorCode } from '@couple-finance/shared';
import { AppException } from '../../../common/errors/app.exception';
import { IdGenerator } from '../../../common/ids/id-generator';
import { Clock } from '../../../common/time/clock';
import { type Env } from '../../../config/env';

const ISSUER = 'couple-finance-api';
const AUDIENCE = 'couple-finance-web';

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

interface AccessTokenClaims {
  sub: string;
}

/**
 * Short-lived HS256 JWT carrying only the user id (ADR-004). No household or role claims:
 * authorization is resolved from the database on every request.
 */
@Injectable()
export class AccessTokens {
  private readonly ttlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.ttlSeconds = config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  issue(userId: string): IssuedAccessToken {
    const issuedAtSeconds = Math.floor(this.clock.now().getTime() / 1000);
    const expiresAtSeconds = issuedAtSeconds + this.ttlSeconds;
    const token = this.jwt.sign(
      { sub: userId, iat: issuedAtSeconds, exp: expiresAtSeconds },
      { jwtid: this.ids.next(), issuer: ISSUER, audience: AUDIENCE, algorithm: 'HS256' },
    );
    return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
  }

  /** Returns the user id, or throws TOKEN_EXPIRED / UNAUTHENTICATED. */
  verify(token: string): string {
    try {
      const claims = this.jwt.verify<AccessTokenClaims>(token, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
        clockTimestamp: Math.floor(this.clock.now().getTime() / 1000),
      });
      if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
        throw new Error('missing subject');
      }
      return claims.sub;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new AppException(
          ErrorCode.TOKEN_EXPIRED,
          'Access token expired.',
          HttpStatus.UNAUTHORIZED,
        );
      }
      throw unauthenticated();
    }
  }
}

export function unauthenticated(): AppException {
  return new AppException(
    ErrorCode.UNAUTHENTICATED,
    'Authentication required.',
    HttpStatus.UNAUTHORIZED,
  );
}
