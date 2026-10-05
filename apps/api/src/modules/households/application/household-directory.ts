import { Injectable } from '@nestjs/common';
import {
  type CurrencyCode,
  type DefaultSplitRule,
  type HouseholdRole,
  type IncomeVisibility,
  type MemberStatus,
} from '@couple-finance/shared';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import { HouseholdsRepository } from './households.repository';

export interface HouseholdMemberInfo {
  id: string;
  userId: string;
  role: HouseholdRole;
  status: MemberStatus;
  incomeVisibility: IncomeVisibility;
  joinedAt: Date;
}

export interface HouseholdInfo {
  id: string;
  currency: CurrencyCode;
  timezone: string;
  defaultSplit: DefaultSplitRule;
}

/** Read-only household facts for ledger modules (public API). */
@Injectable()
export class HouseholdDirectory {
  constructor(private readonly households: HouseholdsRepository) {}

  async household(householdId: string): Promise<HouseholdInfo | null> {
    const household = await this.households.findHousehold(householdId);
    return household
      ? {
          id: household.id,
          currency: household.currency,
          timezone: household.timezone,
          defaultSplit: household.defaultSplit,
        }
      : null;
  }

  /** All members ever, in stable member order (joinedAt, id) — the tie-break order of ADR-006. */
  async members(householdId: string, tx?: TransactionContext): Promise<HouseholdMemberInfo[]> {
    const members = await this.households.listAllMembers(householdId, tx);
    return members.map((member) => ({
      id: member.id,
      userId: member.userId,
      role: member.role,
      status: member.status,
      incomeVisibility: member.incomeVisibility,
      joinedAt: member.joinedAt,
    }));
  }
}
