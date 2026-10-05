import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, IsNull, Not } from 'typeorm';
import { entityManagerOf } from '../../../common/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import {
  type InstallmentPlanRecord,
  InstallmentPlansRepository,
  type NewInstallmentPlan,
} from '../application/installment-plans.repository';
import { InstallmentPlanEntity } from './installment-plan.entity';

function toRecord(entity: InstallmentPlanEntity): InstallmentPlanRecord {
  return {
    id: entity.id,
    householdId: entity.householdId,
    description: entity.description,
    categoryId: entity.categoryId,
    originalTotalCents: entity.originalTotalCents,
    installmentCount: entity.installmentCount,
    firstInstallmentDate: entity.firstInstallmentDate,
    payerMemberId: entity.payerMemberId,
    paymentMethod: entity.paymentMethod,
    splitSnapshot: entity.splitSnapshot,
    notes: entity.notes,
    createdByMemberId: entity.createdByMemberId,
    closeKind: entity.closeKind,
    closedAt: entity.closedAt,
    closedByMemberId: entity.closedByMemberId,
    createdAt: entity.createdAt,
    deletedAt: entity.deletedAt,
    deletedByMemberId: entity.deletedByMemberId,
  };
}

@Injectable()
export class TypeOrmInstallmentPlansRepository extends InstallmentPlansRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  private manager(tx?: TransactionContext): EntityManager {
    return tx ? entityManagerOf(tx) : this.dataSource.manager;
  }

  async insert(tx: TransactionContext, plan: NewInstallmentPlan): Promise<void> {
    await this.manager(tx).insert(InstallmentPlanEntity, plan);
  }

  async find(
    householdId: string,
    id: string,
    options: { tx?: TransactionContext; lock?: boolean } = {},
  ): Promise<InstallmentPlanRecord | null> {
    const entity = await this.manager(options.tx).findOne(InstallmentPlanEntity, {
      where: { id, householdId },
      ...(options.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    return entity ? toRecord(entity) : null;
  }

  async list(householdId: string, deleted: 'exclude' | 'only'): Promise<InstallmentPlanRecord[]> {
    const entities = await this.manager().find(InstallmentPlanEntity, {
      where: { householdId, deletedAt: deleted === 'only' ? Not(IsNull()) : IsNull() },
      order: { firstInstallmentDate: 'DESC', id: 'DESC' },
    });
    return entities.map(toRecord);
  }

  async update(
    tx: TransactionContext,
    id: string,
    changes: Partial<
      Pick<
        InstallmentPlanRecord,
        'closeKind' | 'closedAt' | 'closedByMemberId' | 'deletedAt' | 'deletedByMemberId'
      >
    >,
  ): Promise<void> {
    await this.manager(tx).update(InstallmentPlanEntity, { id }, changes);
  }
}
