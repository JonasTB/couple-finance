import fc from 'fast-check';
import {
  compareItems,
  goalCoverageBps,
  type PlanItem,
  planStatus,
  planTotals,
} from './purchase-plan';

const item = (overrides: Partial<PlanItem & { name: string }>): PlanItem & { name: string } => ({
  name: 'Item',
  estimatedPriceCents: 10000,
  quantity: 1,
  status: 'PENDING',
  paidPriceCents: null,
  priority: 'MEDIUM',
  ...overrides,
});

describe('planTotals (CALCULATIONS §9)', () => {
  it('separates estimate, actual, remaining need and future items', () => {
    const totals = planTotals([
      item({ name: 'Sofá', estimatedPriceCents: 250000 }),
      item({ name: 'Cadeiras', estimatedPriceCents: 30000, quantity: 4 }),
      item({
        name: 'Geladeira',
        estimatedPriceCents: 400000,
        status: 'PURCHASED',
        paidPriceCents: 379900,
      }),
      item({
        name: 'Fogão',
        estimatedPriceCents: 150000,
        status: 'PURCHASED',
        paidPriceCents: 162000,
      }),
      item({ name: 'Piano', estimatedPriceCents: 900000, status: 'FUTURE' }),
    ]);
    expect(totals).toEqual({
      estimatedCents: 250000 + 120000 + 400000 + 150000,
      futureCents: 900000,
      actualCents: 379900 + 162000,
      remainingNeedCents: 370000,
      varianceCents: -20100 + 12000,
      pendingCount: 2,
      purchasedCount: 2,
      futureCount: 1,
    });
    expect(planStatus(totals, false)).toBe('ACTIVE');
  });

  it('reconciles: estimate = remaining need + purchased estimate (property)', () => {
    const arb = fc.record({
      estimatedPriceCents: fc.integer({ min: 1, max: 10_000_000 }),
      quantity: fc.integer({ min: 1, max: 999 }),
      status: fc.constantFrom('PENDING' as const, 'PURCHASED' as const, 'FUTURE' as const),
      paidPriceCents: fc.integer({ min: 0, max: 10_000_000 }),
      priority: fc.constantFrom('HIGH' as const, 'MEDIUM' as const, 'LOW' as const),
    });
    fc.assert(
      fc.property(fc.array(arb, { maxLength: 40 }), (raw) => {
        const items = raw.map((i) => ({
          ...i,
          paidPriceCents: i.status === 'PURCHASED' ? i.paidPriceCents : null,
        }));
        const t = planTotals(items);
        expect(t.estimatedCents).toBe(t.remainingNeedCents + (t.actualCents - t.varianceCents));
        expect(t.pendingCount + t.purchasedCount + t.futureCount).toBe(items.length);
      }),
    );
  });

  it('derives the plan status', () => {
    const done = planTotals([
      item({ status: 'PURCHASED', paidPriceCents: 1 }),
      item({ status: 'FUTURE' }),
    ]);
    expect(planStatus(done, false)).toBe('COMPLETED');
    expect(planStatus(planTotals([]), false)).toBe('ACTIVE');
    expect(planStatus(done, true)).toBe('ARCHIVED');
  });
});

describe('goalCoverageBps', () => {
  it('caps at 100% and ignores plans with nothing left', () => {
    expect(goalCoverageBps(185000, 370000)).toBe(5000);
    expect(goalCoverageBps(999999, 370000)).toBe(10000);
    expect(goalCoverageBps(-5, 370000)).toBe(0);
    expect(goalCoverageBps(100, 0)).toBeNull();
  });
});

describe('compareItems', () => {
  it('orders pending by priority, then purchased, then future', () => {
    const items = [
      item({ name: 'C', status: 'FUTURE' }),
      item({ name: 'B', priority: 'LOW' }),
      item({ name: 'A', status: 'PURCHASED', paidPriceCents: 1 }),
      item({ name: 'D', priority: 'HIGH' }),
    ];
    expect([...items].sort(compareItems).map((i) => i.name)).toEqual(['D', 'B', 'A', 'C']);
  });
});
