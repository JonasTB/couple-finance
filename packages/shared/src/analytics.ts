import type { CurrencyCode, MemberStatus } from './households';
import type { GoalStatus } from './planning';

/**
 * Historical analytics (FR-AN-01..04, docs/domain/CALCULATIONS.md §11, ADR-016). Computed on read
 * from canonical data; the web only formats. Spend uses the shared scope (split type ≠
 * INDIVIDUAL), like the dashboard and budgets; individual spend is reported apart.
 */

/** Months per request: at most 24 (ADR-009); 12 by default. */
export const ANALYTICS_MAX_MONTHS = 24;
export const ANALYTICS_DEFAULT_MONTHS = 12;
/** Months before the compared month that form its average. */
export const ANALYTICS_AVERAGE_MONTHS = 3;

/** Before, during or after the current month (household time zone). */
export type AnalyticsPeriod = 'PAST' | 'CURRENT' | 'FUTURE';

export interface AnalyticsMemberMonth {
  memberId: string;
  /** Shared scope: what the member paid and what was planned as their part. */
  paidSharedCents: number;
  responsibleSharedCents: number;
  /** Shares of the month's shared spend (bps); null when the month has no shared spend. */
  paidShareBps: number | null;
  responsibleShareBps: number | null;
  /** paidShareBps − responsibleShareBps (signed). */
  deviationBps: number | null;
}

export interface AnalyticsIncomeMonth {
  /** False when an active member has no income in effect on the month's last day. */
  complete: boolean;
  /**
   * Household income (sum of the active members' monthly incomes on the month's last day).
   * Null when incomplete or when a partner keeps their income RATIO_ONLY (ADR-005).
   */
  incomeCents: number | null;
  /** Fixed spend (recurring + installments) ÷ income, bps; null when incomplete. */
  fixedBps: number | null;
  /** Shared spend ÷ income, bps; null when incomplete. */
  spendBps: number | null;
}

export interface AnalyticsMonth {
  /** `YYYY-MM`. */
  month: string;
  period: AnalyticsPeriod;
  sharedSpendCents: number;
  /** Expenses with a single responsible member (informational, outside every other figure). */
  individualSpendCents: number;
  /** Shared expenses created by confirming a recurring expense. */
  recurringCents: number;
  /** Shared expenses created by an installment plan (installment load). */
  installmentCents: number;
  /** Every other shared expense (variable spend). */
  otherCents: number;
  /** recurringCents + installmentCents. */
  fixedCents: number;
  /** Shared spend minus the previous month's; null for the window's first month. */
  changeCents: number | null;
  /** changeCents ÷ previous month (bps, truncated toward zero); null without previous spend. */
  changeBps: number | null;
  /** Active members plus former members with figures in the window, stable member order. */
  members: AnalyticsMemberMonth[];
  income: AnalyticsIncomeMonth;
}

export interface AnalyticsCategory {
  /** Top-level category (subcategories roll up). */
  categoryId: string;
  name: string;
  /** Shared spend in the window. */
  totalCents: number;
  /** Share of the window's shared spend (bps; all categories add up to 10000). */
  shareBps: number;
  /** One value per window month, aligned with `months`. */
  monthlyCents: number[];
}

export interface AnalyticsAverages {
  /** Closed months in the window on or after the first recorded expense. */
  months: number;
  /** Rounded-down averages per month over those months; null when `months` is 0. */
  sharedSpendCents: number | null;
  fixedCents: number | null;
  installmentCents: number | null;
  otherCents: number | null;
}

export interface AnalyticsCategoryComparison {
  categoryId: string;
  name: string;
  cents: number;
  previousCents: number;
  /** Average over the comparison's average months; null when there are none. */
  averageCents: number | null;
  /** cents − averageCents and its ratio (bps, truncated toward zero; null if average is 0). */
  vsAverageCents: number | null;
  vsAverageBps: number | null;
}

/** The window's last month against the previous month and the average of the 3 before it. */
export interface AnalyticsComparison {
  month: string;
  period: AnalyticsPeriod;
  sharedSpendCents: number;
  previousCents: number;
  changeCents: number;
  changeBps: number | null;
  /**
   * Months that form the average: up to 3 right before `month`, none before the first recorded
   * expense. 0 → no average.
   */
  averageMonths: number;
  averageCents: number | null;
  vsAverageCents: number | null;
  vsAverageBps: number | null;
  /** Categories with spend in the month, the previous month or the average months; largest first. */
  categories: AnalyticsCategoryComparison[];
}

export interface AnalyticsGoal {
  goalId: string;
  name: string;
  targetAmountCents: number;
  status: Exclude<GoalStatus, 'ARCHIVED'>;
  /** Saved at the end of each window month; null before the goal existed. */
  savedCents: (number | null)[];
}

export interface AnalyticsView {
  /** First and last month of the window (`YYYY-MM`). */
  from: string;
  to: string;
  currency: CurrencyCode;
  /** False until the household records its first expense. */
  hasAnyTransactions: boolean;
  /** True when household income amounts are visible to the viewer (every partner EXACT). */
  incomeVisible: boolean;
  members: { memberId: string; status: MemberStatus }[];
  months: AnalyticsMonth[];
  averages: AnalyticsAverages;
  comparison: AnalyticsComparison;
  /** Shared spend by top-level category over the window, largest first. */
  categories: AnalyticsCategory[];
  /** Active and achieved goals (archived ones are left out). */
  goals: AnalyticsGoal[];
}
