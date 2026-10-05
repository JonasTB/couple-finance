import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ANALYTICS_AVERAGE_MONTHS,
  ANALYTICS_DEFAULT_MONTHS,
  type AnalyticsView,
  ErrorCode,
} from '@couple-finance/shared';
import { AppException } from '../../../common/errors/app.exception';
import { Clock } from '../../../common/time/clock';
import { localDateIn, monthBounds, monthRange, shiftMonth } from '../../../common/time/local-date';
import { CategoriesService } from '../../categories/public';
import { GoalsService } from '../../goals/public';
import { HouseholdDirectory, type MemberContext } from '../../households/public';
import { HouseholdIncome } from '../../incomes/public';
import { LedgerQuery } from '../../transactions/public';
import { computeTrends } from '../domain/trends';
import { topLevelIndex } from './category-index';

/**
 * Historical analytics read model (FR-AN-01..04), computed on read from canonical data
 * (ADR-009, ADR-016): SQL aggregates per month from the ledger, income totals, goal evolution,
 * and all arithmetic in the pure `domain/trends.ts`.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly directory: HouseholdDirectory,
    private readonly categories: CategoriesService,
    private readonly ledger: LedgerQuery,
    private readonly incomes: HouseholdIncome,
    private readonly goals: GoalsService,
    private readonly clock: Clock,
  ) {}

  async history(
    member: MemberContext,
    query: { month?: string; months?: number },
  ): Promise<AnalyticsView> {
    const household = await this.directory.household(member.householdId);
    if (!household) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Household not found.', HttpStatus.NOT_FOUND);
    }
    const currentMonth = localDateIn(household.timezone, this.clock.now()).slice(0, 7);
    const last = query.month ?? currentMonth;
    const first = shiftMonth(last, -((query.months ?? ANALYTICS_DEFAULT_MONTHS) - 1));
    const months = monthRange(first, last);
    // The comparison averages the 3 months before the last one, even in a shorter window.
    const averageStart = shiftMonth(last, -ANALYTICS_AVERAGE_MONTHS);
    const fetchFrom = monthBounds(averageStart < first ? averageStart : first).from;
    const fetchTo = monthBounds(last).to;

    const [members, tree, monthly, firstDate, goals] = await Promise.all([
      this.directory.members(member.householdId),
      this.categories.list(member.householdId, true),
      this.ledger.monthlySpend(member.householdId, fetchFrom, fetchTo),
      this.ledger.firstExpenseDate(member.householdId),
      this.goals.evolution(member.householdId, months),
    ]);

    // Household income = active members' incomes on each month's last day. Amounts are shown
    // only when every partner shares theirs (EXACT); ratios always (Q-02 caveat, ADR-005).
    const active = members.filter((m) => m.status === 'ACTIVE');
    const totals = await this.incomes.totalsOn(
      member.householdId,
      active.map((m) => m.id),
      months.map((month) => monthBounds(month).to),
    );
    const incomeVisible = active.every(
      (m) => m.id === member.memberId || m.incomeVisibility === 'EXACT',
    );

    const result = computeTrends({
      months,
      currentMonth,
      firstExpenseMonth: firstDate?.slice(0, 7) ?? null,
      members: members.map((m) => ({ id: m.id, status: m.status })),
      facts: monthly.spend,
      responsibility: monthly.responsibility,
      categories: topLevelIndex(tree),
      incomes: new Map(months.map((month, i) => [month, totals[i] ?? null])),
      incomeVisible,
    });

    return {
      from: first,
      to: last,
      currency: household.currency,
      hasAnyTransactions: firstDate !== null,
      incomeVisible,
      ...result,
      goals,
    };
  }
}
