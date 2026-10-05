import { allocateLargestRemainder } from '../../../common/money/allocation';

export const TOTAL_BPS = 10_000;

/**
 * Converts monthly incomes (cents) into shares in basis points that sum to exactly 10000
 * (CALCULATIONS.md §2). Only the bps leave this module: raw incomes are never stored on
 * transactions, which protects RATIO_ONLY visibility.
 */
export function incomeSharesBps(incomesCents: readonly number[]): number[] {
  return allocateLargestRemainder(TOTAL_BPS, incomesCents);
}

export interface IncomePeriod {
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** `effectiveFrom <= date < effectiveTo` (exclusive end; open-ended when null). */
export function isEffectiveOn(period: IncomePeriod, date: string): boolean {
  return period.effectiveFrom <= date && (period.effectiveTo === null || date < period.effectiveTo);
}

/**
 * Household income on `date`: the sum of each member's record in effect, or null when any member
 * has none (analytics' income commitment needs everyone's income).
 */
export function householdIncomeOn(
  records: readonly (IncomePeriod & { memberId: string; monthlyAmountCents: number })[],
  memberIds: readonly string[],
  date: string,
): number | null {
  if (memberIds.length === 0) return null;
  let total = 0;
  for (const memberId of memberIds) {
    const record = records.find((r) => r.memberId === memberId && isEffectiveOn(r, date));
    if (!record) return null;
    total += record.monthlyAmountCents;
  }
  return total;
}
