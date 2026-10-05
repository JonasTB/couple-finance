import { HttpStatus, Injectable } from '@nestjs/common';
import { type DashboardView, ErrorCode } from '@couple-finance/shared';
import { AppException } from '../../../common/errors/app.exception';
import { Clock } from '../../../common/time/clock';
import { localDateIn, monthBounds } from '../../../common/time/local-date';
import { CategoriesService } from '../../categories/public';
import { HouseholdDirectory, type MemberContext } from '../../households/public';
import { LedgerQuery } from '../../transactions/public';
import { computeContribution, type Flows } from '../domain/contribution';
import { topLevelIndex } from './category-index';

/**
 * Monthly dashboard read model (FR-DASH-01..05), computed on read (ADR-009). Income values never
 * appear here: planned responsibility comes from stored allocations, so RATIO_ONLY is respected.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly directory: HouseholdDirectory,
    private readonly categories: CategoriesService,
    private readonly ledger: LedgerQuery,
    private readonly clock: Clock,
  ) {}

  async monthly(member: MemberContext, requestedMonth?: string): Promise<DashboardView> {
    const household = await this.directory.household(member.householdId);
    if (!household) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Household not found.', HttpStatus.NOT_FOUND);
    }
    const month = requestedMonth ?? localDateIn(household.timezone, this.clock.now()).slice(0, 7);
    const { from, to } = monthBounds(month);

    const [members, tree, entries, periodSettlements, cumulative, hasAnyTransactions] =
      await Promise.all([
        this.directory.members(member.householdId),
        this.categories.list(member.householdId, true),
        this.ledger.entries(member.householdId, from, to),
        this.ledger.settlementFlows(member.householdId, to, from),
        this.ledger.cumulativeFlows(member.householdId, to),
        this.ledger.hasAnyTransaction(member.householdId),
      ]);

    const result = computeContribution({
      members: members.map((m) => ({ id: m.id, status: m.status })),
      entries: entries.map((entry) => ({
        id: entry.id,
        description: entry.description,
        date: entry.date,
        amountCents: entry.amountCents,
        categoryId: entry.categoryId,
        payerMemberId: entry.payerMemberId,
        shared: entry.splitType !== 'INDIVIDUAL',
        allocations: entry.allocations,
      })),
      periodSettlements,
      cumulative: new Map<string, Flows>(cumulative.map((flow) => [flow.memberId, flow])),
      categories: topLevelIndex(tree),
    });

    return { month, from, to, currency: household.currency, hasAnyTransactions, ...result };
  }
}
