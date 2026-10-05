import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, IsNull, LessThanOrEqual } from 'typeorm';
import { entityManagerOf } from '../../../common/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import { type IncomeRecord, IncomesRepository } from '../application/incomes.repository';
import { isEffectiveOn } from '../domain/income-basis';
import { IncomeRecordEntity } from './income-record.entity';

function toRecord(entity: IncomeRecordEntity): IncomeRecord {
  return {
    id: entity.id,
    householdId: entity.householdId,
    memberId: entity.memberId,
    monthlyAmountCents: entity.monthlyAmountCents,
    effectiveFrom: entity.effectiveFrom,
    effectiveTo: entity.effectiveTo,
  };
}

@Injectable()
export class TypeOrmIncomesRepository extends IncomesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  private manager(tx?: TransactionContext): EntityManager {
    return tx ? entityManagerOf(tx) : this.dataSource.manager;
  }

  async listForMember(
    memberId: string,
    options: { tx?: TransactionContext; lock?: boolean } = {},
  ): Promise<IncomeRecord[]> {
    const entities = await this.manager(options.tx).find(IncomeRecordEntity, {
      where: { memberId, deletedAt: IsNull() },
      order: { effectiveFrom: 'DESC' },
      ...(options.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    return entities.map(toRecord);
  }

  async effectiveOn(
    householdId: string,
    memberIds: readonly string[],
    date: string,
    tx?: TransactionContext,
  ): Promise<IncomeRecord[]> {
    if (memberIds.length === 0) {
      return [];
    }
    const entities = await this.manager(tx).find(IncomeRecordEntity, {
      where: {
        householdId,
        memberId: In([...memberIds]),
        deletedAt: IsNull(),
        effectiveFrom: LessThanOrEqual(date),
      },
    });
    return entities.map(toRecord).filter((record) => isEffectiveOn(record, date));
  }

  async overlapping(
    householdId: string,
    memberIds: readonly string[],
    from: string,
    to: string,
  ): Promise<IncomeRecord[]> {
    if (memberIds.length === 0) {
      return [];
    }
    const entities = await this.manager()
      .createQueryBuilder(IncomeRecordEntity, 'i')
      .where('i.household_id = :householdId AND i.deleted_at IS NULL', { householdId })
      .andWhere('i.member_id IN (:...memberIds)', { memberIds })
      .andWhere('i.effective_from <= :to', { to })
      .andWhere('(i.effective_to IS NULL OR i.effective_to > :from)', { from })
      .getMany();
    return entities.map(toRecord);
  }

  async insert(tx: TransactionContext, record: IncomeRecord): Promise<void> {
    await this.manager(tx).insert(IncomeRecordEntity, record);
  }

  async update(
    tx: TransactionContext,
    id: string,
    patch: Partial<Pick<IncomeRecord, 'monthlyAmountCents' | 'effectiveTo'>>,
  ): Promise<void> {
    await this.manager(tx).update(IncomeRecordEntity, { id }, patch);
  }

  async softDelete(tx: TransactionContext, id: string, deletedAt: Date): Promise<void> {
    await this.manager(tx).update(IncomeRecordEntity, { id }, { deletedAt });
  }
}
