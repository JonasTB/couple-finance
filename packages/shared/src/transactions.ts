/** Ledger contracts (ADR-002, ADR-006, docs/domain/CALCULATIONS.md). */

export const MAX_AMOUNT_CENTS = 99_999_999_999;
export const TRANSACTION_DESCRIPTION_MAX_LENGTH = 120;
export const TRANSACTION_NOTES_MAX_LENGTH = 500;
export const TRANSACTION_MAX_TAGS = 10;
export const TRANSACTION_TAG_MAX_LENGTH = 30;

export const SPLIT_TYPES = [
  'EQUAL',
  'INCOME_PROPORTIONAL',
  'CUSTOM_PERCENT',
  'CUSTOM_AMOUNT',
  'INDIVIDUAL',
] as const;
export type SplitType = (typeof SPLIT_TYPES)[number];

export const PAYMENT_METHODS = [
  'PIX',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'CASH',
  'BANK_TRANSFER',
  'BOLETO',
  'OTHER',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * How the caller wants a transaction split. Omitted on create → household default rule.
 * - EQUAL / INCOME_PROPORTIONAL: optional `participants` (default: all active members)
 * - CUSTOM_PERCENT: `weights` in bps summing to 10000
 * - CUSTOM_AMOUNT: `amounts` summing exactly to the transaction amount
 * - INDIVIDUAL: `responsibleMemberId`
 */
export interface SplitInput {
  type: SplitType;
  participants?: string[];
  weights?: { memberId: string; bps: number }[];
  amounts?: { memberId: string; amountCents: number }[];
  responsibleMemberId?: string;
}

export interface AllocationView {
  memberId: string;
  amountCents: number;
}

/** Stored basis of the split (never contains raw income). */
export interface SplitSnapshotView {
  type: SplitType;
  /** bps for percent/proportional, 1 for equal/individual, cents for custom amounts. */
  weights: { memberId: string; weight: number }[];
  /** Transaction date used to read incomes (INCOME_PROPORTIONAL only). */
  incomeBasisDate?: string;
}

/** Where an expense came from (ADR-007). Commitment expenses are otherwise ordinary. */
export type TransactionOrigin =
  | { kind: 'RECURRING'; recurringExpenseId: string; occurrenceDate: string }
  | {
      kind: 'INSTALLMENT';
      installmentPlanId: string;
      installmentNumber: number;
      installmentCount: number;
      /** The single expense of an early payoff, standing for installments `number..count`. */
      payoff: boolean;
    };

export interface TransactionView {
  id: string;
  description: string;
  amountCents: number;
  date: string;
  categoryId: string;
  payerMemberId: string;
  paymentMethod: PaymentMethod;
  notes: string | null;
  tags: string[];
  split: SplitSnapshotView;
  allocations: AllocationView[];
  origin: TransactionOrigin | null;
  createdByMemberId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TransactionPage {
  data: TransactionView[];
  page: { nextCursor: string | null; limit: number };
}

export interface SplitPreview {
  split: SplitSnapshotView;
  allocations: AllocationView[];
}

export interface TransactionHistoryEntry {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'RECALCULATE';
  actorDisplayName: string;
  occurredAt: string;
  before: Partial<TransactionView> | null;
  after: Partial<TransactionView> | null;
}
