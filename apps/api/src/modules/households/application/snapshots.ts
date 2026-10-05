import {
  type HouseholdRecord,
  type InvitationRecord,
  type MemberRecord,
} from './households.repository';

/** JSON-safe audit snapshots (ADR-008). Token hashes are never included. */
export function householdSnapshot(household: HouseholdRecord): Record<string, unknown> {
  return {
    name: household.name,
    currency: household.currency,
    timezone: household.timezone,
    defaultSplit: household.defaultSplit,
    version: household.version,
    archivedAt: household.archivedAt?.toISOString() ?? null,
  };
}

export function memberSnapshot(member: MemberRecord): Record<string, unknown> {
  return {
    userId: member.userId,
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt.toISOString(),
    leftAt: member.leftAt?.toISOString() ?? null,
  };
}

export function invitationSnapshot(invitation: InvitationRecord): Record<string, unknown> {
  return {
    email: invitation.email,
    status: invitation.status,
    invitedByMemberId: invitation.invitedByMemberId,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedByUserId: invitation.acceptedByUserId,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
  };
}
