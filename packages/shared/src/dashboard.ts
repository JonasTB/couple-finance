import type { CurrencyCode, MemberStatus } from './households';

/**
 * Monthly dashboard (FR-DASH-01..05, docs/domain/CALCULATIONS.md §3–4). Every number is computed
 * by the API; the web only formats it. Shares use the shared scope (split type ≠ INDIVIDUAL);
 * balances use every expense plus settlements (Q-07).
 */

export interface DashboardTotals {
  /** Expenses split between members (split type ≠ INDIVIDUAL). */
  sharedSpendCents: number;
  /** Expenses with a single responsible member. */
  individualSpendCents: number;
  totalSpendCents: number;
  transactionCount: number;
}

export interface DashboardMember {
  memberId: string;
  status: MemberStatus;
  /** Everything this member paid in the month (shared + individual). */
  paidCents: number;
  /** Shared scope: what the member paid and what was planned as their part. */
  paidSharedCents: number;
  responsibleSharedCents: number;
  /** Shares of the shared spend in bps; null when the month has no shared spend. */
  paidShareBps: number | null;
  responsibleShareBps: number | null;
  /** paidShareBps − responsibleShareBps (signed). */
  deviationBps: number | null;
  /** paidSharedCents − responsibleSharedCents (signed); the explanation adds up to it. */
  sharedDifferenceCents: number;
  /** paid − responsible + settlements sent − settlements received, in the month. */
  periodBalanceCents: number;
  /** Same formula from the household's first record to the end of the month. */
  cumulativeBalanceCents: number;
}

export interface DashboardCategory {
  /** Top-level category. */
  categoryId: string;
  name: string;
  sharedSpendCents: number;
  /** Share of the month's shared spend (bps; all categories add up to 10000). */
  shareBps: number;
  transactionCount: number;
}

export interface DeviationCategory {
  categoryId: string;
  name: string;
  /** Signed: positive = the member paid more than their part in this category. */
  deltaCents: number;
}

export interface DeviationTransaction {
  transactionId: string;
  description: string;
  date: string;
  categoryId: string;
  amountCents: number;
  deltaCents: number;
}

/** Why a member's paid share differs from the plan (deterministic attribution, §4). */
export interface DeviationExplanation {
  memberId: string;
  direction: 'ABOVE' | 'BELOW';
  /** Top 3 categories and top 5 expenses that pushed in this direction. */
  categories: DeviationCategory[];
  transactions: DeviationTransaction[];
}

/** A transfer that would bring both cumulative balances to zero (couples only). */
export interface SettlementSuggestion {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

export interface DashboardView {
  /** `YYYY-MM` in the household time zone. */
  month: string;
  from: string;
  to: string;
  currency: CurrencyCode;
  /** False until the household records its first expense (drives the empty state). */
  hasAnyTransactions: boolean;
  totals: DashboardTotals;
  /** Active members plus former members with figures, in stable member order. */
  members: DashboardMember[];
  /** Shared spend by top-level category, largest first. */
  categories: DashboardCategory[];
  explanations: DeviationExplanation[];
  settlementSuggestion: SettlementSuggestion | null;
}
