import fc from 'fast-check';
import { type CategoryInfo } from './contribution';
import {
  computeTrends,
  periodOf,
  ratioBps,
  type ResponsibilityFact,
  type SpendFact,
  type TrendsInput,
} from './trends';

const ANA = 'a-ana';
const BRUNO = 'b-bruno';
const CAIO = 'c-caio';
const MORADIA: CategoryInfo = { topLevelId: 'c-moradia', topLevelName: 'Moradia' };
const MERCADO: CategoryInfo = { topLevelId: 'c-mercado', topLevelName: 'Mercado' };
const LAZER: CategoryInfo = { topLevelId: 'c-lazer', topLevelName: 'Lazer' };
const categories = new Map<string, CategoryInfo>([
  ['c-moradia', MORADIA],
  ['c-aluguel', MORADIA],
  ['c-mercado', MERCADO],
  ['c-lazer', LAZER],
]);
const WINDOW = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];

function fact(
  month: string,
  amountCents: number,
  payerMemberId: string,
  categoryId: string,
  origin: SpendFact['origin'] = 'NONE',
  shared = true,
): SpendFact {
  return { month, amountCents, payerMemberId, categoryId, origin, shared };
}

/** Half each for every shared fact (the couple's default split). */
function halves(facts: readonly SpendFact[]): ResponsibilityFact[] {
  return facts
    .filter((f) => f.shared)
    .flatMap((f) => [
      { month: f.month, memberId: ANA, amountCents: Math.ceil(f.amountCents / 2) },
      { month: f.month, memberId: BRUNO, amountCents: Math.floor(f.amountCents / 2) },
    ]);
}

const FACTS: SpendFact[] = [
  fact('2026-07', 200_000, ANA, 'c-aluguel', 'RECURRING'),
  fact('2026-07', 60_000, BRUNO, 'c-mercado'),
  fact('2026-07', 5_000, ANA, 'c-lazer', 'NONE', false),
  fact('2026-08', 200_000, ANA, 'c-aluguel', 'RECURRING'),
  fact('2026-08', 30_000, BRUNO, 'c-lazer', 'INSTALLMENT'),
  fact('2026-08', 90_000, ANA, 'c-mercado'),
  fact('2026-09', 200_000, ANA, 'c-aluguel', 'RECURRING'),
  fact('2026-09', 30_000, BRUNO, 'c-lazer', 'INSTALLMENT'),
  fact('2026-09', 70_000, BRUNO, 'c-mercado'),
  fact('2026-10', 200_000, ANA, 'c-aluguel', 'RECURRING'),
  fact('2026-10', 30_000, BRUNO, 'c-lazer', 'INSTALLMENT'),
  fact('2026-10', 100_000, ANA, 'c-mercado'),
];

function input(overrides: Partial<TrendsInput> = {}): TrendsInput {
  return {
    months: WINDOW,
    currentMonth: '2026-10',
    firstExpenseMonth: '2026-07',
    members: [
      { id: ANA, status: 'ACTIVE' },
      { id: BRUNO, status: 'ACTIVE' },
      { id: CAIO, status: 'LEFT' },
    ],
    facts: FACTS,
    responsibility: halves(FACTS),
    categories,
    incomes: new Map([
      ['2026-09', null],
      ['2026-10', 1_000_000],
    ]),
    incomeVisible: false,
    ...overrides,
  };
}

describe('analytics trends', () => {
  it('computes ratios truncated toward zero and month periods', () => {
    expect(ratioBps(60_000, 260_000)).toBe(2307);
    expect(ratioBps(-20_000, 320_000)).toBe(-625);
    expect(ratioBps(1, 0)).toBeNull();
    expect(ratioBps(9_007_199_254_740_991, 9_007_199_254_740_990)).toBe(10_000);
    expect(periodOf('2026-09', '2026-10')).toBe('PAST');
    expect(periodOf('2026-10', '2026-10')).toBe('CURRENT');
    expect(periodOf('2026-11', '2026-10')).toBe('FUTURE');
  });

  it('builds the monthly trend with fixed vs variable spend and month-over-month change', () => {
    const result = computeTrends(input());
    expect(
      result.months.map((m) => [
        m.month,
        m.period,
        m.sharedSpendCents,
        m.fixedCents,
        m.installmentCents,
        m.otherCents,
        m.changeCents,
        m.changeBps,
      ]),
    ).toEqual([
      ['2026-06', 'PAST', 0, 0, 0, 0, null, null],
      ['2026-07', 'PAST', 260_000, 200_000, 0, 60_000, 260_000, null],
      ['2026-08', 'PAST', 320_000, 230_000, 30_000, 90_000, 60_000, 2307],
      ['2026-09', 'PAST', 300_000, 230_000, 30_000, 70_000, -20_000, -625],
      ['2026-10', 'CURRENT', 330_000, 230_000, 30_000, 100_000, 30_000, 1000],
    ]);
    // Individual spend stays out of every shared figure.
    expect(result.months[1]?.individualSpendCents).toBe(5_000);
    expect(result.months[1]?.recurringCents).toBe(200_000);
  });

  it('shows paid vs planned shares per member and leaves out former members without figures', () => {
    const result = computeTrends(input());
    expect(result.members).toEqual([
      { memberId: ANA, status: 'ACTIVE' },
      { memberId: BRUNO, status: 'ACTIVE' },
    ]);
    expect(result.months[4]?.members).toEqual([
      {
        memberId: ANA,
        paidSharedCents: 300_000,
        responsibleSharedCents: 165_000,
        paidShareBps: 9091,
        responsibleShareBps: 5000,
        deviationBps: 4091,
      },
      {
        memberId: BRUNO,
        paidSharedCents: 30_000,
        responsibleSharedCents: 165_000,
        paidShareBps: 909,
        responsibleShareBps: 5000,
        deviationBps: -4091,
      },
    ]);
    // A month without shared spend has no shares.
    expect(result.months[0]?.members[0]?.paidShareBps).toBeNull();
  });

  it('keeps a former member who has figures in the window', () => {
    const facts = [...FACTS, fact('2026-08', 10_000, CAIO, 'c-mercado')];
    const result = computeTrends(input({ facts }));
    expect(result.members.map((m) => m.memberId)).toEqual([ANA, BRUNO, CAIO]);
    const august = result.months[2]?.members.map((m) => m.paidShareBps);
    expect(august?.reduce<number>((sum, bps) => sum + (bps ?? 0), 0)).toBe(10_000);
  });

  it('relates spend to household income and hides the amount unless every partner is EXACT', () => {
    const hidden = computeTrends(input());
    expect(hidden.months[4]?.income).toEqual({
      complete: true,
      incomeCents: null,
      fixedBps: 2300,
      spendBps: 3300,
    });
    expect(hidden.months[3]?.income).toEqual({
      complete: false,
      incomeCents: null,
      fixedBps: null,
      spendBps: null,
    });
    expect(computeTrends(input({ incomeVisible: true })).months[4]?.income.incomeCents).toBe(
      1_000_000,
    );
  });

  it('averages closed months since the first expense only', () => {
    const { averages } = computeTrends(input());
    // June (before the first expense) and October (current) are left out.
    expect(averages).toEqual({
      months: 3,
      sharedSpendCents: 293_333,
      fixedCents: 220_000,
      installmentCents: 20_000,
      otherCents: 73_333,
    });
    const none = computeTrends(input({ firstExpenseMonth: null, facts: [], responsibility: [] }));
    expect(none.averages).toEqual({
      months: 0,
      sharedSpendCents: null,
      fixedCents: null,
      installmentCents: null,
      otherCents: null,
    });
  });

  it('compares the last month with the previous one and the 3-month average, per category', () => {
    const { comparison } = computeTrends(input());
    expect(comparison).toMatchObject({
      month: '2026-10',
      period: 'CURRENT',
      sharedSpendCents: 330_000,
      previousCents: 300_000,
      changeCents: 30_000,
      changeBps: 1000,
      averageMonths: 3,
      averageCents: 293_333,
      vsAverageCents: 36_667,
      vsAverageBps: 1250,
    });
    expect(comparison.categories).toEqual([
      {
        categoryId: 'c-moradia',
        name: 'Moradia',
        cents: 200_000,
        previousCents: 200_000,
        averageCents: 200_000,
        vsAverageCents: 0,
        vsAverageBps: 0,
      },
      {
        categoryId: 'c-mercado',
        name: 'Mercado',
        cents: 100_000,
        previousCents: 70_000,
        averageCents: 73_333,
        vsAverageCents: 26_667,
        vsAverageBps: 3636,
      },
      {
        categoryId: 'c-lazer',
        name: 'Lazer',
        cents: 30_000,
        previousCents: 30_000,
        averageCents: 20_000,
        vsAverageCents: 10_000,
        vsAverageBps: 5000,
      },
    ]);
  });

  it('uses fewer average months for a recent household and works for a one-month window', () => {
    const { comparison } = computeTrends(input({ months: ['2026-08'], currentMonth: '2026-10' }));
    expect(comparison).toMatchObject({
      month: '2026-08',
      period: 'PAST',
      sharedSpendCents: 320_000,
      previousCents: 260_000,
      averageMonths: 1,
      averageCents: 260_000,
    });
  });

  it('rolls subcategories up into window categories with shares adding up to 10000', () => {
    const { categories: result } = computeTrends(input());
    expect(result.map((c) => [c.categoryId, c.totalCents, c.shareBps])).toEqual([
      ['c-moradia', 800_000, 6611],
      ['c-mercado', 320_000, 2645],
      ['c-lazer', 90_000, 744],
    ]);
    expect(result[0]?.monthlyCents).toEqual([0, 200_000, 200_000, 200_000, 200_000]);
  });

  it('reconciles every breakdown with the monthly totals (property)', () => {
    const months = ['2026-01', '2026-02', '2026-03', '2026-04'];
    const factArb = fc.record({
      month: fc.constantFrom(...months),
      amountCents: fc.integer({ min: 1, max: 50_000_000 }),
      payerMemberId: fc.constantFrom(ANA, BRUNO),
      categoryId: fc.constantFrom('c-moradia', 'c-aluguel', 'c-mercado', 'c-lazer'),
      origin: fc.constantFrom<SpendFact['origin']>('NONE', 'RECURRING', 'INSTALLMENT'),
      shared: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(factArb, { maxLength: 30 }), (facts) => {
        const result = computeTrends(
          input({
            months: months.slice(1),
            currentMonth: '2026-05',
            firstExpenseMonth: '2026-01',
            facts,
            responsibility: halves(facts),
            incomes: new Map(),
          }),
        );
        const windowSpend = result.months.reduce((sum, m) => sum + m.sharedSpendCents, 0);
        expect(result.categories.reduce((sum, c) => sum + c.totalCents, 0)).toBe(windowSpend);
        if (result.categories.length > 0) {
          expect(result.categories.reduce((sum, c) => sum + c.shareBps, 0)).toBe(10_000);
        }
        for (const [index, month] of result.months.entries()) {
          expect(month.fixedCents + month.otherCents).toBe(month.sharedSpendCents);
          expect(result.categories.reduce((sum, c) => sum + (c.monthlyCents[index] ?? 0), 0)).toBe(
            month.sharedSpendCents,
          );
          if (month.sharedSpendCents > 0) {
            expect(month.members.reduce((sum, m) => sum + (m.paidShareBps ?? 0), 0)).toBe(10_000);
            expect(month.members.reduce((sum, m) => sum + m.paidSharedCents, 0)).toBe(
              month.sharedSpendCents,
            );
          }
        }
        expect(result.comparison.categories.reduce((sum, c) => sum + c.cents, 0)).toBe(
          result.comparison.sharedSpendCents,
        );
      }),
    );
  });
});
