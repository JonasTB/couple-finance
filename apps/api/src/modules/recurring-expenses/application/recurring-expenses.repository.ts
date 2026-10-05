import type {
  PauseWindow,
  PaymentMethod,
  RecurrenceFrequency,
  RecurringAmountType,
  SplitInput,
} from '@couple-finance/shared';
import { type TransactionContext } from '../../../common/database/unit-of-work';

export interface RecurringExpenseRecord {
  id: string;
  householdId: string;
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
  splitRule: SplitInput | null;
  notes: string | null;
  pauses: PauseWindow[];
  createdByMemberId: string;
  version: number;
  createdAt: Date;
  deletedAt: Date | null;
  deletedByMemberId: string | null;
}

export type NewRecurringExpense = Omit<
  RecurringExpenseRecord,
  'version' | 'createdAt' | 'deletedAt' | 'deletedByMemberId'
>;

export type RecurringExpenseChanges = Omit<
  RecurringExpenseRecord,
  'id' | 'householdId' | 'createdByMemberId' | 'version' | 'createdAt'
>;

export abstract class RecurringExpensesRepository {
  abstract insert(tx: TransactionContext, record: NewRecurringExpense): Promise<void>;
  /** Includes soft-deleted rows. */
  abstract find(
    householdId: string,
    id: string,
    options?: { tx?: TransactionContext; lock?: boolean },
  ): Promise<RecurringExpenseRecord | null>;
  abstract list(
    householdId: string,
    deleted: 'exclude' | 'only',
  ): Promise<RecurringExpenseRecord[]>;
  /** Bumps `version`; false when `expectedVersion` is stale. */
  abstract update(
    tx: TransactionContext,
    id: string,
    expectedVersion: number,
    changes: RecurringExpenseChanges,
  ): Promise<boolean>;
  abstract skips(
    recurringExpenseIds: readonly string[],
    tx?: TransactionContext,
  ): Promise<{ recurringExpenseId: string; occurrenceDate: string }[]>;
  /** Idempotent. */
  abstract addSkip(
    tx: TransactionContext,
    skip: {
      id: string;
      recurringExpenseId: string;
      occurrenceDate: string;
      createdByMemberId: string;
    },
  ): Promise<boolean>;
  /** Returns whether a skip was removed. */
  abstract removeSkip(
    tx: TransactionContext,
    recurringExpenseId: string,
    occurrenceDate: string,
  ): Promise<boolean>;
}
