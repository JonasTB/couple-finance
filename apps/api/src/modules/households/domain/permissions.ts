import { type HouseholdRole } from '@couple-finance/shared';

/** Permission matrix from ADR-005. Financial read/write is shared by every active member. */
export type HouseholdPermission =
  | 'household.read'
  | 'household.manage' // name, timezone, default split, archive
  | 'members.manage' // remove members, transfer ownership
  | 'invitations.manage';

const OWNER_ONLY: ReadonlySet<HouseholdPermission> = new Set([
  'household.manage',
  'members.manage',
  'invitations.manage',
]);

export function hasPermission(role: HouseholdRole, permission: HouseholdPermission): boolean {
  return role === 'OWNER' || !OWNER_ONLY.has(permission);
}
