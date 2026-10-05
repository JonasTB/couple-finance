import type { PaymentMethod, SplitInput, SplitSnapshotView } from './transactions';

/**
 * Commitments: recurring expenses and installment plans (ADR-007, CALCULATIONS.md §5–6).
 * Neither ever creates unbounded records: occurrences are projected on read, installments are
 * finite and created up front.
 */

// --- recurring expenses ------------------------------------------------------------------------

export const RECURRENCE_FREQUENCIES = ['WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];
export const RECURRENCE_MAX_INTERVAL = 12;
/** Largest window of projected occurrences per request (FR-REC-02). */
export const PROJECTION_MAX_MONTHS = 24;

export const RECURRING_AMOUNT_TYPES = ['FIXED', 'VARIABLE'] as const;
export type RecurringAmountType = (typeof RECURRING_AMOUNT_TYPES)[number];

/** Templates cannot use CUSTOM_AMOUNT: the amount of each occurrence or installment differs. */
export const TEMPLATE_SPLIT_TYPES = [
  'EQUAL',
  'INCOME_PROPORTIONAL',
  'CUSTOM_PERCENT',
  'INDIVIDUAL',
] as const;

export type RecurringStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';

export interface RecurringExpenseInput {
  description: string;
  categoryId: string;
  expectedAmountCents: number;
  amountType: RecurringAmountType;
  frequency: RecurrenceFrequency;
  /** Every `interval` weeks/months/years (1–12). */
  interval: number;
  /** First occurrence; its day of month (or weekday) anchors every later one. */
  startDate: string;
  /** Last day an occurrence may fall on (inclusive). */
  endDate?: string | null;
  payerMemberId: string;
  paymentMethod: PaymentMethod;
  /** Null/omitted → the household default rule, read when each occurrence is confirmed. */
  split?: SplitInput | null;
  notes?: string | null;
}

export interface PauseWindow {
  /** First day without occurrences. */
  from: string;
  /** Day the expense resumed (exclusive); null while paused. */
  to: string | null;
}

export interface RecurringExpenseView {
  id: string;
  description: string;
  categoryId: string;
  expectedAmountCents: number;
  amountType: RecurringAmountType;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  payerMemberId: string;
  paymentMethod: PaymentMethod;
  split: SplitInput | null;
  notes: string | null;
  status: RecurringStatus;
  pauses: PauseWindow[];
  /** True once any occurrence was confirmed or skipped: the schedule can no longer change. */
  scheduleLocked: boolean;
  /** Next occurrence on or after today that is still open; null when none. */
  nextOccurrenceDate: string | null;
  version: number;
  createdAt: string;
  deletedAt: string | null;
}

export type OccurrenceStatus = 'CONFIRMED' | 'SKIPPED' | 'OVERDUE' | 'UPCOMING';

export interface OccurrenceView {
  recurringExpenseId: string;
  occurrenceDate: string;
  status: OccurrenceStatus;
  description: string;
  categoryId: string;
  expectedAmountCents: number;
  amountType: RecurringAmountType;
  /** The expense created by confirmation. */
  transactionId: string | null;
  /** Actual amount when confirmed. */
  amountCents: number | null;
}

export interface ConfirmOccurrenceInput {
  /** Defaults to the expected amount. */
  amountCents?: number;
  /** Payment date; defaults to the occurrence date. */
  date?: string;
  payerMemberId?: string;
  paymentMethod?: PaymentMethod;
  notes?: string | null;
}

// --- installment plans -------------------------------------------------------------------------

export const INSTALLMENT_MIN_COUNT = 2;
export const INSTALLMENT_MAX_COUNT = 72;

export interface InstallmentPlanInput {
  description: string;
  categoryId: string;
  /** Exactly one of total or installment amount (FR-INST-01). */
  totalAmountCents?: number;
  installmentAmountCents?: number;
  installmentCount: number;
  firstInstallmentDate: string;
  payerMemberId: string;
  paymentMethod: PaymentMethod;
  /** Omitted → household default rule, resolved once on the first installment date. */
  split?: SplitInput;
  notes?: string | null;
}

/** Date-based: an installment dated up to today counts as paid (no card statements modeled). */
export type InstallmentStatus = 'PAID' | 'REMAINING';

export interface InstallmentView {
  number: number;
  transactionId: string;
  date: string;
  amountCents: number;
  status: InstallmentStatus;
  /** True for the single expense recorded by an early payoff. */
  payoff: boolean;
}

/** ACTIVE: installments remain; COMPLETED: all dated; CANCELLED / PAID_OFF: closed early. */
export type InstallmentPlanStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'PAID_OFF';

export interface InstallmentPlanView {
  id: string;
  description: string;
  categoryId: string;
  payerMemberId: string;
  paymentMethod: PaymentMethod;
  installmentCount: number;
  firstInstallmentDate: string;
  /** Amount of the purchase as created. */
  originalTotalCents: number;
  /** Σ of the plan's current expenses (differs after edits, cancellation or payoff). */
  totalCents: number;
  paidCount: number;
  paidCents: number;
  remainingCount: number;
  remainingCents: number;
  /** The regular installment (installment 2..n; equals installment 1 without remainder). */
  installmentAmountCents: number;
  nextInstallment: { number: number; date: string; amountCents: number } | null;
  /** First month without installments of this plan (`YYYY-MM`). */
  releaseMonth: string | null;
  status: InstallmentPlanStatus;
  split: SplitSnapshotView;
  notes: string | null;
  closedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  /** Only on the detail endpoint. */
  installments?: InstallmentView[];
}

export interface CloseInstallmentPlanInput {
  /** CANCEL removes the remaining installments; PAY_OFF also records one payoff expense. */
  kind: 'CANCEL' | 'PAY_OFF';
  /** Payoff expense date and cut-off: installments dated after it are removed. Default: today. */
  date?: string;
  /** Required for PAY_OFF (may differ from the remaining total, e.g. a discount). */
  payoffAmountCents?: number;
}

export interface CommitmentMonth {
  /** `YYYY-MM` */
  month: string;
  /** Σ installments dated in the month (FR-INST-03 monthly commitment). */
  installmentsCents: number;
  activePlans: number;
}

export interface ReleaseMonth {
  /** First month the amount is no longer committed. */
  month: string;
  /** Σ of the regular installment of every plan ending the month before. */
  releasedCents: number;
  plans: { id: string; description: string; installmentAmountCents: number }[];
}

export interface InstallmentSummary {
  /** Current month and the next 11. */
  months: CommitmentMonth[];
  /** Upcoming releases (after the current month), earliest first. */
  releases: ReleaseMonth[];
}
