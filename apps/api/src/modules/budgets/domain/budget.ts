import { BUDGET_EXCEEDED_BPS, BUDGET_WARNING_BPS, type BudgetState } from '@couple-finance/shared';

/**
 * Budget rules (FR-BUD-01..04, CALCULATIONS.md §7). Pure: no I/O.
 *
 * A budget *line* is the household total or one category. Its amounts form non-overlapping
 * periods of whole months `[fromMonth, untilMonth)` (`YYYY-MM`, `untilMonth` exclusive,
 * null = open-ended). Months compare as strings.
 */

export interface BudgetPeriod {
  id: string;
  fromMonth: string;
  untilMonth: string | null;
  amountCents: number;
}

export interface BudgetChangePlan {
  /** The period running into `fromMonth` now stops before it. */
  truncate: { id: string; untilMonth: string } | null;
  /** Periods starting on or after `fromMonth` are replaced (soft-deleted). */
  remove: string[];
  /** The new open-ended period, unless the budget is being removed. */
  create: { fromMonth: string; amountCents: number } | null;
}

export function covers(period: BudgetPeriod, month: string): boolean {
  return period.fromMonth <= month && (period.untilMonth === null || month < period.untilMonth);
}

export function effectiveIn<T extends BudgetPeriod>(
  periods: readonly T[],
  month: string,
): T | undefined {
  return periods.find((period) => covers(period, month));
}

/**
 * "From `fromMonth` on, the budget is `amountCents`" (null = no budget). Earlier months are never
 * touched (FR-BUD-03); later scheduled changes are superseded. Returns null when nothing changes.
 */
export function planChange(
  periods: readonly BudgetPeriod[],
  fromMonth: string,
  amountCents: number | null,
): BudgetChangePlan | null {
  const running = periods.find((p) => p.fromMonth < fromMonth && covers(p, fromMonth));
  const later = periods.filter((p) => p.fromMonth >= fromMonth);
  if (
    running &&
    running.untilMonth === null &&
    later.length === 0 &&
    running.amountCents === amountCents
  ) {
    return null;
  }
  if (!running && later.length === 0 && amountCents === null) {
    return null;
  }
  return {
    truncate: running ? { id: running.id, untilMonth: fromMonth } : null,
    remove: later.map((p) => p.id),
    create: amountCents === null ? null : { fromMonth, amountCents },
  };
}

/** The change that follows `period` (a new amount, or the end of the budget). */
export function nextChange(
  periods: readonly BudgetPeriod[],
  period: BudgetPeriod,
): { fromMonth: string; amountCents: number | null } | null {
  if (period.untilMonth === null) return null;
  const following = periods.find((p) => p.fromMonth === period.untilMonth);
  return { fromMonth: period.untilMonth, amountCents: following?.amountCents ?? null };
}

/**
 * remaining = amount − spent (may be negative); usedBps = ⌊spent × 10000 / amount⌋ (BigInt);
 * state = EXCEEDED from 100%, WARNING from 80%, else OK. No rollover: each month stands alone.
 */
export function budgetStatus(
  amountCents: number,
  spentCents: number,
): { remainingCents: number; usedBps: number; state: BudgetState } {
  const usedBps = Number((BigInt(spentCents) * 10_000n) / BigInt(amountCents));
  return {
    remainingCents: amountCents - spentCents,
    usedBps,
    state:
      usedBps >= BUDGET_EXCEEDED_BPS
        ? 'EXCEEDED'
        : usedBps >= BUDGET_WARNING_BPS
          ? 'WARNING'
          : 'OK',
  };
}
