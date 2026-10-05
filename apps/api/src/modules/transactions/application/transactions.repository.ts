import type { PaymentMethod, SplitType, TransactionOrigin } from '@couple-finance/shared';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import { type Allocation, type SplitSnapshot } from '../domain/split';

export interface TransactionRecord {
  id: string;
  householdId: string;
  description: string;
  amountCents: number;
  date: string;
  categoryId: string;
  payerMemberId: string;
  paymentMethod: PaymentMethod;
  notes: string | null;
  tags: string[];
  split: SplitSnapshot;
  allocations: Allocation[];
  origin: TransactionOrigin | null;
  createdByMemberId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletedByMemberId: string | null;
}

export type NewTransaction = Omit<
  TransactionRecord,
  'version' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'deletedByMemberId'
>;

export type TransactionChanges = Pick<
  TransactionRecord,
  | 'description'
  | 'amountCents'
  | 'date'
  | 'categoryId'
  | 'payerMemberId'
  | 'paymentMethod'
  | 'notes'
  | 'tags'
  | 'split'
  | 'allocations'
  | 'deletedAt'
  | 'deletedByMemberId'
>;

export interface TransactionFilters {
  from?: string;
  to?: string;
  categoryIds?: string[];
  payerMemberId?: string;
  responsibleMemberId?: string;
  splitType?: SplitType;
  paymentMethod?: PaymentMethod;
  text?: string;
  /** `exclude` (default) hides soft-deleted expenses; `only` lists just them (restore UI). */
  deleted: 'exclude' | 'only';
}

export interface PageCursor {
  date: string;
  id: string;
}

/** Per-member sums over non-deleted expenses (cents). */
export interface LedgerTotals {
  memberId: string;
  paidCents: number;
  responsibleCents: number;
}

/** Monthly sum of live expenses sharing category, payer, scope and origin (analytics). */
export interface MonthlySpendRow {
  /** `YYYY-MM`. */
  month: string;
  categoryId: string;
  payerMemberId: string;
  /** False for INDIVIDUAL expenses. */
  shared: boolean;
  origin: 'RECURRING' | 'INSTALLMENT' | 'NONE';
  amountCents: number;
}

/** Monthly shared-scope responsibility of a member (analytics). */
export interface MonthlyResponsibilityRow {
  month: string;
  memberId: string;
  amountCents: number;
}

export abstract class TransactionsRepository {
  abstract insert(tx: TransactionContext, transaction: NewTransaction): Promise<void>;
  /** Includes soft-deleted rows; `lock` takes a row lock for updates. */
  abstract find(
    householdId: string,
    id: string,
    options?: { tx?: TransactionContext; lock?: boolean },
  ): Promise<TransactionRecord | null>;
  /** Replaces columns and allocations and bumps `version`; false if `expectedVersion` is stale. */
  abstract update(
    tx: TransactionContext,
    id: string,
    expectedVersion: number,
    changes: TransactionChanges,
  ): Promise<boolean>;
  /** Newest first (date DESC, id DESC); returns up to `limit` rows after `cursor`. */
  abstract list(
    householdId: string,
    filters: TransactionFilters,
    cursor: PageCursor | null,
    limit: number,
  ): Promise<TransactionRecord[]>;
  abstract listProportionalInRange(
    tx: TransactionContext,
    householdId: string,
    from: string,
    to: string,
  ): Promise<TransactionRecord[]>;
  /** Non-deleted expenses in [from, to], oldest first (dashboard read model). */
  abstract listInRange(householdId: string, from: string, to: string): Promise<TransactionRecord[]>;
  /** Paid and responsible sums per member over non-deleted expenses dated on or before `upTo`. */
  abstract totalsByMember(householdId: string, upTo: string): Promise<LedgerTotals[]>;
  /**
   * Expenses created by commitments, oldest first. `deletedAt` narrows to rows deleted at exactly
   * that instant (restoring what one plan deletion removed); otherwise only live rows.
   */
  abstract listByOrigin(
    householdId: string,
    origin: { installmentPlanIds: readonly string[] } | { recurringExpenseIds: readonly string[] },
    options?: { tx?: TransactionContext; deletedAt?: Date },
  ): Promise<TransactionRecord[]>;
  /** Description, amount and date of live expenses among `ids` (links from other modules). */
  abstract summaries(
    householdId: string,
    ids: readonly string[],
  ): Promise<{ id: string; description: string; amountCents: number; date: string }[]>;
  /** Live expenses in [from, to] summed per month, category, payer, scope and origin. */
  abstract monthlySpend(householdId: string, from: string, to: string): Promise<MonthlySpendRow[]>;
  /** Shared-scope allocations in [from, to] summed per month and member. */
  abstract monthlyResponsibility(
    householdId: string,
    from: string,
    to: string,
  ): Promise<MonthlyResponsibilityRow[]>;
  /** Date of the earliest live expense, or null. */
  abstract firstDate(householdId: string): Promise<string | null>;
  /** True if the household has at least one non-deleted expense. */
  abstract hasAny(householdId: string): Promise<boolean>;
}
