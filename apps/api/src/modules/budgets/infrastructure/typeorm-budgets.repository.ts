import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, IsNull } from 'typeorm';
import { entityManagerOf } from '../../../common/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import { type BudgetRecord, BudgetsRepository } from '../application/budgets.repository';
import { BudgetEntity } from './budget.entity';

const toMonth = (date: string): string => date.slice(0, 7);
const toDate = (month: string): string => `${month}-01`;

@Injectable()
export class TypeOrmBudgetsRepository extends BudgetsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  private manager(tx?: TransactionContext): EntityManager {
    return tx ? entityManagerOf(tx) : this.dataSource.manager;
  }

  async list(householdId: string, tx?: TransactionContext): Promise<BudgetRecord[]> {
    const entities = await this.manager(tx).find(BudgetEntity, {
      where: { householdId, deletedAt: IsNull() },
      order: { fromMonth: 'ASC', id: 'ASC' },
      ...(tx ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    return entities.map((entity) => ({
      id: entity.id,
      categoryId: entity.categoryId,
      amountCents: entity.amountCents,
      fromMonth: toMonth(entity.fromMonth),
      untilMonth: entity.untilMonth ? toMonth(entity.untilMonth) : null,
    }));
  }

  async insert(
    tx: TransactionContext,
    record: BudgetRecord & { householdId: string; createdByMemberId: string },
  ): Promise<void> {
    await this.manager(tx).insert(BudgetEntity, {
      id: record.id,
      householdId: record.householdId,
      categoryId: record.categoryId,
      amountCents: record.amountCents,
      fromMonth: toDate(record.fromMonth),
      untilMonth: record.untilMonth ? toDate(record.untilMonth) : null,
      createdByMemberId: record.createdByMemberId,
    });
  }

  async setUntil(tx: TransactionContext, id: string, untilMonth: string): Promise<void> {
    await this.manager(tx).update(BudgetEntity, { id }, { untilMonth: toDate(untilMonth) });
  }

  async softDelete(
    tx: TransactionContext,
    ids: readonly string[],
    deletedAt: Date,
    deletedByMemberId: string,
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.manager(tx).update(
      BudgetEntity,
      { id: In([...ids]) },
      { deletedAt, deletedByMemberId },
    );
  }
}
