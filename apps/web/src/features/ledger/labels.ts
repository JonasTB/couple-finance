import type { PaymentMethod, SplitType, TransactionOrigin } from '@couple-finance/shared';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  CASH: 'Dinheiro',
  BANK_TRANSFER: 'Transferência',
  BOLETO: 'Boleto',
  OTHER: 'Outro',
};

export const SPLIT_TYPE_LABELS: Record<SplitType, string> = {
  EQUAL: 'Dividir igualmente',
  INCOME_PROPORTIONAL: 'Proporcional à renda',
  CUSTOM_PERCENT: 'Percentuais',
  CUSTOM_AMOUNT: 'Valores definidos',
  INDIVIDUAL: 'Despesa individual',
};

/** "Parcela 3/10" · "Quitação (parcelas 7 a 10)" · "Recorrente". */
export function originLabel(origin: TransactionOrigin | null): string | null {
  if (!origin) return null;
  if (origin.kind === 'RECURRING') return 'Recorrente';
  return origin.payoff
    ? `Quitação (parcelas ${String(origin.installmentNumber)} a ${String(origin.installmentCount)})`
    : `Parcela ${String(origin.installmentNumber)}/${String(origin.installmentCount)}`;
}
