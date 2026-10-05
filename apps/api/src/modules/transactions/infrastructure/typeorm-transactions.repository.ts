import { Injectable } from '@nestjs/common';
import type { TransactionOrigin } from '@couple-finance/shared';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, type EntityManager, In, IsNull } from 'typeorm';
import { entityManagerOf } from '../../../common/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import { centsFromDatabase } from '../../../common/money/cents';
import { IdGenerator } from '../../../common/ids/id-generator';
import {
  type LedgerTotals,
  type MonthlyResponsibilityRow,
  type MonthlySpendRow,
  type NewTransaction,
  type PageCursor,
  type TransactionChanges,
  type TransactionFilters,
  type TransactionRecord,
  TransactionsRepository,
} from '../application/transactions.repository';
import { type Allocation, type SplitSnapshot } from '../domain/split';
import { TransactionAllocationEntity } from './transaction-allocation.entity';
import { TransactionEntity } from './transaction.entity';

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function originOf(entity: TransactionEntity): TransactionOrigin | null {
  if (entity.recurringExpenseId && entity.occurrenceDate) {
    return {
      kind: 'RECURRING',
      recurringExpenseId: entity.recurringExpenseId,
      occurrenceDate: entity.occurrenceDate,
    };
  }
  if (entity.installmentPlanId && entity.installmentNumber && entity.installmentCount) {
    return {
      kind: 'INSTALLMENT',
      installmentPlanId: entity.installmentPlanId,
      installmentNumber: entity.installmentNumber,
      installmentCount: entity.installmentCount,
      payoff: entity.installmentPayoff,
    };
  }
  return null;
}

function originColumns(origin: TransactionOrigin | null) {
  return {
    recurringExpenseId: origin?.kind === 'RECURRING' ? origin.recurringExpenseId : null,
    occurrenceDate: origin?.kind === 'RECURRING' ? origin.occurrenceDate : null,
    installmentPlanId: origin?.kind === 'INSTALLMENT' ? origin.installmentPlanId : null,
    installmentNumber: origin?.kind === 'INSTALLMENT' ? origin.installmentNumber : null,
    installmentCount: origin?.kind === 'INSTALLMENT' ? origin.installmentCount : null,
    installmentPayoff: origin?.kind === 'INSTALLMENT' ? origin.payoff : false,
  };
}

@Injectable()
export class TypeOrmTransactionsRepository extends TransactionsRepository {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  private manager(tx?: TransactionContext): EntityManager {
    return tx ? entityManagerOf(tx) : this.dataSource.manager;
  }

  private allocationRows(transactionId: string, split: SplitSnapshot, allocations: Allocation[]) {
    const weightOf = new Map(split.weights.map((w) => [w.memberId, w.weight]));
    return allocations.map((allocation) => ({
      id: this.ids.next(),
      transactionId,
      memberId: allocation.memberId,
      amountCents: allocation.amountCents,
      weight: weightOf.get(allocation.memberId) ?? 0,
    }));
  }

  private async withAllocations(
    entities: TransactionEntity[],
    manager: EntityManager,
  ): Promise<TransactionRecord[]> {
    if (entities.length === 0) {
      return [];
    }
    const allocations = await manager.find(TransactionAllocationEntity, {
      where: { transactionId: In(entities.map((entity) => entity.id)) },
    });
    return entities.map((entity) => {
      // Allocations follow the snapshot order, i.e. the stable member order.
      const order = entity.splitSnapshot.weights.map((w) => w.memberId);
      const own = allocations
        .filter((allocation) => allocation.transactionId === entity.id)
        .sort((a, b) => order.indexOf(a.memberId) - order.indexOf(b.memberId))
        .map((allocation) => ({
          memberId: allocation.memberId,
          amountCents: allocation.amountCents,
        }));
      return {
        id: entity.id,
        householdId: entity.householdId,
        description: entity.description,
        amountCents: entity.amountCents,
        date: entity.date,
        categoryId: entity.categoryId,
        payerMemberId: entity.payerMemberId,
        paymentMethod: entity.paymentMethod,
        notes: entity.notes,
        tags: entity.tags,
        split: entity.splitSnapshot,
        allocations: own,
        origin: originOf(entity),
        createdByMemberId: entity.createdByMemberId,
        version: entity.version,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        deletedAt: entity.deletedAt,
        deletedByMemberId: entity.deletedByMemberId,
      };
    });
  }

  async insert(tx: TransactionContext, transaction: NewTransaction): Promise<void> {
    const manager = this.manager(tx);
    await manager.insert(TransactionEntity, {
      id: transaction.id,
      householdId: transaction.householdId,
      description: transaction.description,
      amountCents: transaction.amountCents,
      date: transaction.date,
      categoryId: transaction.categoryId,
      payerMemberId: transaction.payerMemberId,
      paymentMethod: transaction.paymentMethod,
      notes: transaction.notes,
      tags: transaction.tags,
      splitType: transaction.split.type,
      splitSnapshot: transaction.split,
      ...originColumns(transaction.origin),
      createdByMemberId: transaction.createdByMemberId,
    });
    await manager.insert(
      TransactionAllocationEntity,
      this.allocationRows(transaction.id, transaction.split, transaction.allocations),
    );
  }

  async find(
    householdId: string,
    id: string,
    options: { tx?: TransactionContext; lock?: boolean } = {},
  ): Promise<TransactionRecord | null> {
    const manager = this.manager(options.tx);
    const entity = await manager.findOne(TransactionEntity, {
      where: { id, householdId },
      ...(options.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    return entity ? ((await this.withAllocations([entity], manager))[0] ?? null) : null;
  }

  async update(
    tx: TransactionContext,
    id: string,
    expectedVersion: number,
    changes: TransactionChanges,
  ): Promise<boolean> {
    const manager = this.manager(tx);
    const result = await manager
      .createQueryBuilder()
      .update(TransactionEntity)
      .set({
        description: changes.description,
        amountCents: changes.amountCents,
        date: changes.date,
        categoryId: changes.categoryId,
        payerMemberId: changes.payerMemberId,
        paymentMethod: changes.paymentMethod,
        notes: changes.notes,
        tags: changes.tags,
        splitType: changes.split.type,
        splitSnapshot: changes.split,
        deletedAt: changes.deletedAt,
        deletedByMemberId: changes.deletedByMemberId,
        version: () => 'version + 1',
      })
      .where('id = :id AND version = :expectedVersion', { id, expectedVersion })
      .execute();
    if (result.affected !== 1) {
      return false;
    }
    // The deferred balance trigger checks the new allocations at commit.
    await manager.delete(TransactionAllocationEntity, { transactionId: id });
    await manager.insert(
      TransactionAllocationEntity,
      this.allocationRows(id, changes.split, changes.allocations),
    );
    return true;
  }

  async list(
    householdId: string,
    filters: TransactionFilters,
    cursor: PageCursor | null,
    limit: number,
  ): Promise<TransactionRecord[]> {
    const query = this.manager()
      .createQueryBuilder(TransactionEntity, 't')
      .where('t.household_id = :householdId', { householdId })
      .andWhere(filters.deleted === 'only' ? 't.deleted_at IS NOT NULL' : 't.deleted_at IS NULL');

    if (filters.from) query.andWhere('t.date >= :from', { from: filters.from });
    if (filters.to) query.andWhere('t.date <= :to', { to: filters.to });
    if (filters.categoryIds)
      query.andWhere('t.category_id IN (:...categoryIds)', { categoryIds: filters.categoryIds });
    if (filters.payerMemberId)
      query.andWhere('t.payer_member_id = :payer', { payer: filters.payerMemberId });
    if (filters.splitType)
      query.andWhere('t.split_type = :splitType', { splitType: filters.splitType });
    if (filters.paymentMethod) {
      query.andWhere('t.payment_method = :paymentMethod', { paymentMethod: filters.paymentMethod });
    }
    if (filters.responsibleMemberId) {
      query.andWhere(
        `EXISTS (SELECT 1 FROM transaction_allocations a
                 WHERE a.transaction_id = t.id AND a.member_id = :responsible AND a.amount_cents > 0)`,
        { responsible: filters.responsibleMemberId },
      );
    }
    if (filters.text) {
      query.andWhere(
        new Brackets((where) => {
          where
            .where(`t.description ILIKE :text ESCAPE '\\'`)
            .orWhere(`t.notes ILIKE :text ESCAPE '\\'`)
            .orWhere(`EXISTS (SELECT 1 FROM unnest(t.tags) tag WHERE tag ILIKE :text ESCAPE '\\')`);
        }),
        { text: `%${escapeLike(filters.text)}%` },
      );
    }
    if (cursor) {
      query.andWhere('(t.date < :cursorDate OR (t.date = :cursorDate AND t.id < :cursorId))', {
        cursorDate: cursor.date,
        cursorId: cursor.id,
      });
    }
    const entities = await query
      .orderBy('t.date', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .take(limit)
      .getMany();
    return this.withAllocations(entities, this.manager());
  }

  async listProportionalInRange(
    tx: TransactionContext,
    householdId: string,
    from: string,
    to: string,
  ): Promise<TransactionRecord[]> {
    const manager = this.manager(tx);
    const entities = await manager
      .createQueryBuilder(TransactionEntity, 't')
      .setLock('pessimistic_write')
      .where('t.household_id = :householdId', { householdId })
      .andWhere(`t.split_type = 'INCOME_PROPORTIONAL' AND t.deleted_at IS NULL`)
      .andWhere('t.date BETWEEN :from AND :to', { from, to })
      .orderBy('t.date', 'ASC')
      .addOrderBy('t.id', 'ASC')
      .getMany();
    return this.withAllocations(entities, manager);
  }

  async listInRange(householdId: string, from: string, to: string): Promise<TransactionRecord[]> {
    const entities = await this.manager()
      .createQueryBuilder(TransactionEntity, 't')
      .where('t.household_id = :householdId AND t.deleted_at IS NULL', { householdId })
      .andWhere('t.date BETWEEN :from AND :to', { from, to })
      .orderBy('t.date', 'ASC')
      .addOrderBy('t.id', 'ASC')
      .getMany();
    return this.withAllocations(entities, this.manager());
  }

  async totalsByMember(householdId: string, upTo: string): Promise<LedgerTotals[]> {
    // Two aggregates over the partial (household_id, date) index, merged per member.
    const rows: { member_id: string; paid: string; responsible: string }[] =
      await this.manager().query(
        `SELECT member_id, SUM(paid) AS paid, SUM(responsible) AS responsible FROM (
           SELECT t.payer_member_id AS member_id, SUM(t.amount_cents) AS paid, 0 AS responsible
             FROM transactions t
            WHERE t.household_id = $1 AND t.deleted_at IS NULL AND t.date <= $2
            GROUP BY t.payer_member_id
           UNION ALL
           SELECT a.member_id, 0, SUM(a.amount_cents)
             FROM transactions t
             JOIN transaction_allocations a ON a.transaction_id = t.id
            WHERE t.household_id = $1 AND t.deleted_at IS NULL AND t.date <= $2
            GROUP BY a.member_id
         ) AS flows
         GROUP BY member_id`,
        [householdId, upTo],
      );
    return rows.map((row) => ({
      memberId: row.member_id,
      paidCents: centsFromDatabase(row.paid),
      responsibleCents: centsFromDatabase(row.responsible),
    }));
  }

  async monthlySpend(householdId: string, from: string, to: string): Promise<MonthlySpendRow[]> {
    // One aggregate over the partial (household_id, date) index; categories roll up in memory.
    const rows: {
      month: string;
      category_id: string;
      payer_member_id: string;
      shared: boolean;
      origin: MonthlySpendRow['origin'];
      amount: string;
    }[] = await this.manager().query(
      `SELECT to_char(t.date, 'YYYY-MM') AS month, t.category_id, t.payer_member_id,
              t.split_type <> 'INDIVIDUAL' AS shared,
              CASE WHEN t.installment_plan_id IS NOT NULL THEN 'INSTALLMENT'
                   WHEN t.recurring_expense_id IS NOT NULL THEN 'RECURRING'
                   ELSE 'NONE' END AS origin,
              SUM(t.amount_cents) AS amount
         FROM transactions t
        WHERE t.household_id = $1 AND t.deleted_at IS NULL AND t.date BETWEEN $2 AND $3
        GROUP BY 1, 2, 3, 4, 5
        ORDER BY 1, 2, 3, 4, 5`,
      [householdId, from, to],
    );
    return rows.map((row) => ({
      month: row.month,
      categoryId: row.category_id,
      payerMemberId: row.payer_member_id,
      shared: row.shared,
      origin: row.origin,
      amountCents: centsFromDatabase(row.amount),
    }));
  }

  async monthlyResponsibility(
    householdId: string,
    from: string,
    to: string,
  ): Promise<MonthlyResponsibilityRow[]> {
    const rows: { month: string; member_id: string; amount: string }[] = await this.manager().query(
      `SELECT to_char(t.date, 'YYYY-MM') AS month, a.member_id, SUM(a.amount_cents) AS amount
           FROM transactions t
           JOIN transaction_allocations a ON a.transaction_id = t.id
          WHERE t.household_id = $1 AND t.deleted_at IS NULL AND t.date BETWEEN $2 AND $3
            AND t.split_type <> 'INDIVIDUAL'
          GROUP BY 1, 2
          ORDER BY 1, 2`,
      [householdId, from, to],
    );
    return rows.map((row) => ({
      month: row.month,
      memberId: row.member_id,
      amountCents: centsFromDatabase(row.amount),
    }));
  }

  async firstDate(householdId: string): Promise<string | null> {
    const [row]: { first: string | null }[] = await this.manager().query(
      `SELECT to_char(MIN(t.date), 'YYYY-MM-DD') AS first
         FROM transactions t
        WHERE t.household_id = $1 AND t.deleted_at IS NULL`,
      [householdId],
    );
    return row?.first ?? null;
  }

  async hasAny(householdId: string): Promise<boolean> {
    return this.manager().exists(TransactionEntity, {
      where: { householdId, deletedAt: IsNull() },
    });
  }

  async listByOrigin(
    householdId: string,
    origin: { installmentPlanIds: readonly string[] } | { recurringExpenseIds: readonly string[] },
    options: { tx?: TransactionContext; deletedAt?: Date } = {},
  ): Promise<TransactionRecord[]> {
    const ids =
      'installmentPlanIds' in origin ? origin.installmentPlanIds : origin.recurringExpenseIds;
    if (ids.length === 0) {
      return [];
    }
    const manager = this.manager(options.tx);
    const query = manager
      .createQueryBuilder(TransactionEntity, 't')
      .where('t.household_id = :householdId', { householdId })
      .andWhere(
        'installmentPlanIds' in origin
          ? 't.installment_plan_id IN (:...ids)'
          : 't.recurring_expense_id IN (:...ids)',
        { ids },
      );
    if (options.deletedAt) {
      query.andWhere('t.deleted_at = :deletedAt', { deletedAt: options.deletedAt });
    } else {
      query.andWhere('t.deleted_at IS NULL');
    }
    const entities = await query
      .orderBy('t.date', 'ASC')
      .addOrderBy('t.installment_number', 'ASC')
      .addOrderBy('t.id', 'ASC')
      .getMany();
    return this.withAllocations(entities, manager);
  }

  async summaries(
    householdId: string,
    ids: readonly string[],
  ): Promise<{ id: string; description: string; amountCents: number; date: string }[]> {
    if (ids.length === 0) return [];
    const entities = await this.manager().find(TransactionEntity, {
      where: { householdId, id: In([...ids]), deletedAt: IsNull() },
      select: { id: true, description: true, amountCents: true, date: true },
    });
    return entities.map((e) => ({
      id: e.id,
      description: e.description,
      amountCents: e.amountCents,
      date: e.date,
    }));
  }
}
