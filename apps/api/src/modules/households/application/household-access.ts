import { Injectable } from '@nestjs/common';
import { hasPermission, type HouseholdPermission } from '../domain/permissions';
import { forbidden, householdNotFound } from './errors';
import { HouseholdsRepository } from './households.repository';
import { type MemberContext } from './member-context';

/**
 * Server-side authorization for every household-scoped request (BUSINESS_RULES 4, NFR-02).
 * Membership is read from the database on each call, so removal takes effect immediately.
 */
@Injectable()
export class HouseholdAccess {
  constructor(private readonly households: HouseholdsRepository) {}

  async require(
    userId: string,
    householdId: string,
    permission: HouseholdPermission,
  ): Promise<MemberContext> {
    const member = await this.households.findActiveMembership(userId, householdId);
    if (!member) {
      throw householdNotFound();
    }
    if (!hasPermission(member.role, permission)) {
      throw forbidden();
    }
    return { householdId, memberId: member.id, userId, role: member.role };
  }
}
