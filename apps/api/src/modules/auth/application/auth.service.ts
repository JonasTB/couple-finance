import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AuthSession, ErrorCode } from '@couple-finance/shared';
import { AppException, validationFailed } from '../../../common/errors/app.exception';
import { IdGenerator } from '../../../common/ids/id-generator';
import { Clock } from '../../../common/time/clock';
import { type Env } from '../../../config/env';
import { UsersService } from '../../users/public';
import { checkPassword } from '../domain/password-policy';
import { decideRefresh, type RefreshDecision } from '../domain/refresh-token-policy';
import { AccessTokens, unauthenticated } from './access-tokens';
import { PasswordHasher, RefreshTokenStore } from './ports';
import { generateOpaqueToken, hashOpaqueToken } from '../../../common/crypto/opaque-token';

export interface IssuedRefreshToken {
  value: string;
  expiresAt: Date;
}

/** A session for the client: body (`session`) plus the refresh token for the cookie. */
export interface SessionGrant {
  session: AuthSession;
  refreshToken: IssuedRefreshToken;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTtlMs: number;
  /** Hash verified when the email is unknown, so response time does not reveal accounts. */
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly users: UsersService,
    private readonly hasher: PasswordHasher,
    private readonly refreshTokens: RefreshTokenStore,
    private readonly accessTokens: AccessTokens,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.refreshTtlMs = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * DAY_MS;
  }

  async register(input: RegisterInput): Promise<SessionGrant> {
    const violations = checkPassword(input.password, input.email);
    if (violations.length > 0) {
      throw validationFailed([{ field: 'password', constraints: violations }]);
    }
    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.users.create({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
    });
    return this.startSession(user.id);
  }

  async login(email: string, password: string): Promise<SessionGrant> {
    const credentials = await this.users.findCredentialsByEmail(email);
    if (!credentials) {
      await this.hasher.verify(await this.getDummyHash(), password);
      throw invalidCredentials();
    }
    if (!(await this.hasher.verify(credentials.passwordHash, password))) {
      throw invalidCredentials();
    }
    if (this.hasher.needsRehash(credentials.passwordHash)) {
      await this.users.updatePasswordHash(credentials.userId, await this.hasher.hash(password));
    }
    return this.startSession(credentials.userId);
  }

  /**
   * Rotates the refresh token. Decisions that revoke the family are committed before the
   * error is thrown, so a rejected request still leaves the revocation in place.
   */
  async refresh(rawToken: string): Promise<SessionGrant> {
    const now = this.clock.now();
    const next = this.newRefreshToken(now);

    const outcome = await this.refreshTokens.withLockedToken(
      hashOpaqueToken(rawToken),
      async (token, tx): Promise<{ decision: RefreshDecision | 'UNKNOWN'; userId?: string }> => {
        if (!token) {
          return { decision: 'UNKNOWN' };
        }
        const decision = decideRefresh(token, now);
        if (decision === 'ROTATE') {
          const id = this.ids.next();
          await tx.insert({
            id,
            userId: token.userId,
            familyId: token.familyId,
            tokenHash: hashOpaqueToken(next.value),
            expiresAt: next.expiresAt,
          });
          await tx.markRotated(token.id, now, id);
        } else if (decision === 'REUSE_DETECTED') {
          await tx.revokeFamily(token.familyId, 'REUSE_DETECTED', now);
          this.logger.warn(
            { event: 'auth.refresh_token_reuse', userId: token.userId, familyId: token.familyId },
            'Refresh token reuse detected; token family revoked',
          );
        }
        return { decision, userId: token.userId };
      },
    );

    if (outcome.decision === 'CONCURRENT_ROTATION') {
      throw new AppException(
        ErrorCode.REFRESH_TOKEN_ROTATED,
        'Refresh token was just rotated by a concurrent request; retry with the latest cookie.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (outcome.decision !== 'ROTATE' || !outcome.userId) {
      throw unauthenticated();
    }
    const session = await this.buildSession(outcome.userId);
    if (!session) {
      throw unauthenticated();
    }
    return { session, refreshToken: next };
  }

  /** Revokes the whole family of the presented token. Idempotent; unknown tokens are ignored. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }
    const token = await this.refreshTokens.findByHash(hashOpaqueToken(rawToken));
    if (token && !token.revokedAt) {
      await this.refreshTokens.revokeFamily(token.familyId, 'LOGOUT', this.clock.now());
    }
  }

  private async startSession(userId: string): Promise<SessionGrant> {
    const refreshToken = this.newRefreshToken(this.clock.now());
    await this.refreshTokens.insert({
      id: this.ids.next(),
      userId,
      familyId: this.ids.next(),
      tokenHash: hashOpaqueToken(refreshToken.value),
      expiresAt: refreshToken.expiresAt,
    });
    const session = await this.buildSession(userId);
    if (!session) {
      throw unauthenticated();
    }
    return { session, refreshToken };
  }

  private async buildSession(userId: string): Promise<AuthSession | null> {
    const user = await this.users.findProfile(userId);
    if (!user) {
      return null;
    }
    const access = this.accessTokens.issue(userId);
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      user,
    };
  }

  private newRefreshToken(now: Date): IssuedRefreshToken {
    return {
      value: generateOpaqueToken(),
      expiresAt: new Date(now.getTime() + this.refreshTtlMs),
    };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash(generateOpaqueToken());
    return this.dummyHash;
  }
}

function invalidCredentials(): AppException {
  return new AppException(
    ErrorCode.INVALID_CREDENTIALS,
    'Email or password is incorrect.',
    HttpStatus.UNAUTHORIZED,
  );
}
