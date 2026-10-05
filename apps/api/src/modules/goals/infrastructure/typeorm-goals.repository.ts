import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, IsNull } from 'typeorm';
import { entityManagerOf } from '../../../common/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import {
  type GoalChanges,
  type GoalEntryRecord,
  type GoalRecord,
  GoalsRepository,
} from '../application/goals.repository';
import { GoalContributionEntity } from './goal-contribution.entity';
import { GoalEntity } from './goal.entity';

const toGoal = (e: GoalEntity): GoalRecord => ({
  id: e.id,
  householdId: e.householdId,
  name: e.name,
  targetAmountCents: e.targetAmountCents,
  targetDate: e.targetDate,
  participantMemberIds: e.participantMemberIds,
  createdByMemberId: e.createdByMemberId,
  version: e.version,
  createdAt: e.createdAt,
  archivedAt: e.archivedAt,
});

const toEntry = (e: GoalContributionEntity): GoalEntryRecord => ({
  id: e.id,
  goalId: e.goalId,
  memberId: e.memberId,
  type: e.type,
  amountCents: e.amountCents,
  date: e.date,
  notes: e.notes,
  createdByMemberId: e.createdByMemberId,
  createdAt: e.createdAt,
  deletedAt: e.deletedAt,
});

@Injectable()
export class TypeOrmGoalsRepository extends GoalsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  private manager(tx?: TransactionContext): EntityManager {
    return tx ? entityManagerOf(tx) : this.dataSource.manager;
  }

  async insert(
    tx: TransactionContext,
    goal: Omit<GoalRecord, 'version' | 'archivedAt'>,
  ): Promise<void> {
    await this.manager(tx).insert(GoalEntity, goal);
  }

  async find(
    householdId: string,
    id: string,
    options: { tx?: TransactionContext; lock?: boolean } = {},
  ): Promise<GoalRecord | null> {
    const entity = await this.manager(options.tx).findOne(GoalEntity, {
      where: { id, householdId },
      ...(options.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    return entity ? toGoal(entity) : null;
  }

  async list(householdId: string, ids?: readonly string[]): Promise<GoalRecord[]> {
    if (ids?.length === 0) return [];
    const entities = await this.manager().find(GoalEntity, {
      where: { householdId, ...(ids ? { id: In([...ids]) } : {}) },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return entities.map(toGoal);
  }

  async update(
    tx: TransactionContext,
    id: string,
    expectedVersion: number,
    changes: GoalChanges,
  ): Promise<boolean> {
    const result = await this.manager(tx)
      .createQueryBuilder()
      .update(GoalEntity)
      .set({ ...changes, version: () => 'version + 1' })
      .where('id = :id AND version = :expectedVersion', { id, expectedVersion })
      .execute();
    return result.affected === 1;
  }

  async entries(
    goalIds: readonly string[],
    options: { tx?: TransactionContext; withDeleted?: boolean } = {},
  ): Promise<GoalEntryRecord[]> {
    if (goalIds.length === 0) return [];
    const entities = await this.manager(options.tx).find(GoalContributionEntity, {
      where: {
        goalId: In([...goalIds]),
        ...(options.withDeleted ? {} : { deletedAt: IsNull() }),
      },
      order: { date: 'ASC', createdAt: 'ASC', id: 'ASC' },
    });
    return entities.map(toEntry);
  }

  async insertEntry(
    tx: TransactionContext,
    entry: Omit<GoalEntryRecord, 'createdAt' | 'deletedAt'>,
  ): Promise<void> {
    await this.manager(tx).insert(GoalContributionEntity, entry);
  }

  async setEntryDeleted(
    tx: TransactionContext,
    id: string,
    deletedAt: Date | null,
    deletedByMemberId: string | null,
  ): Promise<void> {
    await this.manager(tx).update(GoalContributionEntity, { id }, { deletedAt, deletedByMemberId });
  }
}
