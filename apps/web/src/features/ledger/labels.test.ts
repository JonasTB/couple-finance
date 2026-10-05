import { originLabel } from './labels';

describe('originLabel', () => {
  it('describes where an expense came from', () => {
    expect(originLabel(null)).toBeNull();
    expect(
      originLabel({ kind: 'RECURRING', recurringExpenseId: 'r', occurrenceDate: '2026-10-10' }),
    ).toBe('Recorrente');
    const installment = {
      kind: 'INSTALLMENT' as const,
      installmentPlanId: 'p',
      installmentNumber: 3,
      installmentCount: 10,
      payoff: false,
    };
    expect(originLabel(installment)).toBe('Parcela 3/10');
    expect(originLabel({ ...installment, installmentNumber: 7, payoff: true })).toBe(
      'Quitação (parcelas 7 a 10)',
    );
  });
});
