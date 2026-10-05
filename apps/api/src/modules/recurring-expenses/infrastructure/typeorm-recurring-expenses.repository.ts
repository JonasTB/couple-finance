import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, IsNull, Not } from 'typeorm';
import { entityManagerOf } from '../../../common/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import {
  type NewRecurringExpense,
  type RecurringExpenseChanges,
  type RecurringExpenseRecord,
  RecurringExpensesRepository,
} from '../application/recurring-expenses.repository';
import { RecurringExpenseEntity } from './recurring-expense.entity';
import { RecurringOccurrenceSkipEntity } from './recurring-occurrence-skip.entity';

function toRecord(entity: RecurringExpenseEntity): RecurringExpenseRecord {
  return {
    id: entity.id,
    householdId: entity.householdId,
    description: entity.description,
    categoryId: entity.categoryId,
    expectedAmountCents: entity.expectedAmountCents,
    amountType: entity.amountType,
    frequency: entity.frequency,
    interval: entity.interval,
    startDate: entity.startDate,
    endDate: entity.endDate,
    payerMemberId: entity.payerMemberId,
    paymentMethod: entity.paymentMethod,
    splitRule: entity.splitRule,
    notes: entity.notes,
    pauses: entity.pauses,
    createdByMemberId: entity.createdByMemberId,
    version: entity.version,
    createdAt: entity.createdAt,
    deletedAt: entity.deletedAt,
    deletedByMemberId: entity.deletedByMemberId,
  };
}

@Injectable()
export class TypeOrmRecurringExpensesRepository extends RecurringExpensesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  private manager(tx?: TransactionContext): EntityManager {
    return tx ? entityManagerOf(tx) : this.dataSource.manager;
  }

  async insert(tx: TransactionContext, record: NewRecurringExpense): Promise<void> {
    await this.manager(tx).insert(RecurringExpenseEntity, record);
  }

  async find(
    householdId: string,
    id: string,
    options: { tx?: TransactionContext; lock?: boolean } = {},
  ): Promise<RecurringExpenseRecord | null> {
    const entity = await this.manager(options.tx).findOne(RecurringExpenseEntity, {
      where: { id, householdId },
      ...(options.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    return entity ? toRecord(entity) : null;
  }

  async list(householdId: string, deleted: 'exclude' | 'only'): Promise<RecurringExpenseRecord[]> {
    const entities = await this.manager().find(RecurringExpenseEntity, {
      where: { householdId, deletedAt: deleted === 'only' ? Not(IsNull()) : IsNull() },
      order: { description: 'ASC', id: 'ASC' },
    });
    return entities.map(toRecord);
  }

  async update(
    tx: TransactionContext,
    id: string,
    expectedVersion: number,
    changes: RecurringExpenseChanges,
  ): Promise<boolean> {
    const result = await this.manager(tx)
      .createQueryBuilder()
      .update(RecurringExpenseEntity)
      .set({ ...changes, version: () => 'version + 1' })
      .where('id = :id AND version = :expectedVersion', { id, expectedVersion })
      .execute();
    return result.affected === 1;
  }

  async skips(
    recurringExpenseIds: readonly string[],
    tx?: TransactionContext,
  ): Promise<{ recurringExpenseId: string; occurrenceDate: string }[]> {
    if (recurringExpenseIds.length === 0) {
      return [];
    }
    const rows = await this.manager(tx).find(RecurringOccurrenceSkipEntity, {
      where: { recurringExpenseId: In([...recurringExpenseIds]) },
    });
    return rows.map((row) => ({
      recurringExpenseId: row.recurringExpenseId,
      occurrenceDate: row.occurrenceDate,
    }));
  }

  async addSkip(
    tx: TransactionContext,
    skip: {
      id: string;
      recurringExpenseId: string;
      occurrenceDate: string;
      createdByMemberId: string;
    },
  ): Promise<boolean> {
    const rows: unknown[] = await this.manager(tx).query(
      `INSERT INTO recurring_occurrence_skips
         (id, recurring_expense_id, occurrence_date, created_by_member_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ON CONSTRAINT uq_recurring_occurrence_skips DO NOTHING
       RETURNING id`,
      [skip.id, skip.recurringExpenseId, skip.occurrenceDate, skip.createdByMemberId],
    );
    return rows.length > 0;
  }

  async removeSkip(
    tx: TransactionContext,
    recurringExpenseId: string,
    occurrenceDate: string,
  ): Promise<boolean> {
    const result = await this.manager(tx).delete(RecurringOccurrenceSkipEntity, {
      recurringExpenseId,
      occurrenceDate,
    });
    return (result.affected ?? 0) > 0;
  }
}
