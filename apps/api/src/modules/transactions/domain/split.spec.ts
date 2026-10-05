import fc from 'fast-check';
import {
  allocateSplit,
  planSplit,
  reallocate,
  SplitError,
  splitFromDefault,
  type SplitContext,
} from './split';

const A = 'member-a';
const B = 'member-b';
const C = 'former-c';
const context: SplitContext = { eligibleMemberIds: [A, B], defaultParticipantIds: [A, B] };

function resolve(amount: number, input: Parameters<typeof planSplit>[0], ctx = context) {
  return allocateSplit(amount, planSplit(input, amount, ctx));
}

function splitError(fn: () => unknown): SplitError {
  try {
    fn();
  } catch (error) {
    if (error instanceof SplitError) return error;
    throw error;
  }
  throw new Error('expected a SplitError');
}

describe('split rules', () => {
  it('EQUAL defaults to every active member; odd cents go to the first in stable order', () => {
    expect(resolve(10001, { type: 'EQUAL' }).allocations).toEqual([
      { memberId: A, amountCents: 5001 },
      { memberId: B, amountCents: 5000 },
    ]);
  });

  it('EQUAL with explicit participants normalizes them to stable member order', () => {
    const result = resolve(300, { type: 'EQUAL', participants: [B, A] });
    expect(result.snapshot.weights.map((w) => w.memberId)).toEqual([A, B]);
  });

  it('INDIVIDUAL makes one member responsible for everything (payer may differ)', () => {
    expect(resolve(4590, { type: 'INDIVIDUAL', responsibleMemberId: B })).toEqual({
      snapshot: { type: 'INDIVIDUAL', weights: [{ memberId: B, weight: 1 }] },
      allocations: [{ memberId: B, amountCents: 4590 }],
    });
  });

  it('CUSTOM_PERCENT allocates by bps with largest remainder', () => {
    const result = resolve(10001, {
      type: 'CUSTOM_PERCENT',
      weights: [
        { memberId: B, bps: 4000 },
        { memberId: A, bps: 6000 },
      ],
    });
    expect(result.allocations).toEqual([
      { memberId: A, amountCents: 6001 },
      { memberId: B, amountCents: 4000 },
    ]);
  });

  it('CUSTOM_AMOUNT keeps the exact amounts', () => {
    const result = resolve(10000, {
      type: 'CUSTOM_AMOUNT',
      amounts: [
        { memberId: A, amountCents: 7000 },
        { memberId: B, amountCents: 3000 },
      ],
    });
    expect(result.allocations).toEqual([
      { memberId: A, amountCents: 7000 },
      { memberId: B, amountCents: 3000 },
    ]);
  });

  it('INCOME_PROPORTIONAL stores only bps and the basis date (never income amounts)', () => {
    const plan = planSplit({ type: 'INCOME_PROPORTIONAL' }, 10001, context);
    const result = allocateSplit(10001, plan, { bps: [6000, 4000], basisDate: '2026-10-04' });
    expect(result).toEqual({
      snapshot: {
        type: 'INCOME_PROPORTIONAL',
        weights: [
          { memberId: A, weight: 6000 },
          { memberId: B, weight: 4000 },
        ],
        incomeBasisDate: '2026-10-04',
      },
      allocations: [
        { memberId: A, amountCents: 6001 },
        { memberId: B, amountCents: 4000 },
      ],
    });
  });

  describe('rejections', () => {
    it.each([
      [
        'a non-member participant',
        { type: 'EQUAL' as const, participants: [A, 'stranger'] },
        'INVALID',
      ],
      ['a duplicated participant', { type: 'EQUAL' as const, participants: [A, A] }, 'INVALID'],
      ['no participants', { type: 'EQUAL' as const, participants: [] }, 'INVALID'],
      ['weights on EQUAL', { type: 'EQUAL' as const, weights: [] }, 'INVALID'],
      ['INDIVIDUAL without a responsible member', { type: 'INDIVIDUAL' as const }, 'INVALID'],
      [
        'percentages not summing to 100%',
        { type: 'CUSTOM_PERCENT' as const, weights: [{ memberId: A, bps: 9999 }] },
        'INVALID',
      ],
      [
        'fractional bps',
        {
          type: 'CUSTOM_PERCENT' as const,
          weights: [
            { memberId: A, bps: 5000.5 },
            { memberId: B, bps: 4999.5 },
          ],
        },
        'INVALID',
      ],
      [
        'custom amounts not summing',
        { type: 'CUSTOM_AMOUNT' as const, amounts: [{ memberId: A, amountCents: 1 }] },
        'SUM_MISMATCH',
      ],
      [
        'negative custom amounts',
        {
          type: 'CUSTOM_AMOUNT' as const,
          amounts: [
            { memberId: A, amountCents: 101 },
            { memberId: B, amountCents: -1 },
          ],
        },
        'INVALID',
      ],
    ])('rejects %s', (_label, input, kind) => {
      expect(splitError(() => planSplit(input, 100, context)).kind).toBe(kind);
    });

    it('reports expected and actual cents on SUM_MISMATCH', () => {
      const error = splitError(() =>
        planSplit(
          {
            type: 'CUSTOM_AMOUNT',
            amounts: [
              { memberId: A, amountCents: 60 },
              { memberId: B, amountCents: 39 },
            ],
          },
          100,
          context,
        ),
      );
      expect(error.details).toEqual({ expectedCents: 100, actualCents: 99 });
    });
  });

  it('lets historical members take part when editing old expenses', () => {
    const editing: SplitContext = { eligibleMemberIds: [A, B, C], defaultParticipantIds: [A, B] };
    expect(resolve(90, { type: 'EQUAL', participants: [C, A] }, editing).allocations).toEqual([
      { memberId: A, amountCents: 45 },
      { memberId: C, amountCents: 45 },
    ]);
  });

  describe('reallocate (amount edits keep the stored basis — ADR-006)', () => {
    it('re-applies stored weights to a new amount', () => {
      const snapshot = {
        type: 'INCOME_PROPORTIONAL' as const,
        weights: [
          { memberId: A, weight: 6000 },
          { memberId: B, weight: 4000 },
        ],
      };
      expect(reallocate(20000, snapshot)).toEqual([
        { memberId: A, amountCents: 12000 },
        { memberId: B, amountCents: 8000 },
      ]);
    });

    it('requires new amounts when a CUSTOM_AMOUNT expense changes amount', () => {
      const snapshot = {
        type: 'CUSTOM_AMOUNT' as const,
        weights: [
          { memberId: A, weight: 70 },
          { memberId: B, weight: 30 },
        ],
      };
      expect(reallocate(100, snapshot)).toHaveLength(2);
      expect(splitError(() => reallocate(120, snapshot)).kind).toBe('SUM_MISMATCH');
    });
  });

  it('maps the household default rule to a split request', () => {
    expect(splitFromDefault({ type: 'EQUAL' })).toEqual({ type: 'EQUAL' });
    expect(
      splitFromDefault({ type: 'CUSTOM_PERCENT', weights: [{ memberId: A, bps: 10000 }] }),
    ).toEqual({
      type: 'CUSTOM_PERCENT',
      weights: [{ memberId: A, bps: 10000 }],
    });
  });

  describe('property: allocations always reconcile with the amount (BUSINESS_RULES 2)', () => {
    const amount = fc.integer({ min: 1, max: 99_999_999_999 });
    const bpsPair = fc.integer({ min: 0, max: 10000 }).map((a) => [a, 10000 - a] as const);

    it('for every split type', () => {
      fc.assert(
        fc.property(
          amount,
          bpsPair,
          fc.constantFrom(
            'EQUAL',
            'INDIVIDUAL',
            'CUSTOM_PERCENT',
            'INCOME_PROPORTIONAL',
            'CUSTOM_AMOUNT',
          ),
          (cents, [wa, wb], type) => {
            let result;
            if (type === 'CUSTOM_AMOUNT') {
              const first = Math.floor((cents * wa) / 10000);
              result = resolve(cents, {
                type,
                amounts: [
                  { memberId: A, amountCents: first },
                  { memberId: B, amountCents: cents - first },
                ],
              });
            } else if (type === 'CUSTOM_PERCENT') {
              result = resolve(cents, {
                type,
                weights: [
                  { memberId: A, bps: wa },
                  { memberId: B, bps: wb },
                ],
              });
            } else if (type === 'INCOME_PROPORTIONAL') {
              const plan = planSplit({ type }, cents, context);
              result = allocateSplit(cents, plan, {
                bps: [Math.max(wa, 1), Math.max(wb, 1)],
                basisDate: '2026-01-01',
              });
            } else if (type === 'INDIVIDUAL') {
              result = resolve(cents, { type, responsibleMemberId: B });
            } else {
              result = resolve(cents, { type });
            }
            expect(result.allocations.reduce((sum, a) => sum + a.amountCents, 0)).toBe(cents);
            expect(result.allocations.every((a) => a.amountCents >= 0)).toBe(true);
          },
        ),
        { numRuns: 3000 },
      );
    });
  });
});
