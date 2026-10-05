import { type TransactionContext } from '../../../common/database/unit-of-work';

export interface IncomeRecord {
  id: string;
  householdId: string;
  memberId: string;
  monthlyAmountCents: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export abstract class IncomesRepository {
  /** Non-deleted records of a member, newest first; `lock` takes row locks for appends. */
  abstract listForMember(
    memberId: string,
    options?: { tx?: TransactionContext; lock?: boolean },
  ): Promise<IncomeRecord[]>;
  /** Non-deleted records effective on `date` for the given members. */
  abstract effectiveOn(
    householdId: string,
    memberIds: readonly string[],
    date: string,
    tx?: TransactionContext,
  ): Promise<IncomeRecord[]>;
  /** Non-deleted records of the members overlapping [from, to]. */
  abstract overlapping(
    householdId: string,
    memberIds: readonly string[],
    from: string,
    to: string,
  ): Promise<IncomeRecord[]>;
  abstract insert(tx: TransactionContext, record: IncomeRecord): Promise<void>;
  abstract update(
    tx: TransactionContext,
    id: string,
    patch: Partial<Pick<IncomeRecord, 'monthlyAmountCents' | 'effectiveTo'>>,
  ): Promise<void>;
  abstract softDelete(tx: TransactionContext, id: string, deletedAt: Date): Promise<void>;
}
