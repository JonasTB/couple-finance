import fc from 'fast-check';
import { allocateLargestRemainder } from '../../../common/money/allocation';
import {
  balanceOf,
  type CategoryInfo,
  computeContribution,
  type ContributionEntry,
  expenseDeltas,
  type ContributionInput,
  type Flows,
  suggestSettlement,
} from './contribution';

const ANA = 'a-ana';
const BRUNO = 'b-bruno';
const MORADIA: CategoryInfo = { topLevelId: 'c-moradia', topLevelName: 'Moradia' };
const MERCADO: CategoryInfo = { topLevelId: 'c-mercado', topLevelName: 'Mercado' };
const LAZER: CategoryInfo = { topLevelId: 'c-lazer', topLevelName: 'Lazer' };
const categories = new Map<string, CategoryInfo>([
  ['c-moradia', MORADIA],
  ['c-condominio', MORADIA],
  ['c-mercado', MERCADO],
  ['c-supermercado', MERCADO],
  ['c-lazer', LAZER],
]);

let sequence = 0;
function entry(
  amountCents: number,
  payerMemberId: string,
  split: Record<string, number>,
  extra: Partial<ContributionEntry> = {},
): ContributionEntry {
  sequence += 1;
  return {
    id: `t-${String(sequence).padStart(3, '0')}`,
    description: `Despesa ${String(sequence)}`,
    date: '2026-03-10',
    amountCents,
    categoryId: 'c-mercado',
    payerMemberId,
    shared: Object.keys(split).length > 1,
    allocations: Object.entries(split).map(([memberId, cents]) => ({
      memberId,
      amountCents: cents,
    })),
    ...extra,
  };
}

const couple: ContributionInput['members'] = [
  { id: ANA, status: 'ACTIVE' },
  { id: BRUNO, status: 'ACTIVE' },
];

function input(overrides: Partial<ContributionInput>): ContributionInput {
  return {
    members: couple,
    entries: [],
    periodSettlements: new Map(),
    cumulative: new Map(),
    categories,
    ...overrides,
  };
}

describe('computeContribution', () => {
  it('splits totals into shared and individual spend', () => {
    const result = computeContribution(
      input({
        entries: [
          entry(10000, ANA, { [ANA]: 5000, [BRUNO]: 5000 }),
          entry(3000, BRUNO, { [BRUNO]: 3000 }),
        ],
      }),
    );
    expect(result.totals).toEqual({
      sharedSpendCents: 10000,
      individualSpendCents: 3000,
      totalSpendCents: 13000,
      transactionCount: 2,
    });
  });

  it('computes paid vs planned shares on shared expenses only (Q-07)', () => {
    // Ana pays R$ 590 of R$ 1.000 shared, planned 50/50; Bruno's individual R$ 500 is ignored.
    const result = computeContribution(
      input({
        entries: [
          entry(59000, ANA, { [ANA]: 29500, [BRUNO]: 29500 }),
          entry(41000, BRUNO, { [ANA]: 20500, [BRUNO]: 20500 }),
          entry(50000, BRUNO, { [BRUNO]: 50000 }),
        ],
      }),
    );
    const [ana, bruno] = result.members;
    expect(ana).toMatchObject({
      paidShareBps: 5900,
      responsibleShareBps: 5000,
      deviationBps: 900,
      sharedDifferenceCents: 9000,
      paidCents: 59000,
    });
    expect(bruno).toMatchObject({
      paidShareBps: 4100,
      responsibleShareBps: 5000,
      deviationBps: -900,
      sharedDifferenceCents: -9000,
      paidCents: 91000,
    });
  });

  it('balances use every expense and settlements', () => {
    // Ana paid Bruno's individual R$ 100 → Bruno is R$ 100 behind; a R$ 40 settlement narrows it.
    const result = computeContribution(
      input({
        entries: [entry(10000, ANA, { [BRUNO]: 10000 })],
        periodSettlements: new Map([
          [BRUNO, { sentCents: 4000, receivedCents: 0 }],
          [ANA, { sentCents: 0, receivedCents: 4000 }],
        ]),
      }),
    );
    expect(result.members.map((m) => m.periodBalanceCents)).toEqual([6000, -6000]);
    // No shared spend: no shares, no explanation.
    expect(result.members[0]?.paidShareBps).toBeNull();
    expect(result.explanations).toEqual([]);
  });

  it('explains the deviation with top categories and expenses (CALCULATIONS §4)', () => {
    const result = computeContribution(
      input({
        entries: [
          entry(120000, ANA, { [ANA]: 60000, [BRUNO]: 60000 }, { categoryId: 'c-condominio' }),
          entry(58000, ANA, { [ANA]: 29000, [BRUNO]: 29000 }, { categoryId: 'c-supermercado' }),
          entry(20000, BRUNO, { [ANA]: 10000, [BRUNO]: 10000 }, { categoryId: 'c-lazer' }),
        ],
      }),
    );
    const ana = result.explanations.find((e) => e.memberId === ANA);
    expect(ana?.direction).toBe('ABOVE');
    expect(ana?.categories).toEqual([
      { categoryId: 'c-moradia', name: 'Moradia', deltaCents: 60000 },
      { categoryId: 'c-mercado', name: 'Mercado', deltaCents: 29000 },
    ]);
    expect(ana?.transactions.map((t) => t.deltaCents)).toEqual([60000, 29000]);

    const bruno = result.explanations.find((e) => e.memberId === BRUNO);
    expect(bruno?.direction).toBe('BELOW');
    expect(bruno?.categories[0]).toMatchObject({ categoryId: 'c-moradia', deltaCents: -60000 });

    // Categories are top-level and ordered by shared spend.
    expect(result.categories.map((c) => [c.name, c.sharedSpendCents, c.shareBps])).toEqual([
      ['Moradia', 120000, 6061],
      ['Mercado', 58000, 2929],
      ['Lazer', 20000, 1010],
    ]);
  });

  it('caps the evidence at 3 categories and 5 expenses', () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      entry(
        1000 * (i + 1),
        ANA,
        { [ANA]: 500 * (i + 1), [BRUNO]: 500 * (i + 1) },
        {
          categoryId: ['c-moradia', 'c-mercado', 'c-lazer', 'c-supermercado'][i % 4] ?? 'c-lazer',
        },
      ),
    );
    const [explanation] = computeContribution(input({ entries })).explanations;
    expect(explanation?.categories.length).toBeLessThanOrEqual(3);
    expect(explanation?.transactions).toHaveLength(5);
    expect(explanation?.transactions[0]?.deltaCents).toBe(4000);
  });

  it('shows former members only when they have figures', () => {
    const members: ContributionInput['members'] = [
      { id: ANA, status: 'ACTIVE' },
      { id: 'c-carla', status: 'LEFT' },
      { id: 'd-davi', status: 'LEFT' },
      { id: BRUNO, status: 'ACTIVE' },
    ];
    const result = computeContribution(
      input({
        members,
        entries: [entry(1000, 'c-carla', { [ANA]: 500, 'c-carla': 500 })],
      }),
    );
    expect(result.members.map((m) => m.memberId)).toEqual([ANA, 'c-carla', BRUNO]);
  });

  it('suggests one settlement when exactly two members carry a balance', () => {
    const cumulative = new Map<string, Flows>([
      [
        ANA,
        {
          paidCents: 30000,
          responsibleCents: 20000,
          settlementsSentCents: 0,
          settlementsReceivedCents: 0,
        },
      ],
      [
        BRUNO,
        {
          paidCents: 10000,
          responsibleCents: 20000,
          settlementsSentCents: 0,
          settlementsReceivedCents: 0,
        },
      ],
    ]);
    const result = computeContribution(input({ cumulative }));
    expect(result.members.map((m) => m.cumulativeBalanceCents)).toEqual([10000, -10000]);
    expect(result.settlementSuggestion).toEqual({
      fromMemberId: BRUNO,
      toMemberId: ANA,
      amountCents: 10000,
    });
    expect(
      suggestSettlement(result.members.map((m) => ({ ...m, cumulativeBalanceCents: 0 }))),
    ).toBeNull();
  });
});

describe('computeContribution — properties', () => {
  const memberIds = [ANA, BRUNO, 'c-carla'];
  const categoryIds = [...categories.keys()];

  const entryArb = fc
    .record({
      amountCents: fc.integer({ min: 1, max: 10_000_000 }),
      payer: fc.integer({ min: 0, max: 2 }),
      categoryIndex: fc.integer({ min: 0, max: categoryIds.length - 1 }),
      weights: fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 3, maxLength: 3 }),
    })
    .filter(({ weights }) => weights.some((w) => w > 0))
    .map(({ amountCents, payer, categoryIndex, weights }) => {
      const parts = allocateLargestRemainder(amountCents, weights);
      const allocations = memberIds
        .map((memberId, i) => ({ memberId, amountCents: parts[i] ?? 0 }))
        .filter((_, i) => (weights[i] ?? 0) > 0);
      return {
        amountCents,
        payerMemberId: memberIds[payer] ?? ANA,
        categoryId: categoryIds[categoryIndex] ?? 'c-lazer',
        allocations,
        shared: allocations.length > 1,
      };
    });

  const settlementArb = fc.record({
    from: fc.integer({ min: 0, max: 2 }),
    to: fc.integer({ min: 0, max: 2 }),
    amountCents: fc.integer({ min: 1, max: 1_000_000 }),
  });

  const scenario = fc
    .tuple(fc.array(entryArb, { maxLength: 40 }), fc.array(settlementArb, { maxLength: 5 }))
    .map(([raw, settlements]) => {
      const entries: ContributionEntry[] = raw.map((e, i) => ({
        ...e,
        id: `t-${String(i).padStart(3, '0')}`,
        description: `#${String(i)}`,
        date: '2026-03-01',
      }));
      const periodSettlements = new Map<string, { sentCents: number; receivedCents: number }>();
      for (const s of settlements.filter((s) => s.from !== s.to)) {
        const from = memberIds[s.from] ?? ANA;
        const to = memberIds[s.to] ?? BRUNO;
        const a = periodSettlements.get(from) ?? { sentCents: 0, receivedCents: 0 };
        a.sentCents += s.amountCents;
        periodSettlements.set(from, a);
        const b = periodSettlements.get(to) ?? { sentCents: 0, receivedCents: 0 };
        b.receivedCents += s.amountCents;
        periodSettlements.set(to, b);
      }
      return input({
        members: memberIds.map((id) => ({ id, status: 'ACTIVE' as const })),
        entries,
        periodSettlements,
      });
    });

  it('Σ period balances = 0 and Σ deviations = 0', () => {
    fc.assert(
      fc.property(scenario, (data) => {
        const result = computeContribution(data);
        const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
        expect(sum(result.members.map((m) => m.periodBalanceCents))).toBe(0);
        expect(sum(result.members.map((m) => m.sharedDifferenceCents))).toBe(0);
        if (result.totals.sharedSpendCents > 0) {
          expect(sum(result.members.map((m) => m.deviationBps ?? 0))).toBe(0);
          expect(sum(result.members.map((m) => m.paidShareBps ?? 0))).toBe(10000);
          expect(sum(result.categories.map((c) => c.shareBps))).toBe(10000);
        }
        expect(sum(result.categories.map((c) => c.sharedSpendCents))).toBe(
          result.totals.sharedSpendCents,
        );
      }),
    );
  });

  it('attribution reconciles: Σ_m delta = 0 per expense and Σ_tx delta_m = difference_m', () => {
    fc.assert(
      fc.property(scenario, (data) => {
        const result = computeContribution(data);
        const byMember = new Map<string, number>();
        for (const e of data.entries.filter((e) => e.shared)) {
          const deltas = expenseDeltas(e);
          expect([...deltas.values()].reduce((a, b) => a + b, 0)).toBe(0);
          for (const [memberId, delta] of deltas) {
            byMember.set(memberId, (byMember.get(memberId) ?? 0) + delta);
          }
        }
        for (const member of result.members) {
          expect(byMember.get(member.memberId) ?? 0).toBe(member.sharedDifferenceCents);
        }
        // The evidence shown points the same way as the difference it explains.
        for (const explanation of result.explanations) {
          const sign = explanation.direction === 'ABOVE' ? 1 : -1;
          const member = result.members.find((m) => m.memberId === explanation.memberId);
          expect(Math.sign(member?.sharedDifferenceCents ?? 0)).toBe(sign);
          for (const item of [...explanation.categories, ...explanation.transactions]) {
            expect(Math.sign(item.deltaCents)).toBe(sign);
          }
        }
      }),
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(scenario, (data) => {
        expect(computeContribution(data)).toEqual(computeContribution(data));
      }),
    );
  });
});

describe('balanceOf', () => {
  it('settlements sent count as contribution, received ones offset it', () => {
    expect(
      balanceOf({
        paidCents: 100,
        responsibleCents: 300,
        settlementsSentCents: 200,
        settlementsReceivedCents: 0,
      }),
    ).toBe(0);
  });
});
