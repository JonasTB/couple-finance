/**
 * Monthly budgets (FR-BUD-01..04, CALCULATIONS.md §7). Decisions (Stage 08):
 * - no rollover: every month starts from the amount set for it;
 * - only shared expenses count (split type ≠ INDIVIDUAL);
 * - a change applies from a month onward (never to past months).
 */

/** In-app alert states: WARNING from 80% used, EXCEEDED from 100%. */
export const BUDGET_WARNING_BPS = 8000;
export const BUDGET_EXCEEDED_BPS = 10000;

export type BudgetState = 'OK' | 'WARNING' | 'EXCEEDED';

export interface BudgetChangeInput {
  /** Null = the household total budget. */
  categoryId: string | null;
  /** Null removes the budget from `fromMonth` on. */
  amountCents: number | null;
  /** `YYYY-MM`, the current month or later. */
  fromMonth: string;
}

export interface BudgetStatusView {
  id: string;
  categoryId: string | null;
  /** Null for the household total. */
  categoryName: string | null;
  categoryArchived: boolean;
  amountCents: number;
  /** Shared spend in the month, including subcategories. */
  spentCents: number;
  /** May be negative. */
  remainingCents: number;
  /** ⌊spent × 10000 / amount⌋. */
  usedBps: number;
  state: BudgetState;
  /** First month of this amount (`YYYY-MM`). */
  fromMonth: string;
  /** Last month of this amount, or null while open-ended. */
  toMonth: string | null;
  /** Scheduled change after `toMonth` (new amount, or null = budget ends). */
  next: { fromMonth: string; amountCents: number | null } | null;
}

export interface BudgetMonthView {
  month: string;
  /** False for past months: they are read-only (FR-BUD-03). */
  editable: boolean;
  /** Household total first, then categories by name. */
  data: BudgetStatusView[];
}
