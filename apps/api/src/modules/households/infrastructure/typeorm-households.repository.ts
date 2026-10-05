import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, IsNull } from 'typeorm';
import { entityManagerOf } from '../../../common/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import {
  type HouseholdPatch,
  type HouseholdRecord,
  HouseholdsRepository,
  type InvitationPatch,
  type InvitationRecord,
  type MemberPatch,
  type MemberRecord,
  type MembershipOfUser,
} from '../application/households.repository';
import { HouseholdInvitationEntity } from './household-invitation.entity';
import { HouseholdMemberEntity } from './household-member.entity';
import { HouseholdEntity } from './household.entity';

function toHousehold(entity: HouseholdEntity): HouseholdRecord {
  return {
    id: entity.id,
    name: entity.name,
    currency: entity.currency,
    timezone: entity.timezone,
    defaultSplit:
      entity.defaultSplitWeights === null
        ? { type: entity.defaultSplitType }
        : { type: entity.defaultSplitType, weights: entity.defaultSplitWeights },
    version: entity.version,
    createdAt: entity.createdAt,
    archivedAt: entity.archivedAt,
  };
}

function toMember(entity: HouseholdMemberEntity): MemberRecord {
  return {
    id: entity.id,
    householdId: entity.householdId,
    userId: entity.userId,
    role: entity.role,
    status: entity.status,
    incomeVisibility: entity.incomeVisibility,
    joinedAt: entity.joinedAt,
    leftAt: entity.leftAt,
  };
}

function toInvitation(entity: HouseholdInvitationEntity): InvitationRecord {
  return {
    id: entity.id,
    householdId: entity.householdId,
    email: entity.email,
    tokenHash: entity.tokenHash,
    invitedByMemberId: entity.invitedByMemberId,
    status: entity.status,
    expiresAt: entity.expiresAt,
    acceptedByUserId: entity.acceptedByUserId,
    acceptedAt: entity.acceptedAt,
    revokedAt: entity.revokedAt,
    createdAt: entity.createdAt,
  };
}

function householdColumns(patch: HouseholdPatch): Partial<HouseholdEntity> {
  const columns: Partial<HouseholdEntity> = {};
  if (patch.name !== undefined) columns.name = patch.name;
  if (patch.timezone !== undefined) columns.timezone = patch.timezone;
  if (patch.archivedAt !== undefined) columns.archivedAt = patch.archivedAt;
  if (patch.defaultSplit !== undefined) {
    columns.defaultSplitType = patch.defaultSplit.type;
    columns.defaultSplitWeights = patch.defaultSplit.weights ?? null;
  }
  return columns;
}

@Injectable()
export class TypeOrmHouseholdsRepository extends HouseholdsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  private manager(tx?: TransactionContext): EntityManager {
    return tx ? entityManagerOf(tx) : this.dataSource.manager;
  }

  async insertHousehold(
    tx: TransactionContext,
    household: Omit<HouseholdRecord, 'createdAt' | 'archivedAt'>,
  ): Promise<void> {
    await this.manager(tx).insert(HouseholdEntity, {
      id: household.id,
      name: household.name,
      currency: household.currency,
      timezone: household.timezone,
      defaultSplitType: household.defaultSplit.type,
      defaultSplitWeights: household.defaultSplit.weights ?? null,
      version: household.version,
    });
  }

  async findHousehold(id: string): Promise<HouseholdRecord | null> {
    const entity = await this.manager().findOneBy(HouseholdEntity, { id, archivedAt: IsNull() });
    return entity ? toHousehold(entity) : null;
  }

  async lockHousehold(tx: TransactionContext, id: string): Promise<HouseholdRecord | null> {
    const entity = await this.manager(tx).findOne(HouseholdEntity, {
      where: { id, archivedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    return entity ? toHousehold(entity) : null;
  }

  async updateHousehold(
    tx: TransactionContext,
    id: string,
    expectedVersion: number,
    patch: HouseholdPatch,
  ): Promise<boolean> {
    const result = await this.manager(tx)
      .createQueryBuilder()
      .update(HouseholdEntity)
      .set({ ...householdColumns(patch), version: () => 'version + 1' })
      .where('id = :id AND version = :expectedVersion AND archived_at IS NULL', {
        id,
        expectedVersion,
      })
      .execute();
    return result.affected === 1;
  }

  async listMembershipsOfUser(userId: string): Promise<MembershipOfUser[]> {
    const members = await this.manager()
      .createQueryBuilder(HouseholdMemberEntity, 'member')
      .innerJoinAndSelect('member.household', 'household')
      .where('member.user_id = :userId', { userId })
      .andWhere(`member.status = 'ACTIVE'`)
      .andWhere('household.archived_at IS NULL')
      .orderBy('household.created_at', 'ASC')
      .getMany();
    if (members.length === 0) {
      return [];
    }
    const counts: { household_id: string; count: number }[] = await this.manager().query(
      `SELECT household_id, count(*)::int AS count FROM household_members
       WHERE status = 'ACTIVE' AND household_id = ANY($1) GROUP BY household_id`,
      [members.map((member) => member.householdId)],
    );
    const countByHousehold = new Map(counts.map((row) => [row.household_id, row.count]));
    return members.flatMap((member) =>
      member.household
        ? [
            {
              household: toHousehold(member.household),
              member: toMember(member),
              activeMemberCount: countByHousehold.get(member.householdId) ?? 0,
            },
          ]
        : [],
    );
  }

  async insertMember(tx: TransactionContext, member: MemberRecord): Promise<void> {
    await this.manager(tx).insert(HouseholdMemberEntity, member);
  }

  async findActiveMembership(
    userId: string,
    householdId: string,
    tx?: TransactionContext,
  ): Promise<MemberRecord | null> {
    const entity = await this.manager(tx)
      .createQueryBuilder(HouseholdMemberEntity, 'member')
      .innerJoin('member.household', 'household')
      .where('member.user_id = :userId AND member.household_id = :householdId', {
        userId,
        householdId,
      })
      .andWhere(`member.status = 'ACTIVE'`)
      .andWhere('household.archived_at IS NULL')
      .getOne();
    return entity ? toMember(entity) : null;
  }

  async findMember(
    tx: TransactionContext,
    householdId: string,
    memberId: string,
  ): Promise<MemberRecord | null> {
    const entity = await this.manager(tx).findOneBy(HouseholdMemberEntity, {
      id: memberId,
      householdId,
    });
    return entity ? toMember(entity) : null;
  }

  async listActiveMembers(householdId: string, tx?: TransactionContext): Promise<MemberRecord[]> {
    const entities = await this.manager(tx).find(HouseholdMemberEntity, {
      where: { householdId, status: 'ACTIVE' },
      order: { joinedAt: 'ASC', id: 'ASC' },
    });
    return entities.map(toMember);
  }

  async listAllMembers(householdId: string, tx?: TransactionContext): Promise<MemberRecord[]> {
    const entities = await this.manager(tx).find(HouseholdMemberEntity, {
      where: { householdId },
      order: { joinedAt: 'ASC', id: 'ASC' },
    });
    return entities.map(toMember);
  }

  async updateMember(tx: TransactionContext, id: string, patch: MemberPatch): Promise<void> {
    await this.manager(tx).update(HouseholdMemberEntity, { id }, patch);
  }

  async insertInvitation(
    tx: TransactionContext,
    invitation: Omit<InvitationRecord, 'createdAt'>,
  ): Promise<void> {
    await this.manager(tx).insert(HouseholdInvitationEntity, invitation);
  }

  async findInvitationByTokenHash(
    tokenHash: string,
    tx?: TransactionContext,
  ): Promise<InvitationRecord | null> {
    const entity = await this.manager(tx).findOne(HouseholdInvitationEntity, {
      where: { tokenHash },
      ...(tx ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    return entity ? toInvitation(entity) : null;
  }

  async findInvitation(
    tx: TransactionContext,
    householdId: string,
    id: string,
  ): Promise<InvitationRecord | null> {
    const entity = await this.manager(tx).findOneBy(HouseholdInvitationEntity, { id, householdId });
    return entity ? toInvitation(entity) : null;
  }

  async listPendingInvitations(
    householdId: string,
    tx?: TransactionContext,
  ): Promise<InvitationRecord[]> {
    const entities = await this.manager(tx).find(HouseholdInvitationEntity, {
      where: { householdId, status: 'PENDING' },
      order: { createdAt: 'DESC' },
    });
    return entities.map(toInvitation);
  }

  async updateInvitation(
    tx: TransactionContext,
    id: string,
    patch: InvitationPatch,
  ): Promise<void> {
    await this.manager(tx).update(HouseholdInvitationEntity, { id }, patch);
  }
}
