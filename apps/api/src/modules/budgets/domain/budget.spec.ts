import fc from 'fast-check';
import { budgetStatus, type BudgetPeriod, effectiveIn, nextChange, planChange } from './budget';

const period = (
  id: string,
  fromMonth: string,
  untilMonth: string | null,
  amountCents: number,
): BudgetPeriod => ({ id, fromMonth, untilMonth, amountCents });

describe('planChange (FR-BUD-03)', () => {
  it('creates the first period', () => {
    expect(planChange([], '2026-10', 150000)).toEqual({
      truncate: null,
      remove: [],
      create: { fromMonth: '2026-10', amountCents: 150000 },
    });
  });

  it('closes the running period before the change month', () => {
    const periods = [period('a', '2026-01', null, 100000)];
    expect(planChange(periods, '2026-10', 150000)).toEqual({
      truncate: { id: 'a', untilMonth: '2026-10' },
      remove: [],
      create: { fromMonth: '2026-10', amountCents: 150000 },
    });
  });

  it('replaces periods starting on or after the change month', () => {
    const periods = [
      period('a', '2026-01', '2026-10', 100000),
      period('b', '2026-10', '2026-12', 150000),
      period('c', '2026-12', null, 90000),
    ];
    expect(planChange(periods, '2026-10', 120000)).toEqual({
      truncate: null,
      remove: ['b', 'c'],
      create: { fromMonth: '2026-10', amountCents: 120000 },
    });
  });

  it('ends a budget and ignores no-op changes', () => {
    const periods = [period('a', '2026-01', null, 100000)];
    expect(planChange(periods, '2026-10', null)).toEqual({
      truncate: { id: 'a', untilMonth: '2026-10' },
      remove: [],
      create: null,
    });
    expect(planChange(periods, '2026-10', 100000)).toBeNull();
    expect(planChange([], '2026-10', null)).toBeNull();
  });

  it('never changes the amount of an earlier month (property)', () => {
    const month = fc
      .integer({ min: 0, max: 35 })
      .map((i) => `${String(2025 + Math.floor(i / 12))}-${String((i % 12) + 1).padStart(2, '0')}`);
    const change = fc.record({
      month,
      amount: fc.option(fc.integer({ min: 1, max: 1_000_000 }), { nil: null }),
    });
    fc.assert(
      fc.property(fc.array(change, { minLength: 1, maxLength: 12 }), month, (changes, probe) => {
        let periods: BudgetPeriod[] = [];
        let id = 0;
        for (const { month: from, amount } of changes) {
          const before = effectiveIn(periods, probe)?.amountCents ?? null;
          const plan = planChange(periods, from, amount);
          if (plan) {
            periods = periods
              .filter((p) => !plan.remove.includes(p.id))
              .map((p) =>
                plan.truncate?.id === p.id ? { ...p, untilMonth: plan.truncate.untilMonth } : p,
              );
            if (plan.create) {
              id += 1;
              periods.push(
                period(String(id), plan.create.fromMonth, null, plan.create.amountCents),
              );
            }
          }
          // Months before the change keep their amount; from it on, the new amount applies.
          const after = effectiveIn(periods, probe)?.amountCents ?? null;
          expect(after).toBe(probe < from ? before : amount);
          // Periods never overlap.
          for (const p of periods) {
            expect(periods.filter((q) => q !== p && q.fromMonth === p.fromMonth)).toHaveLength(0);
          }
        }
      }),
    );
  });
});

describe('nextChange', () => {
  it('reports the following amount or the end', () => {
    const periods = [
      period('a', '2026-01', '2026-10', 100000),
      period('b', '2026-10', '2027-01', 150000),
    ];
    expect(nextChange(periods, periods[0] as BudgetPeriod)).toEqual({
      fromMonth: '2026-10',
      amountCents: 150000,
    });
    expect(nextChange(periods, periods[1] as BudgetPeriod)).toEqual({
      fromMonth: '2027-01',
      amountCents: null,
    });
  });
});

describe('budgetStatus (CALCULATIONS §7)', () => {
  it.each([
    [100000, 0, 0, 'OK'],
    [100000, 79999, 7999, 'OK'],
    [100000, 80000, 8000, 'WARNING'],
    [100000, 99999, 9999, 'WARNING'],
    [100000, 100000, 10000, 'EXCEEDED'],
    [100000, 150001, 15000, 'EXCEEDED'],
    [3, 1, 3333, 'OK'],
  ])('amount %i, spent %i → %i bps %s', (amount, spent, bps, state) => {
    expect(budgetStatus(amount, spent)).toEqual({
      remainingCents: amount - spent,
      usedBps: bps,
      state,
    });
  });

  it('stays exact for large amounts', () => {
    expect(budgetStatus(99_999_999_999, 99_999_999_998).usedBps).toBe(9999);
  });
});
