import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, IsNull } from 'typeorm';
import { entityManagerOf } from '../../../common/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import {
  type ItemChanges,
  type PlanChanges,
  type PurchaseItemRecord,
  type PurchasePlanRecord,
  PurchasePlansRepository,
} from '../application/purchase-plans.repository';
import { PurchasePlanItemEntity } from './purchase-plan-item.entity';
import { PurchasePlanEntity } from './purchase-plan.entity';

const toPlan = (e: PurchasePlanEntity): PurchasePlanRecord => ({
  id: e.id,
  householdId: e.householdId,
  name: e.name,
  description: e.description,
  goalId: e.goalId,
  createdByMemberId: e.createdByMemberId,
  version: e.version,
  createdAt: e.createdAt,
  archivedAt: e.archivedAt,
});

const toItem = (e: PurchasePlanItemEntity): PurchaseItemRecord => ({
  id: e.id,
  purchasePlanId: e.purchasePlanId,
  name: e.name,
  estimatedPriceCents: e.estimatedPriceCents,
  quantity: e.quantity,
  priority: e.priority,
  status: e.status,
  paidPriceCents: e.paidPriceCents,
  purchasedAt: e.purchasedAt,
  transactionId: e.transactionId,
  responsibleMemberId: e.responsibleMemberId,
  url: e.url,
  notes: e.notes,
  createdByMemberId: e.createdByMemberId,
  version: e.version,
  deletedAt: e.deletedAt,
});

@Injectable()
export class TypeOrmPurchasePlansRepository extends PurchasePlansRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  private manager(tx?: TransactionContext): EntityManager {
    return tx ? entityManagerOf(tx) : this.dataSource.manager;
  }

  async insert(
    tx: TransactionContext,
    plan: Omit<PurchasePlanRecord, 'version' | 'createdAt' | 'archivedAt'>,
  ): Promise<void> {
    await this.manager(tx).insert(PurchasePlanEntity, plan);
  }

  async find(
    householdId: string,
    id: string,
    options: { tx?: TransactionContext; lock?: boolean } = {},
  ): Promise<PurchasePlanRecord | null> {
    const entity = await this.manager(options.tx).findOne(PurchasePlanEntity, {
      where: { id, householdId },
      ...(options.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    return entity ? toPlan(entity) : null;
  }

  async list(householdId: string): Promise<PurchasePlanRecord[]> {
    const entities = await this.manager().find(PurchasePlanEntity, {
      where: { householdId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return entities.map(toPlan);
  }

  async update(
    tx: TransactionContext,
    id: string,
    expectedVersion: number,
    changes: PlanChanges,
  ): Promise<boolean> {
    const result = await this.manager(tx)
      .createQueryBuilder()
      .update(PurchasePlanEntity)
      .set({ ...changes, version: () => 'version + 1' })
      .where('id = :id AND version = :expectedVersion', { id, expectedVersion })
      .execute();
    return result.affected === 1;
  }

  async items(
    planIds: readonly string[],
    options: { tx?: TransactionContext; withDeleted?: boolean } = {},
  ): Promise<PurchaseItemRecord[]> {
    if (planIds.length === 0) return [];
    const entities = await this.manager(options.tx).find(PurchasePlanItemEntity, {
      where: {
        purchasePlanId: In([...planIds]),
        ...(options.withDeleted ? {} : { deletedAt: IsNull() }),
      },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return entities.map(toItem);
  }

  async insertItem(
    tx: TransactionContext,
    item: Omit<PurchaseItemRecord, 'version' | 'deletedAt'>,
  ): Promise<void> {
    await this.manager(tx).insert(PurchasePlanItemEntity, item);
  }

  async updateItem(
    tx: TransactionContext,
    id: string,
    expectedVersion: number,
    changes: ItemChanges,
  ): Promise<boolean> {
    const result = await this.manager(tx)
      .createQueryBuilder()
      .update(PurchasePlanItemEntity)
      .set({ ...changes, version: () => 'version + 1' })
      .where('id = :id AND version = :expectedVersion', { id, expectedVersion })
      .execute();
    return result.affected === 1;
  }
}
