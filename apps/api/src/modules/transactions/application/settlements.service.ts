import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type SettlementInput, type SettlementView } from '@couple-finance/shared';
import { type Actor } from '../../../common/auth/current-actor.decorator';
import { UnitOfWork } from '../../../common/database/unit-of-work';
import { AppException, validationFailed } from '../../../common/errors/app.exception';
import { IdGenerator } from '../../../common/ids/id-generator';
import { Clock } from '../../../common/time/clock';
import { AuditRecorder } from '../../audit/public';
import { HouseholdDirectory, type MemberContext } from '../../households/public';
import { type SettlementRecord, SettlementsRepository } from './settlements.repository';

const ENTITY_TYPE = 'SETTLEMENT';
const LIST_LIMIT = 100;

const notFound = (): AppException =>
  new AppException(ErrorCode.NOT_FOUND, 'Settlement not found.', HttpStatus.NOT_FOUND);

export function toSettlementView(record: SettlementRecord): SettlementView {
  return {
    id: record.id,
    fromMemberId: record.fromMemberId,
    toMemberId: record.toMemberId,
    amountCents: record.amountCents,
    date: record.date,
    notes: record.notes,
    createdByMemberId: record.createdByMemberId,
    createdAt: record.createdAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
  };
}

function snapshot(record: SettlementRecord): Record<string, unknown> {
  const { createdAt: _created, ...rest } = toSettlementView(record);
  return rest;
}

/**
 * Settlements (Q-01, BUSINESS_RULES 26 and 30): bookkeeping of transfers between members made
 * outside the app. They move contribution balances only; they are never spend. Any member records
 * them (ADR-005); they are soft-deleted and audited like expenses (ADR-008). There is no edit:
 * a wrong settlement is deleted and recorded again.
 */
@Injectable()
export class SettlementsService {
  constructor(
    private readonly settlements: SettlementsRepository,
    private readonly directory: HouseholdDirectory,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditRecorder,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async list(
    member: MemberContext,
    query: { from?: string; to?: string; deleted?: 'only' },
  ): Promise<SettlementView[]> {
    const rows = await this.settlements.list(
      member.householdId,
      { ...(query.from ? { from: query.from } : {}), ...(query.to ? { to: query.to } : {}) },
      query.deleted === 'only' ? 'only' : 'exclude',
      LIST_LIMIT,
    );
    return rows.map(toSettlementView);
  }

  async create(
    actor: Actor,
    member: MemberContext,
    input: SettlementInput,
  ): Promise<SettlementView> {
    if (input.fromMemberId === input.toMemberId) {
      throw validationFailed([
        { field: 'toMemberId', constraints: ['must be different from fromMemberId'] },
      ]);
    }
    const id = this.ids.next();
    await this.uow.run(async (tx) => {
      // Former members are allowed: settling up after someone leaves is the typical case.
      const memberIds = new Set(
        (await this.directory.members(member.householdId, tx)).map((m) => m.id),
      );
      for (const field of ['fromMemberId', 'toMemberId'] as const) {
        if (!memberIds.has(input[field])) {
          throw validationFailed([{ field, constraints: ['must be a member of the household'] }]);
        }
      }
      const trimmed = input.notes?.trim() ?? '';
      await this.settlements.insert(tx, {
        id,
        householdId: member.householdId,
        fromMemberId: input.fromMemberId,
        toMemberId: input.toMemberId,
        amountCents: input.amountCents,
        date: input.date,
        notes: trimmed.length > 0 ? trimmed : null,
        createdByMemberId: member.memberId,
      });
      const created = await this.settlements.find(member.householdId, id, { tx });
      await this.audit.record(tx, actor, {
        householdId: member.householdId,
        entityType: ENTITY_TYPE,
        entityId: id,
        action: 'CREATE',
        after: created ? snapshot(created) : null,
      });
    });
    return this.get(member, id);
  }

  /** Soft delete; idempotent. */
  async remove(actor: Actor, member: MemberContext, id: string): Promise<void> {
    await this.setDeleted(actor, member, id, true);
  }

  async restore(actor: Actor, member: MemberContext, id: string): Promise<SettlementView> {
    await this.setDeleted(actor, member, id, false);
    return this.get(member, id);
  }

  private async get(member: MemberContext, id: string): Promise<SettlementView> {
    const record = await this.settlements.find(member.householdId, id);
    if (!record) {
      throw notFound();
    }
    return toSettlementView(record);
  }

  private async setDeleted(
    actor: Actor,
    member: MemberContext,
    id: string,
    deleted: boolean,
  ): Promise<void> {
    await this.uow.run(async (tx) => {
      const current = await this.settlements.find(member.householdId, id, { tx, lock: true });
      if (!current) {
        throw notFound();
      }
      if ((current.deletedAt !== null) === deleted) {
        return;
      }
      const deletedAt = deleted ? this.clock.now() : null;
      const deletedBy = deleted ? member.memberId : null;
      await this.settlements.setDeleted(tx, id, deletedAt, deletedBy);
      await this.audit.record(tx, actor, {
        householdId: member.householdId,
        entityType: ENTITY_TYPE,
        entityId: id,
        action: deleted ? 'DELETE' : 'RESTORE',
        before: snapshot(current),
        after: snapshot({ ...current, deletedAt, deletedByMemberId: deletedBy }),
      });
    });
  }
}
