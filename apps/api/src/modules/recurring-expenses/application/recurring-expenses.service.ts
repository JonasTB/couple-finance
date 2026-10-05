import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type ConfirmOccurrenceInput,
  ErrorCode,
  type OccurrenceView,
  PROJECTION_MAX_MONTHS,
  type RecurringExpenseInput,
  type RecurringExpenseView,
} from '@couple-finance/shared';
import { type Actor } from '../../../common/auth/current-actor.decorator';
import { type TransactionContext, UnitOfWork } from '../../../common/database/unit-of-work';
import { AppException, validationFailed } from '../../../common/errors/app.exception';
import { IdGenerator } from '../../../common/ids/id-generator';
import { Clock } from '../../../common/time/clock';
import { localDateIn, monthsBetween } from '../../../common/time/local-date';
import { AuditRecorder } from '../../audit/public';
import { CategoriesService } from '../../categories/public';
import { HouseholdDirectory, type MemberContext } from '../../households/public';
import { type ConfirmationEntry, LedgerQuery, TransactionWriter } from '../../transactions/public';
import {
  type Confirmation,
  isPaused,
  isScheduled,
  nextOpenOccurrence,
  occurrencesBetween,
  pause,
  type RecurrenceRule,
  RecurrenceError,
  resume,
  statusOf,
} from '../domain/recurrence';
import {
  type RecurringExpenseChanges,
  type RecurringExpenseRecord,
  RecurringExpensesRepository,
} from './recurring-expenses.repository';

const ENTITY_TYPE = 'RECURRING_EXPENSE';
const SKIP_ENTITY_TYPE = 'RECURRING_OCCURRENCE';

export type RecurringExpenseUpdate = Partial<RecurringExpenseInput> & { version: number };

const notFound = (): AppException =>
  new AppException(ErrorCode.NOT_FOUND, 'Recurring expense not found.', HttpStatus.NOT_FOUND);

const notScheduled = (): AppException =>
  new AppException(
    ErrorCode.OCCURRENCE_NOT_SCHEDULED,
    'This date is not an open occurrence of the recurring expense.',
    HttpStatus.UNPROCESSABLE_ENTITY,
  );

function ruleOf(record: RecurringExpenseRecord): RecurrenceRule {
  return {
    frequency: record.frequency,
    interval: record.interval,
    startDate: record.startDate,
    endDate: record.endDate,
    pauses: record.pauses,
  };
}

function normalizeNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function snapshot(record: RecurringExpenseRecord): Record<string, unknown> {
  const { createdAt: _created, householdId: _household, ...rest } = record;
  return { ...rest, deletedAt: record.deletedAt?.toISOString() ?? null };
}

interface Handled {
  confirmations: Map<string, Confirmation>;
  skips: Set<string>;
}

/**
 * Recurring expenses (FR-REC-01..05, ADR-007). Templates project occurrences on read; a member
 * confirms one (→ an ordinary expense with origin, via TransactionWriter) or skips it.
 *
 * Edit semantics: template fields apply to every occurrence still open (overdue or upcoming);
 * confirmed expenses are edited one by one. The schedule (frequency, interval, start date) is
 * locked once any occurrence was confirmed or skipped, so recorded history never moves.
 */
@Injectable()
export class RecurringExpensesService {
  constructor(
    private readonly recurring: RecurringExpensesRepository,
    private readonly directory: HouseholdDirectory,
    private readonly categories: CategoriesService,
    private readonly ledger: LedgerQuery,
    private readonly writer: TransactionWriter,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditRecorder,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  private async today(householdId: string): Promise<string> {
    const household = await this.directory.household(householdId);
    if (!household) {
      throw notFound();
    }
    return localDateIn(household.timezone, this.clock.now());
  }

  private async handled(
    householdId: string,
    ids: readonly string[],
    tx?: TransactionContext,
  ): Promise<Map<string, Handled>> {
    const [confirmations, skips] = await Promise.all([
      this.ledger.confirmations(householdId, ids, tx),
      this.recurring.skips(ids, tx),
    ]);
    const byId = new Map<string, Handled>(
      ids.map((id) => [id, { confirmations: new Map(), skips: new Set() }]),
    );
    for (const row of confirmations) {
      byId.get(row.recurringExpenseId)?.confirmations.set(row.occurrenceDate, row);
    }
    for (const row of skips) {
      byId.get(row.recurringExpenseId)?.skips.add(row.occurrenceDate);
    }
    return byId;
  }

  private toView(record: RecurringExpenseRecord, today: string, handled: Handled | undefined) {
    const done = new Set([...(handled?.confirmations.keys() ?? []), ...(handled?.skips ?? [])]);
    const view: RecurringExpenseView = {
      id: record.id,
      description: record.description,
      categoryId: record.categoryId,
      expectedAmountCents: record.expectedAmountCents,
      amountType: record.amountType,
      frequency: record.frequency,
      interval: record.interval,
      startDate: record.startDate,
      endDate: record.endDate,
      payerMemberId: record.payerMemberId,
      paymentMethod: record.paymentMethod,
      split: record.splitRule,
      notes: record.notes,
      status: statusOf(ruleOf(record), today),
      pauses: record.pauses,
      scheduleLocked: done.size > 0,
      nextOccurrenceDate: nextOpenOccurrence(ruleOf(record), today, done),
      version: record.version,
      createdAt: record.createdAt.toISOString(),
      deletedAt: record.deletedAt?.toISOString() ?? null,
    };
    return view;
  }

  private async validate(householdId: string, input: RecurringExpenseInput): Promise<void> {
    const members = await this.directory.members(householdId);
    if (!members.some((m) => m.id === input.payerMemberId && m.status === 'ACTIVE')) {
      throw validationFailed([
        { field: 'payerMemberId', constraints: ['payer must be an active member'] },
      ]);
    }
    if (input.endDate && input.endDate < input.startDate) {
      throw validationFailed([
        { field: 'endDate', constraints: ['must be on or after startDate'] },
      ]);
    }
    await this.categories.assertUsable(householdId, input.categoryId);
    if (input.split) {
      await this.writer.assertSplitRule(householdId, input.split);
    }
  }

  // --- queries -----------------------------------------------------------------------------------

  async list(member: MemberContext, deleted?: 'only'): Promise<RecurringExpenseView[]> {
    const records = await this.recurring.list(member.householdId, deleted ? 'only' : 'exclude');
    const today = await this.today(member.householdId);
    const handled = await this.handled(
      member.householdId,
      records.map((r) => r.id),
    );
    return records.map((record) => this.toView(record, today, handled.get(record.id)));
  }

  async get(member: MemberContext, id: string): Promise<RecurringExpenseView> {
    const record = await this.recurring.find(member.householdId, id);
    if (!record) {
      throw notFound();
    }
    const handled = await this.handled(member.householdId, [id]);
    return this.toView(record, await this.today(member.householdId), handled.get(id));
  }

  /** Occurrences of every live template in [from, to] (≤ 24 months), by date (FR-REC-02/05). */
  async occurrences(member: MemberContext, from: string, to: string): Promise<OccurrenceView[]> {
    if (from > to) {
      throw validationFailed([{ field: 'to', constraints: ['must be on or after from'] }]);
    }
    if (monthsBetween(from, to) >= PROJECTION_MAX_MONTHS) {
      throw validationFailed([
        {
          field: 'to',
          constraints: [`window must be under ${String(PROJECTION_MAX_MONTHS)} months`],
        },
      ]);
    }
    const records = await this.recurring.list(member.householdId, 'exclude');
    const today = await this.today(member.householdId);
    const handled = await this.handled(
      member.householdId,
      records.map((r) => r.id),
    );
    return records
      .flatMap((record) => {
        const own = handled.get(record.id);
        return occurrencesBetween(
          ruleOf(record),
          from,
          to,
          today,
          own?.confirmations ?? new Map(),
          own?.skips ?? new Set(),
        ).map((occurrence) => ({
          recurringExpenseId: record.id,
          occurrenceDate: occurrence.date,
          status: occurrence.status,
          description: record.description,
          categoryId: record.categoryId,
          expectedAmountCents: record.expectedAmountCents,
          amountType: record.amountType,
          transactionId: occurrence.transactionId,
          amountCents: occurrence.amountCents,
        }));
      })
      .sort(
        (a, b) =>
          a.occurrenceDate.localeCompare(b.occurrenceDate) ||
          a.description.localeCompare(b.description, 'pt-BR') ||
          a.recurringExpenseId.localeCompare(b.recurringExpenseId),
      );
  }

  // --- template commands -------------------------------------------------------------------------

  async create(
    actor: Actor,
    member: MemberContext,
    input: RecurringExpenseInput,
  ): Promise<RecurringExpenseView> {
    await this.validate(member.householdId, input);
    const id = this.ids.next();
    await this.uow.run(async (tx) => {
      await this.recurring.insert(tx, {
        id,
        householdId: member.householdId,
        description: input.description,
        categoryId: input.categoryId,
        expectedAmountCents: input.expectedAmountCents,
        amountType: input.amountType,
        frequency: input.frequency,
        interval: input.interval,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        payerMemberId: input.payerMemberId,
        paymentMethod: input.paymentMethod,
        splitRule: input.split ?? null,
        notes: normalizeNotes(input.notes),
        pauses: [],
        createdByMemberId: member.memberId,
      });
      const created = await this.recurring.find(member.householdId, id, { tx });
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
    input: RecurringExpenseUpdate,
  ): Promise<RecurringExpenseView> {
    await this.mutate(actor, member, id, input.version, async (current, tx) => {
      if (current.deletedAt) {
        throw notFound();
      }
      const next: RecurringExpenseInput = {
        description: input.description ?? current.description,
        categoryId: input.categoryId ?? current.categoryId,
        expectedAmountCents: input.expectedAmountCents ?? current.expectedAmountCents,
        amountType: input.amountType ?? current.amountType,
        frequency: input.frequency ?? current.frequency,
        interval: input.interval ?? current.interval,
        startDate: input.startDate ?? current.startDate,
        endDate: input.endDate !== undefined ? input.endDate : current.endDate,
        payerMemberId: input.payerMemberId ?? current.payerMemberId,
        paymentMethod: input.paymentMethod ?? current.paymentMethod,
        split: input.split !== undefined ? input.split : current.splitRule,
        notes: input.notes !== undefined ? normalizeNotes(input.notes) : current.notes,
      };
      const scheduleChanged =
        next.frequency !== current.frequency ||
        next.interval !== current.interval ||
        next.startDate !== current.startDate;
      if (scheduleChanged) {
        const handled = (await this.handled(member.householdId, [id], tx)).get(id);
        if (handled && (handled.confirmations.size > 0 || handled.skips.size > 0)) {
          throw new AppException(
            ErrorCode.RECURRENCE_SCHEDULE_LOCKED,
            'The schedule cannot change after an occurrence was confirmed or skipped. End it and create a new one.',
            HttpStatus.CONFLICT,
          );
        }
      }
      await this.validate(member.householdId, next);
      return {
        ...this.changesOf(current),
        description: next.description,
        categoryId: next.categoryId,
        expectedAmountCents: next.expectedAmountCents,
        amountType: next.amountType,
        frequency: next.frequency,
        interval: next.interval,
        startDate: next.startDate,
        endDate: next.endDate ?? null,
        payerMemberId: next.payerMemberId,
        paymentMethod: next.paymentMethod,
        splitRule: next.split ?? null,
        notes: next.notes ?? null,
      };
    });
    return this.get(member, id);
  }

  async pause(actor: Actor, member: MemberContext, id: string): Promise<RecurringExpenseView> {
    const today = await this.today(member.householdId);
    await this.mutate(actor, member, id, null, (current) =>
      Promise.resolve({
        ...this.changesOf(current),
        pauses: this.rule(() => pause(ruleOf(current), today)),
      }),
    );
    return this.get(member, id);
  }

  async resume(actor: Actor, member: MemberContext, id: string): Promise<RecurringExpenseView> {
    const today = await this.today(member.householdId);
    await this.mutate(actor, member, id, null, (current) =>
      Promise.resolve({
        ...this.changesOf(current),
        pauses: this.rule(() => resume(ruleOf(current), today)),
      }),
    );
    return this.get(member, id);
  }

  /** Ends after `lastDate` (default today): later occurrences are no longer expected. */
  async end(
    actor: Actor,
    member: MemberContext,
    id: string,
    lastDate?: string,
  ): Promise<RecurringExpenseView> {
    const date = lastDate ?? (await this.today(member.householdId));
    await this.mutate(actor, member, id, null, (current) => {
      if (date < current.startDate) {
        throw validationFailed([
          {
            field: 'lastDate',
            constraints: ['must be on or after the start date; delete it instead'],
          },
        ]);
      }
      // An open pause is closed by ending: nothing is expected afterwards anyway.
      const pauses = current.pauses.map((p) =>
        p.to === null ? { ...p, to: date > p.from ? date : p.from } : p,
      );
      return Promise.resolve({ ...this.changesOf(current), endDate: date, pauses });
    });
    return this.get(member, id);
  }

  /** Soft delete; expenses already confirmed stay as they are. */
  async remove(actor: Actor, member: MemberContext, id: string): Promise<void> {
    await this.mutate(actor, member, id, null, (current) =>
      Promise.resolve(
        current.deletedAt
          ? null
          : {
              ...this.changesOf(current),
              deletedAt: this.clock.now(),
              deletedByMemberId: member.memberId,
            },
      ),
    );
  }

  async restore(actor: Actor, member: MemberContext, id: string): Promise<RecurringExpenseView> {
    await this.mutate(actor, member, id, null, (current) =>
      Promise.resolve(
        current.deletedAt
          ? { ...this.changesOf(current), deletedAt: null, deletedByMemberId: null }
          : null,
      ),
    );
    return this.get(member, id);
  }

  // --- occurrence commands -----------------------------------------------------------------------

  /** Materializes one occurrence as an expense (FR-REC-03); a second confirmation gets 409. */
  async confirm(
    actor: Actor,
    member: MemberContext,
    id: string,
    occurrenceDate: string,
    input: ConfirmOccurrenceInput,
  ): Promise<string> {
    return this.uow.run(async (tx) => {
      // The row lock serializes confirmations of the same template.
      const record = await this.recurring.find(member.householdId, id, { tx, lock: true });
      if (!record || record.deletedAt) {
        throw notFound();
      }
      const rule = ruleOf(record);
      if (!isScheduled(rule, occurrenceDate) || isPaused(rule, occurrenceDate)) {
        throw notScheduled();
      }
      const transactionId = await this.writer.create(
        tx,
        actor,
        member,
        {
          description: record.description,
          amountCents: input.amountCents ?? record.expectedAmountCents,
          date: input.date ?? occurrenceDate,
          categoryId: record.categoryId,
          payerMemberId: input.payerMemberId ?? record.payerMemberId,
          paymentMethod: input.paymentMethod ?? record.paymentMethod,
          notes: input.notes !== undefined ? input.notes : record.notes,
          tags: [],
          ...(record.splitRule ? { split: record.splitRule } : {}),
        },
        { origin: { kind: 'RECURRING', recurringExpenseId: id, occurrenceDate } },
      );
      // Confirming a skipped occurrence un-skips it.
      await this.recurring.removeSkip(tx, id, occurrenceDate);
      return transactionId;
    });
  }

  async skip(
    actor: Actor,
    member: MemberContext,
    id: string,
    occurrenceDate: string,
  ): Promise<void> {
    await this.uow.run(async (tx) => {
      const record = await this.recurring.find(member.householdId, id, { tx, lock: true });
      if (!record || record.deletedAt) {
        throw notFound();
      }
      if (!isScheduled(ruleOf(record), occurrenceDate)) {
        throw notScheduled();
      }
      const confirmed: ConfirmationEntry[] = await this.ledger.confirmations(
        member.householdId,
        [id],
        tx,
      );
      if (confirmed.some((c) => c.occurrenceDate === occurrenceDate)) {
        throw new AppException(
          ErrorCode.OCCURRENCE_ALREADY_CONFIRMED,
          'This occurrence already has an expense; delete the expense instead.',
          HttpStatus.CONFLICT,
        );
      }
      const added = await this.recurring.addSkip(tx, {
        id: this.ids.next(),
        recurringExpenseId: id,
        occurrenceDate,
        createdByMemberId: member.memberId,
      });
      if (added) {
        await this.audit.record(tx, actor, {
          householdId: member.householdId,
          entityType: SKIP_ENTITY_TYPE,
          entityId: id,
          action: 'CREATE',
          after: { occurrenceDate, skipped: true },
        });
      }
    });
  }

  async unskip(
    actor: Actor,
    member: MemberContext,
    id: string,
    occurrenceDate: string,
  ): Promise<void> {
    await this.uow.run(async (tx) => {
      const record = await this.recurring.find(member.householdId, id, { tx, lock: true });
      if (!record || record.deletedAt) {
        throw notFound();
      }
      if (await this.recurring.removeSkip(tx, id, occurrenceDate)) {
        await this.audit.record(tx, actor, {
          householdId: member.householdId,
          entityType: SKIP_ENTITY_TYPE,
          entityId: id,
          action: 'DELETE',
          before: { occurrenceDate, skipped: true },
        });
      }
    });
  }

  // --- helpers -----------------------------------------------------------------------------------

  private changesOf(record: RecurringExpenseRecord): RecurringExpenseChanges {
    const {
      id: _id,
      householdId: _h,
      createdByMemberId: _c,
      version: _v,
      createdAt: _t,
      ...rest
    } = record;
    return rest;
  }

  private rule<T>(apply: () => T): T {
    try {
      return apply();
    } catch (error) {
      if (error instanceof RecurrenceError) {
        throw new AppException(
          ErrorCode.CONFLICT,
          `Recurring expense ${error.message}.`,
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /** Locks, applies `change` (null = no-op), checks version, saves and audits — one transaction. */
  private async mutate(
    actor: Actor,
    member: MemberContext,
    id: string,
    expectedVersion: number | null,
    change: (
      current: RecurringExpenseRecord,
      tx: TransactionContext,
    ) => Promise<RecurringExpenseChanges | null>,
  ): Promise<void> {
    await this.uow.run(async (tx) => {
      const current = await this.recurring.find(member.householdId, id, { tx, lock: true });
      if (!current) {
        throw notFound();
      }
      if (expectedVersion !== null && current.version !== expectedVersion) {
        throw new AppException(
          ErrorCode.VERSION_CONFLICT,
          'The recurring expense changed since it was loaded. Reload and try again.',
          HttpStatus.CONFLICT,
        );
      }
      const changes = await change(current, tx);
      if (!changes) {
        return;
      }
      if (!(await this.recurring.update(tx, id, current.version, changes))) {
        throw new AppException(
          ErrorCode.VERSION_CONFLICT,
          'Concurrent change.',
          HttpStatus.CONFLICT,
        );
      }
      const saved = await this.recurring.find(member.householdId, id, { tx });
      await this.audit.record(tx, actor, {
        householdId: member.householdId,
        entityType: ENTITY_TYPE,
        entityId: id,
        action:
          changes.deletedAt && !current.deletedAt
            ? 'DELETE'
            : !changes.deletedAt && current.deletedAt
              ? 'RESTORE'
              : 'UPDATE',
        before: snapshot(current),
        after: saved ? snapshot(saved) : null,
      });
    });
  }
}
