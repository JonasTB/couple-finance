import {
  type RefreshTokenRevokedReason,
  type RefreshTokenState,
} from '../domain/refresh-token-policy';

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  abstract verify(hash: string, password: string): Promise<boolean>;
  /** True when the hash was produced with weaker parameters than the current ones. */
  abstract needsRehash(hash: string): boolean;
}

export interface StoredRefreshToken extends RefreshTokenState {
  id: string;
  userId: string;
  familyId: string;
}

export interface NewRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

/** Operations available while a refresh token row is locked (single DB transaction). */
export interface RefreshTokenTransaction {
  insert(token: NewRefreshToken): Promise<void>;
  markRotated(tokenId: string, rotatedAt: Date, replacedById: string): Promise<void>;
  revokeFamily(familyId: string, reason: RefreshTokenRevokedReason, revokedAt: Date): Promise<void>;
}

export abstract class RefreshTokenStore {
  abstract insert(token: NewRefreshToken): Promise<void>;

  /**
   * Locks the token row (if any) and runs `work` in one transaction, so two concurrent
   * refreshes of the same token cannot both rotate it.
   */
  abstract withLockedToken<T>(
    tokenHash: string,
    work: (token: StoredRefreshToken | null, tx: RefreshTokenTransaction) => Promise<T>,
  ): Promise<T>;

  abstract findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;

  abstract revokeFamily(
    familyId: string,
    reason: RefreshTokenRevokedReason,
    revokedAt: Date,
  ): Promise<void>;
}
