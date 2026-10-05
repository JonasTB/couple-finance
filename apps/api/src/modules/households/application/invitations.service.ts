import { Injectable } from '@nestjs/common';
import {
  type AcceptedInvitation,
  type CreatedInvitation,
  type HouseholdInvitationView,
  type InvitationPreview,
} from '@couple-finance/shared';
import { type Actor } from '../../../common/auth/current-actor.decorator';
import { generateOpaqueToken, hashOpaqueToken } from '../../../common/crypto/opaque-token';
import { UnitOfWork } from '../../../common/database/unit-of-work';
import { IdGenerator } from '../../../common/ids/id-generator';
import { Clock } from '../../../common/time/clock';
import { AuditRecorder } from '../../audit/public';
import { UsersService } from '../../users/public';
import {
  effectiveInvitationStatus,
  INVITATION_TTL_MS,
  maskEmail,
} from '../domain/invitation-policy';
import { hasCapacityForInvitation, hasCapacityToJoin } from '../domain/membership-policy';
import {
  alreadyMember,
  householdFull,
  householdNotFound,
  invalidField,
  invitationEmailMismatch,
  invitationInvalid,
  notFound,
} from './errors';
import { type InvitationRecord, HouseholdsRepository } from './households.repository';
import { type MemberContext } from './member-context';
import { MembersService } from './members.service';
import { invitationSnapshot, memberSnapshot } from './snapshots';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly households: HouseholdsRepository,
    private readonly members: MembersService,
    private readonly users: UsersService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditRecorder,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  private toView(invitation: InvitationRecord): HouseholdInvitationView {
    const status = effectiveInvitationStatus(invitation, this.clock.now());
    return {
      id: invitation.id,
      email: invitation.email,
      status: status === 'EXPIRED' ? 'EXPIRED' : 'PENDING',
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    };
  }

  async list(context: MemberContext): Promise<HouseholdInvitationView[]> {
    const invitations = await this.households.listPendingInvitations(context.householdId);
    return invitations.map((invitation) => this.toView(invitation));
  }

  /**
   * Creates (or re-sends) an invitation. Re-inviting an email replaces its pending invitation,
   * because the raw token is shown only once (FR-HH-03).
   */
  async create(actor: Actor, context: MemberContext, email: string): Promise<CreatedInvitation> {
    const token = generateOpaqueToken();
    const now = this.clock.now();
    const id = this.ids.next();

    await this.uow.run(async (tx) => {
      if (!(await this.households.lockHousehold(tx, context.householdId))) {
        throw householdNotFound();
      }
      const active = await this.households.listActiveMembers(context.householdId, tx);
      const profiles = await this.users.findProfiles(active.map((member) => member.userId));
      const memberEmails = [...profiles.values()].map((profile) => profile.email.toLowerCase());
      if (memberEmails.includes(email)) {
        const isSelf = profiles.get(actor.userId)?.email.toLowerCase() === email;
        if (isSelf) {
          throw invalidField('email', 'you cannot invite yourself');
        }
        throw alreadyMember();
      }

      const pending = await this.households.listPendingInvitations(context.householdId, tx);
      const otherValidPending = pending.filter(
        (invitation) =>
          invitation.email.toLowerCase() !== email &&
          effectiveInvitationStatus(invitation, now) === 'PENDING',
      ).length;
      if (!hasCapacityForInvitation(active.length, otherValidPending)) {
        throw householdFull();
      }

      for (const previous of pending.filter(
        (invitation) => invitation.email.toLowerCase() === email,
      )) {
        await this.households.updateInvitation(tx, previous.id, {
          status: 'REVOKED',
          revokedAt: now,
        });
        await this.audit.record(tx, actor, {
          householdId: context.householdId,
          entityType: 'HOUSEHOLD_INVITATION',
          entityId: previous.id,
          action: 'UPDATE',
          before: invitationSnapshot(previous),
          after: invitationSnapshot({ ...previous, status: 'REVOKED', revokedAt: now }),
        });
      }

      const invitation = {
        id,
        householdId: context.householdId,
        email,
        tokenHash: hashOpaqueToken(token),
        invitedByMemberId: context.memberId,
        status: 'PENDING' as const,
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
        acceptedByUserId: null,
        acceptedAt: null,
        revokedAt: null,
      };
      await this.households.insertInvitation(tx, invitation);
      await this.audit.record(tx, actor, {
        householdId: context.householdId,
        entityType: 'HOUSEHOLD_INVITATION',
        entityId: id,
        action: 'CREATE',
        after: invitationSnapshot({ ...invitation, createdAt: now }),
      });
    });

    const created = await this.households.findInvitationByTokenHash(hashOpaqueToken(token));
    if (!created) {
      throw invitationInvalid();
    }
    return { invitation: this.toView(created), token };
  }

  async revoke(actor: Actor, context: MemberContext, invitationId: string): Promise<void> {
    await this.uow.run(async (tx) => {
      if (!(await this.households.lockHousehold(tx, context.householdId))) {
        throw householdNotFound();
      }
      const invitation = await this.households.findInvitation(
        tx,
        context.householdId,
        invitationId,
      );
      if (invitation?.status !== 'PENDING') {
        throw notFound('Invitation');
      }
      const revokedAt = this.clock.now();
      await this.households.updateInvitation(tx, invitation.id, { status: 'REVOKED', revokedAt });
      await this.audit.record(tx, actor, {
        householdId: context.householdId,
        entityType: 'HOUSEHOLD_INVITATION',
        entityId: invitation.id,
        action: 'UPDATE',
        before: invitationSnapshot(invitation),
        after: invitationSnapshot({ ...invitation, status: 'REVOKED', revokedAt }),
      });
    });
  }

  /** Public: whoever holds the token may see who invited them and where (FR-HH-04). */
  async preview(token: string): Promise<InvitationPreview> {
    const invitation = await this.households.findInvitationByTokenHash(hashOpaqueToken(token));
    if (!invitation || effectiveInvitationStatus(invitation, this.clock.now()) !== 'PENDING') {
      throw invitationInvalid();
    }
    const household = await this.households.findHousehold(invitation.householdId);
    if (!household) {
      throw invitationInvalid();
    }
    const inviterMember = (await this.households.listActiveMembers(household.id)).find(
      (member) => member.id === invitation.invitedByMemberId,
    );
    const inviter = inviterMember
      ? (await this.users.findProfiles([inviterMember.userId])).get(inviterMember.userId)
      : undefined;
    return {
      householdName: household.name,
      inviterDisplayName: inviter?.displayName ?? '',
      emailHint: maskEmail(invitation.email),
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async accept(actor: Actor, token: string): Promise<AcceptedInvitation> {
    return this.uow.run(async (tx) => {
      const tokenHash = hashOpaqueToken(token);
      const located = await this.households.findInvitationByTokenHash(tokenHash);
      if (!located) {
        throw invitationInvalid();
      }
      // Lock order household → invitation, the same as `create` and `revoke`, to avoid deadlocks.
      const household = await this.households.lockHousehold(tx, located.householdId);
      const invitation = await this.households.findInvitationByTokenHash(tokenHash, tx);
      const now = this.clock.now();
      if (!invitation) {
        throw invitationInvalid();
      }
      if (!household || effectiveInvitationStatus(invitation, now) !== 'PENDING') {
        throw invitationInvalid();
      }
      const user = (await this.users.findProfiles([actor.userId])).get(actor.userId);
      if (user?.email.toLowerCase() !== invitation.email.toLowerCase()) {
        throw invitationEmailMismatch();
      }
      if (await this.households.findActiveMembership(actor.userId, household.id, tx)) {
        throw alreadyMember();
      }
      const active = await this.households.listActiveMembers(household.id, tx);
      if (!hasCapacityToJoin(active.length)) {
        throw householdFull();
      }

      const member = {
        id: this.ids.next(),
        householdId: household.id,
        userId: actor.userId,
        role: 'MEMBER' as const,
        status: 'ACTIVE' as const,
        incomeVisibility: 'RATIO_ONLY' as const,
        joinedAt: now,
        leftAt: null,
      };
      await this.households.insertMember(tx, member);
      await this.households.updateInvitation(tx, invitation.id, {
        status: 'ACCEPTED',
        acceptedByUserId: actor.userId,
        acceptedAt: now,
      });
      await this.audit.record(tx, actor, {
        householdId: household.id,
        entityType: 'HOUSEHOLD_MEMBER',
        entityId: member.id,
        action: 'CREATE',
        after: memberSnapshot(member),
      });
      await this.audit.record(tx, actor, {
        householdId: household.id,
        entityType: 'HOUSEHOLD_INVITATION',
        entityId: invitation.id,
        action: 'UPDATE',
        before: invitationSnapshot(invitation),
        after: invitationSnapshot({
          ...invitation,
          status: 'ACCEPTED',
          acceptedByUserId: actor.userId,
        }),
      });
      await this.members.reconcileSplit(tx, actor, household);
      return { householdId: household.id };
    });
  }
}
