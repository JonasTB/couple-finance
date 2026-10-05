import { Injectable } from '@nestjs/common';
import type { SplitInput, TransactionOrigin } from '@couple-finance/shared';
import { type Actor } from '../../../common/auth/current-actor.decorator';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import { type MemberContext } from '../../households/public';
import { type SplitSnapshot } from '../domain/split';
import { type TransactionInput, TransactionsService } from './transactions.service';
import { TransactionsRepository } from './transactions.repository';

export type { SplitSnapshot } from '../domain/split';
export type { TransactionInput } from './transactions.service';

/**
 * Write access to the ledger for the commitments modules (MODULES.md: `TransactionWriter`).
 * Every method runs inside the caller's database transaction, so a plan or a confirmation and
 * its expenses commit together. The same split, category and payer rules as manual expenses
 * apply, and every change is audited.
 */
@Injectable()
export class TransactionWriter {
  constructor(
    private readonly service: TransactionsService,
    private readonly transactions: TransactionsRepository,
  ) {}

  assertSplitRule(householdId: string, split: SplitInput): Promise<void> {
    return this.service.assertSplitRule(householdId, split);
  }

  resolveSnapshot(
    tx: TransactionContext,
    householdId: string,
    amountCents: number,
    date: string,
    split: SplitInput | undefined,
  ): Promise<SplitSnapshot> {
    return this.service.resolveSnapshot(tx, householdId, amountCents, date, split);
  }

  create(
    tx: TransactionContext,
    actor: Actor,
    member: MemberContext,
    input: TransactionInput,
    options: { origin: TransactionOrigin; snapshot?: SplitSnapshot },
  ): Promise<string> {
    return this.service.createInTx(tx, actor, member, input, options);
  }

  setDeleted(
    tx: TransactionContext,
    actor: Actor,
    member: MemberContext,
    ids: readonly string[],
    deletedAt: Date | null,
  ): Promise<void> {
    return this.service.setDeletedInTx(tx, actor, member, ids, deletedAt);
  }

  /** Ids of the plan's expenses deleted at exactly `deletedAt` (to undo a plan deletion). */
  async idsDeletedWithPlan(
    tx: TransactionContext,
    householdId: string,
    planId: string,
    deletedAt: Date,
  ): Promise<string[]> {
    const rows = await this.transactions.listByOrigin(
      householdId,
      { installmentPlanIds: [planId] },
      { tx, deletedAt },
    );
    return rows.map((row) => row.id);
  }
}
