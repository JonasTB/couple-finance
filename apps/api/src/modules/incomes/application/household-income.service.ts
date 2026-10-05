import { Injectable } from '@nestjs/common';
import { householdIncomeOn } from '../domain/income-basis';
import { IncomesRepository } from './incomes.repository';

/**
 * Public API: household income totals for analytics (FR-AN-02). Returns amounts, so the caller
 * must apply income visibility before exposing them (ADR-005): only ratios are always shareable.
 */
@Injectable()
export class HouseholdIncome {
  constructor(private readonly incomes: IncomesRepository) {}

  /** Sum of the members' incomes in effect on each date; null where any member has none. */
  async totalsOn(
    householdId: string,
    memberIds: readonly string[],
    dates: readonly string[],
  ): Promise<(number | null)[]> {
    if (dates.length === 0) return [];
    const sorted = [...dates].sort();
    const records = await this.incomes.overlapping(
      householdId,
      memberIds,
      sorted[0] ?? '',
      sorted[sorted.length - 1] ?? '',
    );
    return dates.map((date) => householdIncomeOn(records, memberIds, date));
  }
}
