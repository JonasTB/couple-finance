import { Injectable } from '@nestjs/common';
import { type HouseholdMemberView, type IncomeVisibility } from '@couple-finance/shared';
import { type Actor } from '../../../common/auth/current-actor.decorator';
import { type TransactionContext, UnitOfWork } from '../../../common/database/unit-of-work';
import { Clock } from '../../../common/time/clock';
import { AuditRecorder } from '../../audit/public';
import { UsersService } from '../../users/public';
import { reconcileDefaultSplit } from '../domain/default-split';
import { planLeave } from '../domain/membership-policy';
import { householdNotFound, invalidField, notFound, ownershipTransferRequired } from './errors';
import { HouseholdsService } from './households.service';
import {
  type HouseholdRecord,
  type MemberRecord,
  HouseholdsRepository,
} from './households.repository';
import { type MemberContext } from './member-context';
import { householdSnapshot, memberSnapshot } from './snapshots';

@Injectable()
export class MembersService {
  constructor(
    private readonly households: HouseholdsRepository,
    private readonly householdsService: HouseholdsService,
    private readonly users: UsersService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  /** Active members in stable member order, with profile data for display. */
  async list(context: MemberContext): Promise<HouseholdMemberView[]> {
    const members = await this.households.listActiveMembers(context.householdId);
    const profiles = await this.users.findProfiles(members.map((member) => member.userId));
    return members.map((member) => {
      const profile = profiles.get(member.userId);
      return {
        id: member.id,
        displayName: profile?.displayName ?? 'Ex-membro',
        email: profile?.email ?? '',
        role: member.role,
        status: member.status,
        incomeVisibility: member.incomeVisibility,
        joinedAt: member.joinedAt.toISOString(),
        isMe: member.id === context.memberId,
      };
    });
  }

  /** FR-INC-03: each member decides, explicitly, whether partners see exact income values. */
  async setIncomeVisibility(
    actor: Actor,
    context: MemberContext,
    incomeVisibility: IncomeVisibility,
  ): Promise<void> {
    await this.uow.run(async (tx) => {
      const me = await this.households.findMember(tx, context.householdId, context.memberId);
      if (me?.status !== 'ACTIVE') {
        throw householdNotFound();
      }
      if (me.incomeVisibility === incomeVisibility) {
        return;
      }
      await this.households.updateMember(tx, me.id, { incomeVisibility });
      await this.audit.record(tx, actor, {
        householdId: context.householdId,
        entityType: 'HOUSEHOLD_MEMBER',
        entityId: me.id,
        action: 'UPDATE',
        before: { ...memberSnapshot(me), incomeVisibility: me.incomeVisibility },
        after: { ...memberSnapshot(me), incomeVisibility },
      });
    });
  }

  async leave(actor: Actor, context: MemberContext): Promise<void> {
    await this.uow.run(async (tx) => {
      const household = await this.lock(tx, context.householdId);
      const active = await this.households.listActiveMembers(context.householdId, tx);
      const me = active.find((member) => member.id === context.memberId);
      if (!me) {
        throw householdNotFound();
      }
      const plan = planLeave(me.role, active.length);
      if (plan === 'TRANSFER_OWNERSHIP_FIRST') {
        throw ownershipTransferRequired();
      }
      await this.endMembership(tx, actor, me, 'LEFT');
      if (plan === 'LEAVE_AND_ARCHIVE') {
        await this.householdsService.archiveLocked(tx, actor, household);
      } else {
        await this.reconcileSplit(tx, actor, household);
      }
    });
  }

  async remove(actor: Actor, context: MemberContext, memberId: string): Promise<void> {
    if (memberId === context.memberId) {
      throw invalidField('memberId', 'use the leave endpoint to leave the household');
    }
    await this.uow.run(async (tx) => {
      const household = await this.lock(tx, context.householdId);
      const target = await this.households.findMember(tx, context.householdId, memberId);
      if (target?.status !== 'ACTIVE') {
        throw notFound('Member');
      }
      await this.endMembership(tx, actor, target, 'REMOVED');
      await this.reconcileSplit(tx, actor, household);
    });
  }

  async transferOwnership(actor: Actor, context: MemberContext, memberId: string): Promise<void> {
    if (memberId === context.memberId) {
      throw invalidField('memberId', 'you already own this household');
    }
    await this.uow.run(async (tx) => {
      await this.lock(tx, context.householdId);
      const target = await this.households.findMember(tx, context.householdId, memberId);
      const me = await this.households.findMember(tx, context.householdId, context.memberId);
      if (target?.status !== 'ACTIVE' || !me) {
        throw notFound('Member');
      }
      // Demote first: at most one active owner is enforced by a unique index.
      await this.households.updateMember(tx, me.id, { role: 'MEMBER' });
      await this.households.updateMember(tx, target.id, { role: 'OWNER' });
      for (const [before, role] of [
        [me, 'MEMBER'],
        [target, 'OWNER'],
      ] as const) {
        await this.audit.record(tx, actor, {
          householdId: context.householdId,
          entityType: 'HOUSEHOLD_MEMBER',
          entityId: before.id,
          action: 'UPDATE',
          before: memberSnapshot(before),
          after: memberSnapshot({ ...before, role }),
        });
      }
    });
  }

  private async lock(tx: TransactionContext, householdId: string): Promise<HouseholdRecord> {
    const household = await this.households.lockHousehold(tx, householdId);
    if (!household) {
      throw householdNotFound();
    }
    return household;
  }

  private async endMembership(
    tx: TransactionContext,
    actor: Actor,
    member: MemberRecord,
    status: 'LEFT' | 'REMOVED',
  ): Promise<void> {
    const leftAt = this.clock.now();
    await this.households.updateMember(tx, member.id, { status, leftAt });
    await this.audit.record(tx, actor, {
      householdId: member.householdId,
      entityType: 'HOUSEHOLD_MEMBER',
      entityId: member.id,
      action: 'UPDATE',
      before: memberSnapshot(member),
      after: memberSnapshot({ ...member, status, leftAt }),
    });
  }

  /** Custom default weights that no longer match the members fall back to EQUAL (audited). */
  async reconcileSplit(
    tx: TransactionContext,
    actor: Actor,
    household: HouseholdRecord,
  ): Promise<void> {
    const activeIds = (await this.households.listActiveMembers(household.id, tx)).map((m) => m.id);
    const reconciled = reconcileDefaultSplit(household.defaultSplit, activeIds);
    if (reconciled === household.defaultSplit) {
      return;
    }
    await this.households.updateHousehold(tx, household.id, household.version, {
      defaultSplit: reconciled,
    });
    await this.audit.record(tx, actor, {
      householdId: household.id,
      entityType: 'HOUSEHOLD',
      entityId: household.id,
      action: 'UPDATE',
      before: householdSnapshot(household),
      after: householdSnapshot({
        ...household,
        defaultSplit: reconciled,
        version: household.version + 1,
      }),
    });
  }
}
