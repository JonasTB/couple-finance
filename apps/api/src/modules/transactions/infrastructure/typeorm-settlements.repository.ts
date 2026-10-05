import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { entityManagerOf } from '../../../common/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import { centsFromDatabase } from '../../../common/money/cents';
import {
  type NewSettlement,
  type SettlementRecord,
  SettlementsRepository,
  type SettlementTotals,
} from '../application/settlements.repository';
import { SettlementEntity } from './settlement.entity';

function toRecord(entity: SettlementEntity): SettlementRecord {
  return {
    id: entity.id,
    householdId: entity.householdId,
    fromMemberId: entity.fromMemberId,
    toMemberId: entity.toMemberId,
    amountCents: entity.amountCents,
    date: entity.date,
    notes: entity.notes,
    createdByMemberId: entity.createdByMemberId,
    createdAt: entity.createdAt,
    deletedAt: entity.deletedAt,
    deletedByMemberId: entity.deletedByMemberId,
  };
}

@Injectable()
export class TypeOrmSettlementsRepository extends SettlementsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  private manager(tx?: TransactionContext): EntityManager {
    return tx ? entityManagerOf(tx) : this.dataSource.manager;
  }

  async insert(tx: TransactionContext, settlement: NewSettlement): Promise<void> {
    await this.manager(tx).insert(SettlementEntity, settlement);
  }

  async find(
    householdId: string,
    id: string,
    options: { tx?: TransactionContext; lock?: boolean } = {},
  ): Promise<SettlementRecord | null> {
    const entity = await this.manager(options.tx).findOne(SettlementEntity, {
      where: { id, householdId },
      ...(options.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    return entity ? toRecord(entity) : null;
  }

  async setDeleted(
    tx: TransactionContext,
    id: string,
    deletedAt: Date | null,
    deletedByMemberId: string | null,
  ): Promise<void> {
    await this.manager(tx).update(SettlementEntity, { id }, { deletedAt, deletedByMemberId });
  }

  async list(
    householdId: string,
    range: { from?: string; to?: string },
    deleted: 'exclude' | 'only',
    limit: number,
  ): Promise<SettlementRecord[]> {
    const query = this.manager()
      .createQueryBuilder(SettlementEntity, 's')
      .where('s.household_id = :householdId', { householdId })
      .andWhere(deleted === 'only' ? 's.deleted_at IS NOT NULL' : 's.deleted_at IS NULL');
    if (range.from) query.andWhere('s.date >= :from', { from: range.from });
    if (range.to) query.andWhere('s.date <= :to', { to: range.to });
    const entities = await query
      .orderBy('s.date', 'DESC')
      .addOrderBy('s.created_at', 'DESC')
      .addOrderBy('s.id', 'DESC')
      .take(limit)
      .getMany();
    return entities.map(toRecord);
  }

  async totalsByMember(
    householdId: string,
    upTo: string,
    from?: string,
  ): Promise<SettlementTotals[]> {
    const rows: { member_id: string; sent: string; received: string }[] =
      await this.manager().query(
        `SELECT member_id, SUM(sent) AS sent, SUM(received) AS received FROM (
           SELECT from_member_id AS member_id, amount_cents AS sent, 0 AS received
             FROM settlements
            WHERE household_id = $1 AND deleted_at IS NULL AND date <= $2
              AND ($3::date IS NULL OR date >= $3::date)
           UNION ALL
           SELECT to_member_id, 0, amount_cents
             FROM settlements
            WHERE household_id = $1 AND deleted_at IS NULL AND date <= $2
              AND ($3::date IS NULL OR date >= $3::date)
         ) AS flows
         GROUP BY member_id`,
        [householdId, upTo, from ?? null],
      );
    return rows.map((row) => ({
      memberId: row.member_id,
      sentCents: centsFromDatabase(row.sent),
      receivedCents: centsFromDatabase(row.received),
    }));
  }
}
