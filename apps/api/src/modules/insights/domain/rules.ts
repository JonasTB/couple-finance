import {
  type AnalyticsComparison,
  type AnalyticsPeriod,
  BUDGET_EXCEEDED_BPS,
  BUDGET_WARNING_BPS,
  type BudgetStatusView,
  type DashboardCategory,
  type DashboardMember,
  type DeviationExplanation,
  type InsightRuleId,
  type InsightView,
  type ReleaseMonth,
} from '@couple-finance/shared';
import { shiftMonth } from '../../../common/time/local-date';

/**
 * Deterministic insight rules (FR-INS-01..03, CALCULATIONS.md §10, ADR-017). Pure: no I/O.
 *
 * Each rule has a version and constant thresholds; every insight carries them with its metrics
 * and evidence, so it can be traced back to the read models (and from there to expenses).
 * Comparisons multiply in BigInt instead of dividing, so there is no rounding at the boundary.
 */

export const RULES = {
  CATEGORY_ABOVE_AVERAGE: {
    version: 1,
    thresholds: { ratioBps: 12_000, minDifferenceCents: 5_000 },
  },
  CATEGORY_BELOW_AVERAGE: {
    version: 1,
    thresholds: { ratioBps: 8_000, minDifferenceCents: 5_000 },
  },
  BUDGET_NEAR_LIMIT: {
    version: 1,
    thresholds: { warningBps: BUDGET_WARNING_BPS, exceededBps: BUDGET_EXCEEDED_BPS },
  },
  INSTALLMENT_ENDING: { version: 1, thresholds: { withinMonths: 2 } },
  CONTRIBUTION_DEVIATION: { version: 1, thresholds: { minDeviationBps: 500 } },
  DOMINANT_CATEGORY: { version: 1, thresholds: { minShareBps: 3_500 } },
  MOM_CHANGE: { version: 1, thresholds: { minChangeBps: 2_500, minChangeCents: 20_000 } },
} as const satisfies Record<InsightRuleId, { version: number; thresholds: Record<string, number> }>;

export const MOM_EVIDENCE_CATEGORIES = 3;

type WithoutDismissal<T> = T extends unknown ? Omit<T, 'dismissedAt'> : never;
/** An insight before the viewer's dismissals are applied. */
export type InsightDraft = WithoutDismissal<InsightView>;

export interface InsightInput {
  /** `YYYY-MM`. */
  month: string;
  period: AnalyticsPeriod;
  /** Dashboard read model of the month (shared scope, CALCULATIONS §3–4). */
  members: readonly DashboardMember[];
  categories: readonly DashboardCategory[];
  explanations: readonly DeviationExplanation[];
  /** Analytics comparison of the month with the previous one and the 3-month average (§11). */
  comparison: AnalyticsComparison;
  budgets: readonly BudgetStatusView[];
  /** Upcoming installment releases (after the current month). */
  releases: readonly ReleaseMonth[];
}

const big = (value: number): bigint => BigInt(value);

const base = <R extends InsightRuleId>(
  ruleId: R,
  month: string,
  subject: string,
  qualifier?: string,
) => ({
  ruleId,
  fingerprint: [ruleId, month, subject, ...(qualifier ? [qualifier] : [])].join(':'),
  ruleVersion: RULES[ruleId].version,
  month,
  thresholds: { ...RULES[ruleId].thresholds },
});

function categoryAverages(input: InsightInput): InsightDraft[] {
  const above = RULES.CATEGORY_ABOVE_AVERAGE.thresholds;
  const below = RULES.CATEGORY_BELOW_AVERAGE.thresholds;
  const { averageMonths } = input.comparison;
  const result: InsightDraft[] = [];
  for (const c of input.comparison.categories) {
    if (c.averageCents === null || c.vsAverageCents === null) continue;
    const category = { categoryId: c.categoryId, name: c.name };
    const metrics = {
      cents: c.cents,
      averageCents: c.averageCents,
      averageMonths,
      differenceCents: c.vsAverageCents,
      differenceBps: c.vsAverageBps,
    };
    // cents > average × 120% and at least R$ 50 more.
    if (
      c.vsAverageCents >= above.minDifferenceCents &&
      big(c.cents) * 10_000n > big(c.averageCents) * big(above.ratioBps)
    ) {
      result.push({
        ...base('CATEGORY_ABOVE_AVERAGE', input.month, c.categoryId),
        severity: 'ATTENTION',
        category,
        metrics,
      });
    }
    // Reductions only once the month is closed: a running month is always "below" early on.
    if (
      input.period === 'PAST' &&
      -c.vsAverageCents >= below.minDifferenceCents &&
      big(c.cents) * 10_000n < big(c.averageCents) * big(below.ratioBps)
    ) {
      result.push({
        ...base('CATEGORY_BELOW_AVERAGE', input.month, c.categoryId),
        severity: 'INFO',
        category,
        metrics,
      });
    }
  }
  return result;
}

function budgets(input: InsightInput): InsightDraft[] {
  return input.budgets.flatMap((b): InsightDraft[] =>
    b.state === 'OK'
      ? []
      : [
          {
            // The state is part of the fingerprint: dismissing a warning does not hide "exceeded".
            ...base('BUDGET_NEAR_LIMIT', input.month, b.categoryId ?? 'TOTAL', b.state),
            severity: 'ATTENTION',
            budget: { categoryId: b.categoryId, name: b.categoryName },
            metrics: {
              state: b.state,
              amountCents: b.amountCents,
              spentCents: b.spentCents,
              remainingCents: b.remainingCents,
              usedBps: b.usedBps,
            },
          },
        ],
  );
}

function installmentsEnding(input: InsightInput): InsightDraft[] {
  // Forward-looking: only for the current month (releases are computed from today).
  if (input.period !== 'CURRENT') return [];
  const last = shiftMonth(input.month, RULES.INSTALLMENT_ENDING.thresholds.withinMonths);
  return input.releases
    .filter((r) => r.month > input.month && r.month <= last)
    .flatMap((release) =>
      release.plans.map((plan): InsightDraft => ({
        ...base('INSTALLMENT_ENDING', input.month, plan.id),
        severity: 'INFO',
        plan: { id: plan.id, description: plan.description },
        metrics: { releaseMonth: release.month, releasedCents: plan.installmentAmountCents },
      })),
    );
}

function contributionDeviation(input: InsightInput): InsightDraft[] {
  const { minDeviationBps } = RULES.CONTRIBUTION_DEVIATION.thresholds;
  return input.members.flatMap((m): InsightDraft[] => {
    if (
      m.deviationBps === null ||
      m.paidShareBps === null ||
      m.responsibleShareBps === null ||
      m.deviationBps < minDeviationBps
    ) {
      return [];
    }
    // Told from the member above plan; the partner's side mirrors it (neutral, no ranking).
    const explanation = input.explanations.find(
      (e) => e.memberId === m.memberId && e.direction === 'ABOVE',
    );
    return [
      {
        ...base('CONTRIBUTION_DEVIATION', input.month, m.memberId),
        severity: 'INFO',
        memberId: m.memberId,
        metrics: {
          paidShareBps: m.paidShareBps,
          responsibleShareBps: m.responsibleShareBps,
          deviationBps: m.deviationBps,
          differenceCents: m.sharedDifferenceCents,
        },
        evidence: {
          categories: explanation?.categories ?? [],
          transactions: explanation?.transactions ?? [],
        },
      },
    ];
  });
}

function dominantCategories(input: InsightInput): InsightDraft[] {
  const { minShareBps } = RULES.DOMINANT_CATEGORY.thresholds;
  const total = input.categories.reduce((sum, c) => sum + c.sharedSpendCents, 0);
  return input.categories
    .filter((c) => c.shareBps >= minShareBps)
    .map((c): InsightDraft => ({
      ...base('DOMINANT_CATEGORY', input.month, c.categoryId),
      severity: 'INFO',
      category: { categoryId: c.categoryId, name: c.name },
      metrics: { cents: c.sharedSpendCents, sharedSpendCents: total, shareBps: c.shareBps },
    }));
}

function monthChange(input: InsightInput): InsightDraft[] {
  const { minChangeBps, minChangeCents } = RULES.MOM_CHANGE.thresholds;
  const c = input.comparison;
  if (c.changeBps === null || c.changeCents === 0) return [];
  const direction = c.changeCents > 0 ? 'UP' : 'DOWN';
  // A running month can only be confirmed as an increase.
  if (direction === 'DOWN' && input.period !== 'PAST') return [];
  if (Math.abs(c.changeBps) < minChangeBps || Math.abs(c.changeCents) < minChangeCents) return [];
  const sign = direction === 'UP' ? 1 : -1;
  const categories = c.categories
    .map((x) => ({
      categoryId: x.categoryId,
      name: x.name,
      cents: x.cents,
      previousCents: x.previousCents,
      changeCents: x.cents - x.previousCents,
    }))
    .filter((x) => x.changeCents * sign > 0)
    .sort(
      (a, b) =>
        Math.abs(b.changeCents) - Math.abs(a.changeCents) ||
        a.name.localeCompare(b.name, 'pt-BR') ||
        (a.categoryId < b.categoryId ? -1 : 1),
    )
    .slice(0, MOM_EVIDENCE_CATEGORIES);
  return [
    {
      ...base('MOM_CHANGE', input.month, 'HOUSEHOLD', direction),
      severity: direction === 'UP' ? 'ATTENTION' : 'INFO',
      direction,
      metrics: {
        cents: c.sharedSpendCents,
        previousCents: c.previousCents,
        changeCents: c.changeCents,
        changeBps: c.changeBps,
      },
      evidence: { categories },
    },
  ];
}

/** Display order within a severity: risks first, then context, then good news. */
const ORDER: readonly string[] = [
  'BUDGET_NEAR_LIMIT',
  'CATEGORY_ABOVE_AVERAGE',
  'MOM_CHANGE',
  'CONTRIBUTION_DEVIATION',
  'DOMINANT_CATEGORY',
  'INSTALLMENT_ENDING',
  'CATEGORY_BELOW_AVERAGE',
];

function magnitude(insight: InsightDraft): number {
  switch (insight.ruleId) {
    case 'BUDGET_NEAR_LIMIT':
      return insight.metrics.usedBps;
    case 'CATEGORY_ABOVE_AVERAGE':
    case 'CATEGORY_BELOW_AVERAGE':
      return Math.abs(insight.metrics.differenceCents);
    case 'MOM_CHANGE':
      return Math.abs(insight.metrics.changeCents);
    case 'CONTRIBUTION_DEVIATION':
      return insight.metrics.deviationBps;
    case 'DOMINANT_CATEGORY':
      return insight.metrics.shareBps;
    case 'INSTALLMENT_ENDING':
      return insight.metrics.releasedCents;
  }
}

/** Every insight of the month, ordered (ATTENTION first, then rule, then magnitude). */
export function evaluateInsights(input: InsightInput): InsightDraft[] {
  if (input.period === 'FUTURE') return [];
  return [
    ...budgets(input),
    ...categoryAverages(input),
    ...monthChange(input),
    ...contributionDeviation(input),
    ...dominantCategories(input),
    ...installmentsEnding(input),
  ].sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === 'ATTENTION' ? -1 : 1) ||
      ORDER.indexOf(a.ruleId) - ORDER.indexOf(b.ruleId) ||
      magnitude(b) - magnitude(a) ||
      (a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0),
  );
}
