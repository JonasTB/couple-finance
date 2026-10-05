import type { BudgetState } from './budgets';
import type { DeviationCategory, DeviationTransaction } from './dashboard';

/**
 * Deterministic insights (FR-INS-01..04, docs/domain/CALCULATIONS.md §10, ADR-017). Computed on
 * read from the dashboard, analytics, budgets and installments read models; never by an LLM.
 * The rule id (plus `direction`) is the message key and the typed `metrics` are its parameters;
 * the web writes the pt-BR copy in neutral language.
 */

export const INSIGHT_RULE_IDS = [
  'CATEGORY_ABOVE_AVERAGE',
  'CATEGORY_BELOW_AVERAGE',
  'BUDGET_NEAR_LIMIT',
  'INSTALLMENT_ENDING',
  'CONTRIBUTION_DEVIATION',
  'DOMINANT_CATEGORY',
  'MOM_CHANGE',
] as const;
export type InsightRuleId = (typeof INSIGHT_RULE_IDS)[number];

/** ATTENTION: something to look at (spend up, budget at risk); INFO: context or good news. */
export type InsightSeverity = 'INFO' | 'ATTENTION';

/** `RULE:YYYY-MM:subject[:qualifier]` — stable per rule, period and subject (ADR-009). */
export const INSIGHT_FINGERPRINT_PATTERN =
  /^[A-Z_]{3,40}:\d{4}-\d{2}:[A-Za-z0-9-]{1,40}(:[A-Z]{1,20})?$/;

interface InsightBase {
  /** Identifies the insight for dismissals: rule + period + subject. */
  fingerprint: string;
  ruleVersion: number;
  severity: InsightSeverity;
  /** The analysed month (`YYYY-MM`). */
  month: string;
  /** The rule's thresholds as applied (money in cents, ratios in bps). */
  thresholds: Record<string, number>;
  /** When the current user dismissed it, or null. */
  dismissedAt: string | null;
}

export interface CategoryRef {
  /** Top-level category. */
  categoryId: string;
  name: string;
}

export interface CategoryAverageInsight extends InsightBase {
  ruleId: 'CATEGORY_ABOVE_AVERAGE' | 'CATEGORY_BELOW_AVERAGE';
  category: CategoryRef;
  metrics: {
    cents: number;
    averageCents: number;
    /** Months that form the average (1–3, none before the first recorded expense). */
    averageMonths: number;
    differenceCents: number;
    /** Null when the average is 0 (new spending in the category). */
    differenceBps: number | null;
  };
}

export interface BudgetInsight extends InsightBase {
  ruleId: 'BUDGET_NEAR_LIMIT';
  /** Null category = the household total budget. */
  budget: { categoryId: string | null; name: string | null };
  metrics: {
    state: Exclude<BudgetState, 'OK'>;
    amountCents: number;
    spentCents: number;
    remainingCents: number;
    usedBps: number;
  };
}

export interface InstallmentEndingInsight extends InsightBase {
  ruleId: 'INSTALLMENT_ENDING';
  plan: { id: string; description: string };
  metrics: {
    /** First month without this plan's installments. */
    releaseMonth: string;
    /** Regular installment that stops being charged. */
    releasedCents: number;
  };
}

export interface ContributionDeviationInsight extends InsightBase {
  ruleId: 'CONTRIBUTION_DEVIATION';
  /** The member who paid more than planned; the partner mirrors it. */
  memberId: string;
  metrics: {
    paidShareBps: number;
    responsibleShareBps: number;
    deviationBps: number;
    /** Paid minus planned on shared expenses (cents, positive). */
    differenceCents: number;
  };
  /** Top categories and expenses behind the difference (CALCULATIONS §4). */
  evidence: { categories: DeviationCategory[]; transactions: DeviationTransaction[] };
}

export interface DominantCategoryInsight extends InsightBase {
  ruleId: 'DOMINANT_CATEGORY';
  category: CategoryRef;
  metrics: { cents: number; sharedSpendCents: number; shareBps: number };
}

export interface MonthChangeInsight extends InsightBase {
  ruleId: 'MOM_CHANGE';
  direction: 'UP' | 'DOWN';
  metrics: {
    cents: number;
    previousCents: number;
    changeCents: number;
    changeBps: number;
  };
  /** Categories that moved the most in the same direction (up to 3). */
  evidence: {
    categories: (CategoryRef & { cents: number; previousCents: number; changeCents: number })[];
  };
}

export type InsightView =
  | CategoryAverageInsight
  | BudgetInsight
  | InstallmentEndingInsight
  | ContributionDeviationInsight
  | DominantCategoryInsight
  | MonthChangeInsight;

export interface InsightsView {
  month: string;
  /** Before, during or after the current month (household time zone). */
  period: 'PAST' | 'CURRENT' | 'FUTURE';
  /** ATTENTION first, then by rule and magnitude. Dismissed ones included (flagged). */
  insights: InsightView[];
}

export interface DismissInsightInput {
  fingerprint: string;
}
