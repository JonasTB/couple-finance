import {
  type CurrencyCode,
  type DefaultSplitRule,
  type HouseholdRole,
  type IncomeVisibility,
  type MemberStatus,
} from '@couple-finance/shared';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import { type StoredInvitationStatus } from '../domain/invitation-policy';

export interface HouseholdRecord {
  id: string;
  name: string;
  currency: CurrencyCode;
  timezone: string;
  defaultSplit: DefaultSplitRule;
  version: number;
  createdAt: Date;
  archivedAt: Date | null;
}

export interface MemberRecord {
  id: string;
  householdId: string;
  userId: string;
  role: HouseholdRole;
  status: MemberStatus;
  incomeVisibility: IncomeVisibility;
  joinedAt: Date;
  leftAt: Date | null;
}

export interface InvitationRecord {
  id: string;
  householdId: string;
  email: string;
  tokenHash: string;
  invitedByMemberId: string;
  status: StoredInvitationStatus;
  expiresAt: Date;
  acceptedByUserId: string | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export type HouseholdPatch = Partial<
  Pick<HouseholdRecord, 'name' | 'timezone' | 'defaultSplit' | 'archivedAt'>
>;
export type MemberPatch = Partial<
  Pick<MemberRecord, 'role' | 'status' | 'leftAt' | 'incomeVisibility'>
>;
export type InvitationPatch = Partial<
  Pick<InvitationRecord, 'status' | 'acceptedByUserId' | 'acceptedAt' | 'revokedAt'>
>;

export interface MembershipOfUser {
  household: HouseholdRecord;
  member: MemberRecord;
  activeMemberCount: number;
}

/**
 * Persistence port of the households module. Methods taking `tx` run inside the caller's
 * transaction; `lock*` methods take a row lock (`FOR UPDATE`) to serialize capacity checks.
 * Archived households are invisible to every `find*`/`lock*`/`list*` method.
 */
export abstract class HouseholdsRepository {
  abstract insertHousehold(
    tx: TransactionContext,
    household: Omit<HouseholdRecord, 'createdAt' | 'archivedAt'>,
  ): Promise<void>;
  abstract findHousehold(id: string): Promise<HouseholdRecord | null>;
  abstract lockHousehold(tx: TransactionContext, id: string): Promise<HouseholdRecord | null>;
  /** Applies the patch and bumps `version`; returns false if `expectedVersion` no longer matches. */
  abstract updateHousehold(
    tx: TransactionContext,
    id: string,
    expectedVersion: number,
    patch: HouseholdPatch,
  ): Promise<boolean>;
  abstract listMembershipsOfUser(userId: string): Promise<MembershipOfUser[]>;

  abstract insertMember(tx: TransactionContext, member: MemberRecord): Promise<void>;
  abstract findActiveMembership(
    userId: string,
    householdId: string,
    tx?: TransactionContext,
  ): Promise<MemberRecord | null>;
  abstract findMember(
    tx: TransactionContext,
    householdId: string,
    memberId: string,
  ): Promise<MemberRecord | null>;
  /** Active members in stable member order (joinedAt, id) — CALCULATIONS.md. */
  abstract listActiveMembers(householdId: string, tx?: TransactionContext): Promise<MemberRecord[]>;
  /** Every member ever (any status), in stable member order. */
  abstract listAllMembers(householdId: string, tx?: TransactionContext): Promise<MemberRecord[]>;
  abstract updateMember(tx: TransactionContext, id: string, patch: MemberPatch): Promise<void>;

  abstract insertInvitation(
    tx: TransactionContext,
    invitation: Omit<InvitationRecord, 'createdAt'>,
  ): Promise<void>;
  abstract findInvitationByTokenHash(
    tokenHash: string,
    tx?: TransactionContext,
  ): Promise<InvitationRecord | null>;
  abstract findInvitation(
    tx: TransactionContext,
    householdId: string,
    id: string,
  ): Promise<InvitationRecord | null>;
  /** Stored as PENDING (includes ones already past `expiresAt`), newest first. */
  abstract listPendingInvitations(
    householdId: string,
    tx?: TransactionContext,
  ): Promise<InvitationRecord[]>;
  abstract updateInvitation(
    tx: TransactionContext,
    id: string,
    patch: InvitationPatch,
  ): Promise<void>;
}
