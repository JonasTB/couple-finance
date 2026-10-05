import { Injectable } from '@nestjs/common';
import {
  type CurrencyCode,
  type DefaultSplitRule,
  type HouseholdDetail,
  type HouseholdSummary,
} from '@couple-finance/shared';
import { type Actor } from '../../../common/auth/current-actor.decorator';
import { type TransactionContext, UnitOfWork } from '../../../common/database/unit-of-work';
import { DomainEvents } from '../../../common/events/domain-events';
import { IdGenerator } from '../../../common/ids/id-generator';
import { Clock } from '../../../common/time/clock';
import { isValidTimeZone } from '../../../common/time/local-date';
import { AuditRecorder } from '../../audit/public';
import { validateDefaultSplit } from '../domain/default-split';
import { householdNotFound, invalidField, versionConflict } from './errors';
import {
  type HouseholdPatch,
  type HouseholdRecord,
  HouseholdsRepository,
} from './households.repository';
import { type MemberContext } from './member-context';
import { householdSnapshot, memberSnapshot } from './snapshots';

export interface CreateHouseholdInput {
  name: string;
  currency: CurrencyCode;
  timezone: string;
  /** Defaults to EQUAL. */
  defaultSplit?: DefaultSplitRule;
}

export interface UpdateHouseholdInput {
  version: number;
  name?: string;
  timezone?: string;
  defaultSplit?: DefaultSplitRule;
}

function toDetail(
  household: HouseholdRecord,
  context: Pick<MemberContext, 'memberId' | 'role'>,
): HouseholdDetail {
  return {
    id: household.id,
    name: household.name,
    currency: household.currency,
    timezone: household.timezone,
    defaultSplit: household.defaultSplit,
    version: household.version,
    createdAt: household.createdAt.toISOString(),
    me: { memberId: context.memberId, role: context.role },
  };
}

function assertTimeZone(timezone: string): void {
  if (!isValidTimeZone(timezone)) {
    throw invalidField('timezone', 'timezone must be a valid IANA time zone');
  }
}

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly households: HouseholdsRepository,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditRecorder,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEvents,
  ) {}

  async create(actor: Actor, input: CreateHouseholdInput): Promise<HouseholdDetail> {
    assertTimeZone(input.timezone);
    const householdId = this.ids.next();
    const memberId = this.ids.next();
    // The creator is the only member, so CUSTOM_PERCENT would have to be 100% to them.
    const defaultSplit = input.defaultSplit ?? { type: 'EQUAL' };
    const violations = validateDefaultSplit(defaultSplit, [memberId]);
    if (defaultSplit.type === 'CUSTOM_PERCENT' || violations.length > 0) {
      throw invalidField(
        'defaultSplit',
        'defaultSplit must be EQUAL or INCOME_PROPORTIONAL when creating a household',
      );
    }

    await this.uow.run(async (tx) => {
      await this.households.insertHousehold(tx, {
        id: householdId,
        name: input.name,
        currency: input.currency,
        timezone: input.timezone,
        defaultSplit: { type: defaultSplit.type },
        version: 1,
      });
      const member = {
        id: memberId,
        householdId,
        userId: actor.userId,
        role: 'OWNER' as const,
        status: 'ACTIVE' as const,
        incomeVisibility: 'RATIO_ONLY' as const,
        joinedAt: this.clock.now(),
        leftAt: null,
      };
      await this.households.insertMember(tx, member);
      const created = await this.households.lockHousehold(tx, householdId);
      await this.audit.record(tx, actor, {
        householdId,
        entityType: 'HOUSEHOLD',
        entityId: householdId,
        action: 'CREATE',
        after: created ? householdSnapshot(created) : null,
      });
      await this.audit.record(tx, actor, {
        householdId,
        entityType: 'HOUSEHOLD_MEMBER',
        entityId: memberId,
        action: 'CREATE',
        after: memberSnapshot(member),
      });
      // e.g. categories seeds its defaults inside this same transaction.
      await this.events.publish(tx, actor, 'household.created', { householdId });
    });

    return this.get({ householdId, memberId, userId: actor.userId, role: 'OWNER' });
  }

  async listForUser(userId: string): Promise<HouseholdSummary[]> {
    const memberships = await this.households.listMembershipsOfUser(userId);
    return memberships.map(({ household, member, activeMemberCount }) => ({
      id: household.id,
      name: household.name,
      currency: household.currency,
      timezone: household.timezone,
      role: member.role,
      activeMemberCount,
    }));
  }

  async get(context: MemberContext): Promise<HouseholdDetail> {
    const household = await this.households.findHousehold(context.householdId);
    if (!household) {
      throw householdNotFound();
    }
    return toDetail(household, context);
  }

  async update(
    actor: Actor,
    context: MemberContext,
    input: UpdateHouseholdInput,
  ): Promise<HouseholdDetail> {
    if (input.timezone !== undefined) {
      assertTimeZone(input.timezone);
    }
    await this.uow.run(async (tx) => {
      const before = await this.households.lockHousehold(tx, context.householdId);
      if (!before) {
        throw householdNotFound();
      }
      if (before.version !== input.version) {
        throw versionConflict();
      }
      if (input.defaultSplit !== undefined) {
        const activeIds = (await this.households.listActiveMembers(context.householdId, tx)).map(
          (member) => member.id,
        );
        const violations = validateDefaultSplit(input.defaultSplit, activeIds);
        if (violations.length > 0) {
          throw invalidField('defaultSplit', ...violations);
        }
      }
      const patch: HouseholdPatch = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.defaultSplit !== undefined ? { defaultSplit: input.defaultSplit } : {}),
      };
      if (!(await this.households.updateHousehold(tx, context.householdId, input.version, patch))) {
        throw versionConflict();
      }
      const after = await this.households.lockHousehold(tx, context.householdId);
      await this.audit.record(tx, actor, {
        householdId: context.householdId,
        entityType: 'HOUSEHOLD',
        entityId: context.householdId,
        action: 'UPDATE',
        before: householdSnapshot(before),
        after: after ? householdSnapshot(after) : null,
      });
    });
    return this.get(context);
  }

  async archive(actor: Actor, context: MemberContext): Promise<void> {
    await this.uow.run(async (tx) => {
      const household = await this.households.lockHousehold(tx, context.householdId);
      if (!household) {
        throw householdNotFound();
      }
      await this.archiveLocked(tx, actor, household);
    });
  }

  /** Archives a household whose row is already locked by the caller (FR-HH-09). */
  async archiveLocked(
    tx: TransactionContext,
    actor: Actor,
    household: HouseholdRecord,
  ): Promise<void> {
    const now = this.clock.now();
    for (const invitation of await this.households.listPendingInvitations(household.id, tx)) {
      await this.households.updateInvitation(tx, invitation.id, {
        status: 'REVOKED',
        revokedAt: now,
      });
    }
    await this.households.updateHousehold(tx, household.id, household.version, { archivedAt: now });
    await this.audit.record(tx, actor, {
      householdId: household.id,
      entityType: 'HOUSEHOLD',
      entityId: household.id,
      action: 'DELETE',
      before: householdSnapshot(household),
      after: { ...householdSnapshot(household), archivedAt: now.toISOString() },
    });
  }
}
