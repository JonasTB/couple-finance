export type StoredInvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';
export type EffectiveInvitationStatus = 'PENDING' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Expiry is derived from `expiresAt` (exclusive), never stored. */
export function effectiveInvitationStatus(
  invitation: { status: StoredInvitationStatus; expiresAt: Date },
  now: Date,
): EffectiveInvitationStatus {
  if (invitation.status !== 'PENDING') {
    return invitation.status;
  }
  return invitation.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'PENDING';
}

/** "alexandre@example.com" → "a*******@example.com"; keeps the domain to help the invitee. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) {
    return '***';
  }
  const local = email.slice(0, at);
  return `${local[0] ?? ''}${'*'.repeat(Math.max(local.length - 1, 3))}${email.slice(at)}`;
}
