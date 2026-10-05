import { type HouseholdRole } from '@couple-finance/shared';

/** The caller's active membership in the household addressed by the request. */
export interface MemberContext {
  householdId: string;
  memberId: string;
  userId: string;
  role: HouseholdRole;
}
