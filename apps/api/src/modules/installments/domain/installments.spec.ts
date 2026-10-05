import fc from 'fast-check';
import {
  commitmentSummary,
  InstallmentError,
  type PlanInstallment,
  planProgress,
  regularInstallment,
  scheduleInstallments,
} from './installments';

describe('scheduleInstallments', () => {
  it('puts the remainder on the first installment (CALCULATIONS §5 example)', () => {
    const plan = scheduleInstallments({
      totalAmountCents: 100000,
      installmentCount: 3,
      firstInstallmentDate: '2026-01-31',
    });
    expect(plan.installments).toEqual([
      { number: 1, date: '2026-01-31', amountCents: 33334 },
      { number: 2, date: '2026-02-28', amountCents: 33333 },
      { number: 3, date: '2026-03-31', amountCents: 33333 },
    ]);
    expect(regularInstallment(100000, 3)).toBe(33333);
  });

  it('builds from the installment amount', () => {
    const plan = scheduleInstallments({
      installmentAmountCents: 42000,
      installmentCount: 10,
      firstInstallmentDate: '2026-03-15',
    });
    expect(plan.totalAmountCents).toBe(420000);
    expect(plan.installments.every((i) => i.amountCents === 42000)).toBe(true);
    expect(plan.installments[9]?.date).toBe('2026-12-15');
    expect(regularInstallment(420000, 10)).toBe(42000);
  });

  it('rejects invalid input', () => {
    const base = { installmentCount: 3, firstInstallmentDate: '2026-01-01' };
    expect(() => scheduleInstallments({ ...base })).toThrow(InstallmentError);
    expect(() =>
      scheduleInstallments({ ...base, totalAmountCents: 300, installmentAmountCents: 100 }),
    ).toThrow(InstallmentError);
    expect(() => scheduleInstallments({ ...base, totalAmountCents: 2 })).toThrow(InstallmentError);
    expect(() =>
      scheduleInstallments({ ...base, installmentCount: 1, totalAmountCents: 100 }),
    ).toThrow(InstallmentError);
    expect(() =>
      scheduleInstallments({ ...base, installmentCount: 73, totalAmountCents: 10000 }),
    ).toThrow(InstallmentError);
  });

  it('always reconciles to the total (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 72 }),
        fc.integer({ min: 72, max: 99_999_999_999 }),
        (count, total) => {
          const { installments } = scheduleInstallments({
            totalAmountCents: total,
            installmentCount: count,
            firstInstallmentDate: '2026-01-31',
          });
          expect(installments).toHaveLength(count);
          expect(installments.reduce((sum, i) => sum + i.amountCents, 0)).toBe(total);
          const rest = installments.slice(1).map((i) => i.amountCents);
          expect(new Set(rest).size).toBe(1);
          expect((installments[0]?.amountCents ?? 0) - (rest[0] ?? 0)).toBeLessThan(count);
        },
      ),
    );
  });
});

const installment = (number: number, date: string, amountCents = 10000): PlanInstallment => ({
  number,
  date,
  amountCents,
  payoff: false,
});

describe('planProgress', () => {
  const four = [
    installment(1, '2026-08-10', 10003),
    installment(2, '2026-09-10'),
    installment(3, '2026-10-10'),
    installment(4, '2026-11-10'),
  ];

  it('counts installments dated up to today as paid', () => {
    expect(planProgress(four, '2026-10-10', null, 4)).toMatchObject({
      totalCents: 40003,
      paidCount: 3,
      paidCents: 30003,
      remainingCount: 1,
      remainingCents: 10000,
      next: { number: 4, date: '2026-11-10' },
      releaseMonth: '2026-12',
      status: 'ACTIVE',
    });
    expect(planProgress(four, '2026-11-10', null, 4).status).toBe('COMPLETED');
  });

  it('reports closed plans', () => {
    const cancelled = planProgress(four.slice(0, 2), '2026-10-01', 'CANCEL', 4);
    expect(cancelled).toMatchObject({ status: 'CANCELLED', releaseMonth: '2026-10' });
    const paidOff = planProgress(
      [...four.slice(0, 2), { ...installment(3, '2026-10-01', 15000), payoff: true }],
      '2026-10-01',
      'PAY_OFF',
      4,
    );
    expect(paidOff).toMatchObject({
      status: 'PAID_OFF',
      totalCents: 35003,
      paidCount: 4,
      remainingCount: 0,
    });
  });
});

describe('commitmentSummary', () => {
  it('sums installments per month and groups releases', () => {
    const summary = commitmentSummary(
      [
        {
          id: 'p1',
          description: 'Geladeira',
          installments: [installment(1, '2026-10-05', 42000), installment(2, '2026-11-05', 42000)],
        },
        {
          id: 'p2',
          description: 'Sofá',
          installments: [
            installment(1, '2026-09-20', 30000),
            installment(2, '2026-10-20', 30000),
            installment(3, '2026-11-20', 30000),
          ],
        },
        // Ended before the current month: no release shown.
        { id: 'p3', description: 'Antigo', installments: [installment(1, '2026-08-01')] },
      ],
      '2026-10',
    );
    expect(summary.months).toHaveLength(12);
    expect(summary.months.slice(0, 3)).toEqual([
      { month: '2026-10', installmentsCents: 72000, activePlans: 2 },
      { month: '2026-11', installmentsCents: 72000, activePlans: 2 },
      { month: '2026-12', installmentsCents: 0, activePlans: 0 },
    ]);
    expect(summary.months[11]?.month).toBe('2027-09');
    expect(summary.releases).toEqual([
      {
        month: '2026-12',
        releasedCents: 72000,
        plans: [
          { id: 'p1', description: 'Geladeira', installmentAmountCents: 42000 },
          { id: 'p2', description: 'Sofá', installmentAmountCents: 30000 },
        ],
      },
    ]);
  });
});
