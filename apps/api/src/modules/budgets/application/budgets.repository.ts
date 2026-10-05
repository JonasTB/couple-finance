import { type TransactionContext } from '../../../common/database/unit-of-work';

/** A live budget period; months as `YYYY-MM`, `untilMonth` exclusive. */
export interface BudgetRecord {
  id: string;
  categoryId: string | null;
  amountCents: number;
  fromMonth: string;
  untilMonth: string | null;
}

export abstract class BudgetsRepository {
  /** Live periods of the household (every line), oldest first. */
  abstract list(householdId: string, tx?: TransactionContext): Promise<BudgetRecord[]>;
  abstract insert(
    tx: TransactionContext,
    record: BudgetRecord & { householdId: string; createdByMemberId: string },
  ): Promise<void>;
  abstract setUntil(tx: TransactionContext, id: string, untilMonth: string): Promise<void>;
  abstract softDelete(
    tx: TransactionContext,
    ids: readonly string[],
    deletedAt: Date,
    deletedByMemberId: string,
  ): Promise<void>;
}
