import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32; // 256 bits

/** Random, URL-safe opaque token (refresh tokens, later invitations). */
export function generateOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * SHA-256 hex digest used for storage and lookup. A plain hash is enough because the input
 * has 256 bits of entropy (no dictionary to attack), unlike passwords.
 */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
