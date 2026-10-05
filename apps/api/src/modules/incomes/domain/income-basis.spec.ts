import fc from 'fast-check';
import { householdIncomeOn, incomeSharesBps, isEffectiveOn } from './income-basis';

describe('income basis', () => {
  it('converts incomes to bps summing to 10000', () => {
    expect(incomeSharesBps([600_000, 400_000])).toEqual([6000, 4000]);
    expect(incomeSharesBps([1, 1, 1])).toEqual([3334, 3333, 3333]);
    expect(incomeSharesBps([700_001, 300_000])).toEqual([7000, 3000]);
  });

  it('always sums to 10000 for positive incomes', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 99_999_999_999 }), { minLength: 1, maxLength: 5 }),
        (incomes) => {
          expect(incomeSharesBps(incomes).reduce((a, b) => a + b, 0)).toBe(10_000);
        },
      ),
    );
  });

  it('applies effective periods with an exclusive end', () => {
    const period = { effectiveFrom: '2026-01-01', effectiveTo: '2026-07-01' };
    expect(isEffectiveOn(period, '2025-12-31')).toBe(false);
    expect(isEffectiveOn(period, '2026-01-01')).toBe(true);
    expect(isEffectiveOn(period, '2026-06-30')).toBe(true);
    expect(isEffectiveOn(period, '2026-07-01')).toBe(false);
    expect(isEffectiveOn({ effectiveFrom: '2026-01-01', effectiveTo: null }, '2099-01-01')).toBe(
      true,
    );
  });

  it('sums the household income on a date only when every member has one', () => {
    const records = [
      {
        memberId: 'ana',
        monthlyAmountCents: 600_000,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-09-01',
      },
      {
        memberId: 'ana',
        monthlyAmountCents: 650_000,
        effectiveFrom: '2026-09-01',
        effectiveTo: null,
      },
      {
        memberId: 'bruno',
        monthlyAmountCents: 400_000,
        effectiveFrom: '2026-08-15',
        effectiveTo: null,
      },
    ];
    expect(householdIncomeOn(records, ['ana', 'bruno'], '2026-07-31')).toBeNull();
    expect(householdIncomeOn(records, ['ana', 'bruno'], '2026-08-31')).toBe(1_000_000);
    expect(householdIncomeOn(records, ['ana', 'bruno'], '2026-09-30')).toBe(1_050_000);
    expect(householdIncomeOn(records, [], '2026-09-30')).toBeNull();
  });
});
