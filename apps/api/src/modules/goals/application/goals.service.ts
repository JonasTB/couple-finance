import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AnalyticsGoal,
  ErrorCode,
  type GoalEntryInput,
  type GoalEntryView,
  type GoalInput,
  type GoalView,
} from '@couple-finance/shared';
import { type Actor } from '../../../common/auth/current-actor.decorator';
import { type TransactionContext, UnitOfWork } from '../../../common/database/unit-of-work';
import { AppException, validationFailed } from '../../../common/errors/app.exception';
import { IdGenerator } from '../../../common/ids/id-generator';
import { Clock } from '../../../common/time/clock';
import { localDateIn } from '../../../common/time/local-date';
import { AuditRecorder } from '../../audit/public';
import { HouseholdDirectory, type MemberContext } from '../../households/public';
import { goalProgress, savedAtMonthEnds, savedByMember, savedOf } from '../domain/goal';
import {
  type GoalChanges,
  type GoalEntryRecord,
  type GoalRecord,
  GoalsRepository,
} from './goals.repository';

const ENTITY_TYPE = 'GOAL';
const ENTRY_ENTITY_TYPE = 'GOAL_CONTRIBUTION';

export type GoalUpdate = Partial<GoalInput> & { version: number };

const notFound = (): AppException =>
  new AppException(ErrorCode.NOT_FOUND, 'Goal not found.', HttpStatus.NOT_FOUND);

const archived = (): AppException =>
  new AppException(ErrorCode.ARCHIVED, 'Restore the goal to change it.', HttpStatus.CONFLICT);

const insufficient = (): AppException =>
  new AppException(
    ErrorCode.GOAL_INSUFFICIENT_BALANCE,
    'The goal cannot hold a negative amount.',
    HttpStatus.UNPROCESSABLE_ENTITY,
  );

function snapshot(goal: GoalRecord): Record<string, unknown> {
  const { createdAt: _c, householdId: _h, ...rest } = goal;
  return { ...rest, archivedAt: goal.archivedAt?.toISOString() ?? null };
}

function toEntryView(entry: GoalEntryRecord): GoalEntryView {
  return {
    id: entry.id,
    memberId: entry.memberId,
    type: entry.type,
    amountCents: entry.amountCents,
    date: entry.date,
    notes: entry.notes,
    createdAt: entry.createdAt.toISOString(),
    deletedAt: entry.deletedAt?.toISOString() ?? null,
  };
}

/** Summary other modules read (purchase plans, FR-PP-04). */
export interface GoalSummary {
  id: string;
  name: string;
  savedCents: number;
  archived: boolean;
}

/**
 * Savings goals (FR-GOAL-01..03). Bookkeeping only (BUSINESS_RULES 26): contributions and
 * withdrawals record money each member set aside elsewhere. A goal never holds a negative amount,
 * entries cannot be dated in the future, and only participants make entries.
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly goals: GoalsRepository,
    private readonly directory: HouseholdDirectory,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditRecorder,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  private async timezone(householdId: string): Promise<string> {
    const household = await this.directory.household(householdId);
    if (!household) {
      throw notFound();
    }
    return household.timezone;
  }

  private toView(
    goal: GoalRecord,
    entries: readonly GoalEntryRecord[],
    timezone: string,
    withEntries: boolean,
  ): GoalView {
    const live = entries.filter((e) => e.deletedAt === null);
    const progress = goalProgress({
      entries: live,
      targetCents: goal.targetAmountCents,
      targetDate: goal.targetDate,
      createdMonth: localDateIn(timezone, goal.createdAt).slice(0, 7),
      today: localDateIn(timezone, this.clock.now()),
      archived: goal.archivedAt !== null,
    });
    return {
      id: goal.id,
      name: goal.name,
      targetAmountCents: goal.targetAmountCents,
      targetDate: goal.targetDate,
      participantMemberIds: goal.participantMemberIds,
      status: progress.status,
      savedCents: progress.savedCents,
      remainingCents: progress.remainingCents,
      progressBps: progress.progressBps,
      byMember: savedByMember(live, goal.participantMemberIds),
      forecast: progress.forecast,
      version: goal.version,
      createdAt: goal.createdAt.toISOString(),
      archivedAt: goal.archivedAt?.toISOString() ?? null,
      ...(withEntries ? { entries: [...entries].reverse().map(toEntryView) } : {}),
    };
  }

  private async assertParticipants(householdId: string, ids: readonly string[]): Promise<void> {
    const active = new Set(
      (await this.directory.members(householdId))
        .filter((m) => m.status === 'ACTIVE')
        .map((m) => m.id),
    );
    if (ids.length === 0 || new Set(ids).size !== ids.length || ids.some((id) => !active.has(id))) {
      throw validationFailed([
        {
          field: 'participantMemberIds',
          constraints: ['one or more distinct active members'],
        },
      ]);
    }
  }

  // --- queries -----------------------------------------------------------------------------------

  async list(member: MemberContext): Promise<GoalView[]> {
    const [goals, timezone] = await Promise.all([
      this.goals.list(member.householdId),
      this.timezone(member.householdId),
    ]);
    const entries = await this.goals.entries(goals.map((g) => g.id));
    return goals.map((goal) =>
      this.toView(
        goal,
        entries.filter((e) => e.goalId === goal.id),
        timezone,
        false,
      ),
    );
  }

  async get(member: MemberContext, id: string): Promise<GoalView> {
    const goal = await this.goals.find(member.householdId, id);
    if (!goal) {
      throw notFound();
    }
    const entries = await this.goals.entries([id], { withDeleted: true });
    return this.toView(goal, entries, await this.timezone(member.householdId), true);
  }

  /** Public read for purchase plans. */
  async summaries(householdId: string, ids: readonly string[]): Promise<Map<string, GoalSummary>> {
    const goals = await this.goals.list(householdId, ids);
    const entries = await this.goals.entries(goals.map((g) => g.id));
    return new Map(
      goals.map((goal) => [
        goal.id,
        {
          id: goal.id,
          name: goal.name,
          savedCents: savedOf(entries.filter((e) => e.goalId === goal.id)),
          archived: goal.archivedAt !== null,
        },
      ]),
    );
  }

  /**
   * Goal evolution for analytics (FR-AN-03): saved at the end of each month, null before the goal
   * existed. Archived goals are left out.
   */
  async evolution(householdId: string, months: readonly string[]): Promise<AnalyticsGoal[]> {
    const [goals, timezone] = await Promise.all([
      this.goals.list(householdId),
      this.timezone(householdId),
    ]);
    const live = goals.filter((goal) => goal.archivedAt === null);
    const entries = await this.goals.entries(live.map((g) => g.id));
    return live.map((goal) => {
      const own = entries.filter((e) => e.goalId === goal.id);
      const createdMonth = localDateIn(timezone, goal.createdAt).slice(0, 7);
      const saved = savedAtMonthEnds(own, months);
      return {
        goalId: goal.id,
        name: goal.name,
        targetAmountCents: goal.targetAmountCents,
        status: savedOf(own) >= goal.targetAmountCents ? 'ACHIEVED' : 'ACTIVE',
        savedCents: months.map((month, i) => (month < createdMonth ? null : (saved[i] ?? 0))),
      };
    });
  }

  // --- goal commands -----------------------------------------------------------------------------

  async create(actor: Actor, member: MemberContext, input: GoalInput): Promise<GoalView> {
    await this.assertParticipants(member.householdId, input.participantMemberIds);
    const id = this.ids.next();
    await this.uow.run(async (tx) => {
      await this.goals.insert(tx, {
        id,
        householdId: member.householdId,
        name: input.name,
        targetAmountCents: input.targetAmountCents,
        targetDate: input.targetDate ?? null,
        participantMemberIds: input.participantMemberIds,
        createdByMemberId: member.memberId,
        createdAt: this.clock.now(),
      });
      const created = await this.goals.find(member.householdId, id, { tx });
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

  async update(
    actor: Actor,
    member: MemberContext,
    id: string,
    input: GoalUpdate,
  ): Promise<GoalView> {
    if (input.participantMemberIds) {
      await this.assertParticipants(member.householdId, input.participantMemberIds);
    }
    await this.mutate(actor, member, id, input.version, (goal) => {
      if (goal.archivedAt) {
        throw archived();
      }
      return {
        name: input.name ?? goal.name,
        targetAmountCents: input.targetAmountCents ?? goal.targetAmountCents,
        targetDate: input.targetDate !== undefined ? input.targetDate : goal.targetDate,
        participantMemberIds: input.participantMemberIds ?? goal.participantMemberIds,
        archivedAt: goal.archivedAt,
      };
    });
    return this.get(member, id);
  }

  async setArchived(
    actor: Actor,
    member: MemberContext,
    id: string,
    archive: boolean,
  ): Promise<GoalView> {
    await this.mutate(actor, member, id, null, (goal) =>
      (goal.archivedAt !== null) === archive
        ? null
        : { ...goal, archivedAt: archive ? this.clock.now() : null },
    );
    return this.get(member, id);
  }

  private async mutate(
    actor: Actor,
    member: MemberContext,
    id: string,
    expectedVersion: number | null,
    change: (goal: GoalRecord) => GoalChanges | null,
  ): Promise<void> {
    await this.uow.run(async (tx) => {
      const goal = await this.goals.find(member.householdId, id, { tx, lock: true });
      if (!goal) {
        throw notFound();
      }
      if (expectedVersion !== null && goal.version !== expectedVersion) {
        throw new AppException(
          ErrorCode.VERSION_CONFLICT,
          'The goal changed since it was loaded. Reload and try again.',
          HttpStatus.CONFLICT,
        );
      }
      const changes = change(goal);
      if (!changes) return;
      const next: GoalChanges = {
        name: changes.name,
        targetAmountCents: changes.targetAmountCents,
        targetDate: changes.targetDate,
        participantMemberIds: changes.participantMemberIds,
        archivedAt: changes.archivedAt,
      };
      if (!(await this.goals.update(tx, id, goal.version, next))) {
        throw new AppException(
          ErrorCode.VERSION_CONFLICT,
          'Concurrent change.',
          HttpStatus.CONFLICT,
        );
      }
      const saved = await this.goals.find(member.householdId, id, { tx });
      await this.audit.record(tx, actor, {
        householdId: member.householdId,
        entityType: ENTITY_TYPE,
        entityId: id,
        action: 'UPDATE',
        before: snapshot(goal),
        after: saved ? snapshot(saved) : null,
      });
    });
  }

  // --- entries -----------------------------------------------------------------------------------

  /** Lock the goal, check it is open, run `work` with its live entries (serializes balances). */
  private async withGoal<T>(
    member: MemberContext,
    id: string,
    work: (goal: GoalRecord, entries: GoalEntryRecord[], tx: TransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.uow.run(async (tx) => {
      const goal = await this.goals.find(member.householdId, id, { tx, lock: true });
      if (!goal) {
        throw notFound();
      }
      if (goal.archivedAt) {
        throw archived();
      }
      const entries = await this.goals.entries([id], { tx, withDeleted: true });
      return work(goal, entries, tx);
    });
  }

  async addEntry(
    actor: Actor,
    member: MemberContext,
    id: string,
    input: GoalEntryInput,
  ): Promise<GoalView> {
    const today = localDateIn(await this.timezone(member.householdId), this.clock.now());
    if (input.date > today) {
      throw validationFailed([{ field: 'date', constraints: ['cannot be in the future'] }]);
    }
    await this.withGoal(member, id, async (goal, entries, tx) => {
      if (!goal.participantMemberIds.includes(input.memberId)) {
        throw validationFailed([
          { field: 'memberId', constraints: ['must be a participant of the goal'] },
        ]);
      }
      const live = entries.filter((e) => e.deletedAt === null);
      if (input.type === 'WITHDRAWAL' && savedOf(live) - input.amountCents < 0) {
        throw insufficient();
      }
      const entryId = this.ids.next();
      const notes = input.notes?.trim() ? input.notes.trim() : null;
      await this.goals.insertEntry(tx, {
        id: entryId,
        goalId: id,
        memberId: input.memberId,
        type: input.type,
        amountCents: input.amountCents,
        date: input.date,
        notes,
        createdByMemberId: member.memberId,
      });
      await this.audit.record(tx, actor, {
        householdId: member.householdId,
        entityType: ENTRY_ENTITY_TYPE,
        entityId: entryId,
        action: 'CREATE',
        after: { goalId: id, ...input, notes },
      });
    });
    return this.get(member, id);
  }

  /** Soft delete or restore an entry; the goal's amount may never become negative. */
  async setEntryDeleted(
    actor: Actor,
    member: MemberContext,
    id: string,
    entryId: string,
    deleted: boolean,
  ): Promise<GoalView> {
    await this.withGoal(member, id, async (_goal, entries, tx) => {
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) {
        throw new AppException(ErrorCode.NOT_FOUND, 'Entry not found.', HttpStatus.NOT_FOUND);
      }
      if ((entry.deletedAt !== null) === deleted) return;
      const after = entries.filter((e) => (e.id === entryId ? !deleted : e.deletedAt === null));
      if (savedOf(after) < 0) {
        throw insufficient();
      }
      const now = this.clock.now();
      await this.goals.setEntryDeleted(
        tx,
        entryId,
        deleted ? now : null,
        deleted ? member.memberId : null,
      );
      await this.audit.record(tx, actor, {
        householdId: member.householdId,
        entityType: ENTRY_ENTITY_TYPE,
        entityId: entryId,
        action: deleted ? 'DELETE' : 'RESTORE',
        before: { ...toEntryView(entry) },
      });
    });
    return this.get(member, id);
  }
}
