import { type HouseholdRole, MAX_ACTIVE_MEMBERS } from '@couple-finance/shared';

/**
 * Capacity: active members plus still-valid pending invitations (other than a re-send to the
 * same email) may not exceed the MVP cap (ADR-005, BUSINESS_RULES 19).
 */
export function hasCapacityForInvitation(
  activeMemberCount: number,
  otherValidPendingInvitations: number,
): boolean {
  return activeMemberCount + otherValidPendingInvitations < MAX_ACTIVE_MEMBERS;
}

export function hasCapacityToJoin(activeMemberCount: number): boolean {
  return activeMemberCount < MAX_ACTIVE_MEMBERS;
}

export type LeavePlan = 'LEAVE' | 'LEAVE_AND_ARCHIVE' | 'TRANSFER_OWNERSHIP_FIRST';

/** FR-HH-08: the owner hands over first; the last member leaving archives the household. */
export function planLeave(role: HouseholdRole, activeMemberCount: number): LeavePlan {
  if (activeMemberCount <= 1) {
    return 'LEAVE_AND_ARCHIVE';
  }
  return role === 'OWNER' ? 'TRANSFER_OWNERSHIP_FIRST' : 'LEAVE';
}
