import type {
  AnalyticsCategoryComparison,
  AnalyticsComparison,
  BudgetStatusView,
  DashboardMember,
} from '@couple-finance/shared';
import fc from 'fast-check';
import { evaluateInsights, type InsightDraft, type InsightInput, RULES } from './rules';

const ANA = 'a-ana';
const BRUNO = 'b-bruno';

function category(
  categoryId: string,
  cents: number,
  previousCents: number,
  averageCents: number | null,
): AnalyticsCategoryComparison {
  const vs = averageCents === null ? null : cents - averageCents;
  return {
    categoryId,
    name: categoryId.replace('c-', ''),
    cents,
    previousCents,
    averageCents,
    vsAverageCents: vs,
    vsAverageBps:
      vs === null || !averageCents ? null : Number((BigInt(vs) * 10_000n) / BigInt(averageCents)),
  };
}

function comparison(
  cents: number,
  previousCents: number,
  categories: AnalyticsCategoryComparison[] = [],
): AnalyticsComparison {
  const change = cents - previousCents;
  return {
    month: '2026-09',
    period: 'PAST',
    sharedSpendCents: cents,
    previousCents,
    changeCents: change,
    changeBps:
      previousCents === 0 ? null : Number((BigInt(change) * 10_000n) / BigInt(previousCents)),
    averageMonths: 3,
    averageCents: previousCents,
    vsAverageCents: change,
    vsAverageBps: null,
    categories,
  };
}

function member(memberId: string, paid: number, planned: number, difference = 0): DashboardMember {
  return {
    memberId,
    status: 'ACTIVE',
    paidCents: 0,
    paidSharedCents: 0,
    responsibleSharedCents: 0,
    paidShareBps: paid,
    responsibleShareBps: planned,
    deviationBps: paid - planned,
    sharedDifferenceCents: difference,
    periodBalanceCents: 0,
    cumulativeBalanceCents: 0,
  };
}

function budget(categoryId: string | null, amount: number, spent: number): BudgetStatusView {
  const usedBps = Math.floor((spent * 10_000) / amount);
  return {
    id: `b-${categoryId ?? 'total'}`,
    categoryId,
    categoryName: categoryId ? 'Mercado' : null,
    categoryArchived: false,
    amountCents: amount,
    spentCents: spent,
    remainingCents: amount - spent,
    usedBps,
    state: usedBps >= 10_000 ? 'EXCEEDED' : usedBps >= 8_000 ? 'WARNING' : 'OK',
    fromMonth: '2026-01',
    toMonth: null,
    next: null,
  };
}

function input(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    month: '2026-09',
    period: 'PAST',
    members: [member(ANA, 5000, 5000), member(BRUNO, 5000, 5000)],
    categories: [],
    explanations: [],
    comparison: comparison(100_000, 100_000),
    budgets: [],
    releases: [],
    ...overrides,
  };
}

const rules = (drafts: InsightDraft[]) => drafts.map((d) => d.fingerprint);

describe('insight rules (CALCULATIONS §10)', () => {
  it('flags a category above 120% of its average by at least R$ 50, exactly at the boundary', () => {
    const result = evaluateInsights(
      input({
        comparison: comparison(0, 0, [
          category('c-mercado', 120_001, 0, 100_000), // just above 120%
          category('c-lazer', 120_000, 0, 100_000), // exactly 120%: not above
          category('c-pets', 4_999, 0, 0), // new spending under R$ 50
          category('c-farmacia', 5_000, 0, 0), // new spending of R$ 50
        ]),
      }),
    );
    expect(rules(result)).toEqual([
      'CATEGORY_ABOVE_AVERAGE:2026-09:c-mercado',
      'CATEGORY_ABOVE_AVERAGE:2026-09:c-farmacia',
    ]);
    expect(result[0]).toMatchObject({
      severity: 'ATTENTION',
      ruleVersion: 1,
      thresholds: { ratioBps: 12_000, minDifferenceCents: 5_000 },
      category: { categoryId: 'c-mercado', name: 'mercado' },
      metrics: {
        cents: 120_001,
        averageCents: 100_000,
        averageMonths: 3,
        differenceCents: 20_001,
        differenceBps: 2000,
      },
    });
    expect(result[1]).toMatchObject({ metrics: { averageCents: 0, differenceBps: null } });
  });

  it('reports reductions below 80% of the average only for closed months', () => {
    const categories = [
      category('c-mercado', 79_999, 0, 100_000),
      category('c-lazer', 80_000, 0, 100_000), // exactly 80%: not below
      category('c-pets', 0, 0, 4_000), // less than R$ 50 of difference
    ];
    expect(rules(evaluateInsights(input({ comparison: comparison(0, 0, categories) })))).toEqual([
      'CATEGORY_BELOW_AVERAGE:2026-09:c-mercado',
    ]);
    expect(
      evaluateInsights(input({ period: 'CURRENT', comparison: comparison(0, 0, categories) })),
    ).toEqual([]);
  });

  it('flags budgets in warning or exceeded, with the state in the fingerprint', () => {
    const result = evaluateInsights(
      input({
        budgets: [
          budget(null, 500_000, 399_999),
          budget('c-mercado', 100_000, 80_000),
          budget('c-lazer', 10_000, 12_000),
        ],
      }),
    );
    expect(rules(result)).toEqual([
      'BUDGET_NEAR_LIMIT:2026-09:c-lazer:EXCEEDED',
      'BUDGET_NEAR_LIMIT:2026-09:c-mercado:WARNING',
    ]);
    expect(result[0]).toMatchObject({
      severity: 'ATTENTION',
      metrics: { state: 'EXCEEDED', usedBps: 12_000, remainingCents: -2_000 },
    });
  });

  it('announces installments ending within the next 2 months, in the current month only', () => {
    const releases = [
      {
        month: '2026-10',
        releasedCents: 42_000,
        plans: [{ id: 'p-sofa', description: 'Sofá', installmentAmountCents: 42_000 }],
      },
      {
        month: '2026-11',
        releasedCents: 10_000,
        plans: [{ id: 'p-tv', description: 'TV', installmentAmountCents: 10_000 }],
      },
      {
        month: '2026-12',
        releasedCents: 5_000,
        plans: [{ id: 'p-far', description: 'Mesa', installmentAmountCents: 5_000 }],
      },
    ];
    const current = evaluateInsights(input({ period: 'CURRENT', releases }));
    expect(rules(current)).toEqual([
      'INSTALLMENT_ENDING:2026-09:p-sofa',
      'INSTALLMENT_ENDING:2026-09:p-tv',
    ]);
    expect(current[0]).toMatchObject({
      severity: 'INFO',
      plan: { id: 'p-sofa', description: 'Sofá' },
      metrics: { releaseMonth: '2026-10', releasedCents: 42_000 },
    });
    expect(evaluateInsights(input({ releases }))).toEqual([]);
  });

  it('explains a contribution deviation of at least 5 p.p. from the member above plan', () => {
    const evidence = {
      categories: [{ categoryId: 'c-moradia', name: 'Moradia', deltaCents: 60_000 }],
      transactions: [],
    };
    const result = evaluateInsights(
      input({
        members: [member(ANA, 5900, 5000, 90_000), member(BRUNO, 4100, 5000, -90_000)],
        explanations: [{ memberId: ANA, direction: 'ABOVE', ...evidence }],
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        fingerprint: `CONTRIBUTION_DEVIATION:2026-09:${ANA}`,
        severity: 'INFO',
        memberId: ANA,
        metrics: {
          paidShareBps: 5900,
          responsibleShareBps: 5000,
          deviationBps: 900,
          differenceCents: 90_000,
        },
        evidence,
      }),
    ]);
    expect(
      evaluateInsights(input({ members: [member(ANA, 5499, 5000), member(BRUNO, 4501, 5000)] })),
    ).toEqual([]);
  });

  it('flags every category with at least 35% of the shared spend', () => {
    const result = evaluateInsights(
      input({
        categories: [
          {
            categoryId: 'c-moradia',
            name: 'Moradia',
            sharedSpendCents: 350_000,
            shareBps: 3500,
            transactionCount: 1,
          },
          {
            categoryId: 'c-mercado',
            name: 'Mercado',
            sharedSpendCents: 349_900,
            shareBps: 3499,
            transactionCount: 9,
          },
          {
            categoryId: 'c-lazer',
            name: 'Lazer',
            sharedSpendCents: 300_100,
            shareBps: 3001,
            transactionCount: 3,
          },
        ],
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        fingerprint: 'DOMINANT_CATEGORY:2026-09:c-moradia',
        metrics: { cents: 350_000, sharedSpendCents: 1_000_000, shareBps: 3500 },
      }),
    ]);
  });

  it('flags month-over-month changes of 25% and R$ 200 with the categories behind them', () => {
    const categories = [
      category('c-mercado', 90_000, 50_000, null),
      category('c-lazer', 30_000, 10_000, null),
      category('c-pets', 0, 5_000, null),
      category('c-moradia', 5_000, 0, null),
      category('c-farmacia', 5_000, 0, null),
    ];
    const up = evaluateInsights(input({ comparison: comparison(130_000, 65_000, categories) }));
    expect(up).toEqual([
      expect.objectContaining({
        fingerprint: 'MOM_CHANGE:2026-09:HOUSEHOLD:UP',
        severity: 'ATTENTION',
        direction: 'UP',
        metrics: { cents: 130_000, previousCents: 65_000, changeCents: 65_000, changeBps: 10_000 },
        evidence: {
          categories: [
            {
              categoryId: 'c-mercado',
              name: 'mercado',
              cents: 90_000,
              previousCents: 50_000,
              changeCents: 40_000,
            },
            {
              categoryId: 'c-lazer',
              name: 'lazer',
              cents: 30_000,
              previousCents: 10_000,
              changeCents: 20_000,
            },
            // Ties by name: farmacia before moradia.
            {
              categoryId: 'c-farmacia',
              name: 'farmacia',
              cents: 5_000,
              previousCents: 0,
              changeCents: 5_000,
            },
          ],
        },
      }),
    ]);
    // 25% but under R$ 200; R$ 200 but under 25%; no previous month.
    expect(evaluateInsights(input({ comparison: comparison(25_000, 20_000) }))).toEqual([]);
    expect(evaluateInsights(input({ comparison: comparison(1_020_000, 1_000_000) }))).toEqual([]);
    expect(evaluateInsights(input({ comparison: comparison(500_000, 0) }))).toEqual([]);
    // A decrease is confirmed only once the month is closed.
    const down = comparison(60_000, 100_000);
    expect(rules(evaluateInsights(input({ comparison: down })))).toEqual([
      'MOM_CHANGE:2026-09:HOUSEHOLD:DOWN',
    ]);
    expect(evaluateInsights(input({ period: 'CURRENT', comparison: down }))).toEqual([]);
  });

  it('returns nothing for future months and orders ATTENTION first, then by rule and size', () => {
    const busy = input({
      budgets: [budget('c-mercado', 100_000, 85_000), budget(null, 100_000, 99_000)],
      categories: [
        {
          categoryId: 'c-moradia',
          name: 'Moradia',
          sharedSpendCents: 60_000,
          shareBps: 6000,
          transactionCount: 1,
        },
      ],
      comparison: comparison(100_000, 60_000, [category('c-mercado', 40_000, 0, 20_000)]),
    });
    expect(evaluateInsights({ ...busy, period: 'FUTURE' })).toEqual([]);
    expect(rules(evaluateInsights(busy))).toEqual([
      'BUDGET_NEAR_LIMIT:2026-09:TOTAL:WARNING',
      'BUDGET_NEAR_LIMIT:2026-09:c-mercado:WARNING',
      'CATEGORY_ABOVE_AVERAGE:2026-09:c-mercado',
      'MOM_CHANGE:2026-09:HOUSEHOLD:UP',
      'DOMINANT_CATEGORY:2026-09:c-moradia',
    ]);
  });

  it('carries each rule version and thresholds, and is deterministic (property)', () => {
    const arb = fc.array(
      fc.record({
        cents: fc.integer({ min: 0, max: 5_000_000 }),
        previous: fc.integer({ min: 0, max: 5_000_000 }),
        average: fc.option(fc.integer({ min: 0, max: 5_000_000 }), { nil: null }),
      }),
      { maxLength: 8 },
    );
    fc.assert(
      fc.property(arb, (rows) => {
        const categories = rows.map((r, i) =>
          category(`c-${String(i)}`, r.cents, r.previous, r.average),
        );
        const total = rows.reduce((s, r) => s + r.cents, 0);
        const previous = rows.reduce((s, r) => s + r.previous, 0);
        const value = input({ comparison: comparison(total, previous, categories) });
        const first = evaluateInsights(value);
        expect(evaluateInsights(value)).toEqual(first);
        expect(new Set(first.map((d) => d.fingerprint)).size).toBe(first.length);
        for (const draft of first) {
          expect(draft.thresholds).toEqual(RULES[draft.ruleId].thresholds);
          expect(draft.fingerprint).toMatch(/^[A-Z_]+:2026-09:/);
          if (draft.ruleId === 'CATEGORY_ABOVE_AVERAGE') {
            expect(draft.metrics.cents * 10_000).toBeGreaterThan(
              draft.metrics.averageCents * 12_000,
            );
          }
        }
      }),
    );
  });
});
