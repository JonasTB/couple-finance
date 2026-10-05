// Public API of the households module, for feature modules scoped to a household.
export { HouseholdsModule } from './households.module';
export { HouseholdAccess } from './application/household-access';
export {
  HouseholdDirectory,
  type HouseholdInfo,
  type HouseholdMemberInfo,
} from './application/household-directory';
export { type MemberContext } from './application/member-context';
export { type HouseholdPermission } from './domain/permissions';
export {
  CurrentMember,
  HouseholdMemberGuard,
  RequireHouseholdPermission,
} from './presentation/household-member.guard';
