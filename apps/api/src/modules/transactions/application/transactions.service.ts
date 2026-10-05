import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type PaymentMethod,
  type SplitInput,
  type SplitPreview,
  type TransactionHistoryEntry,
  type TransactionOrigin,
  type TransactionPage,
  type TransactionView,
} from '@couple-finance/shared';
import { isUniqueViolation } from '../../../common/database/pg-errors';
import { type Actor } from '../../../common/auth/current-actor.decorator';
import { type TransactionContext, UnitOfWork } from '../../../common/database/unit-of-work';
import { AppException, validationFailed } from '../../../common/errors/app.exception';
import { IdGenerator } from '../../../common/ids/id-generator';
import { Clock } from '../../../common/time/clock';
import { AuditReader, AuditRecorder } from '../../audit/public';
import { CategoriesService } from '../../categories/public';
import {
  HouseholdDirectory,
  type HouseholdMemberInfo,
  type MemberContext,
} from '../../households/public';
import { IncomeBasis } from '../../incomes/public';
import { UsersService } from '../../users/public';
import {
  allocateSplit,
  planSplit,
  reallocate,
  type ResolvedSplit,
  type SplitContext,
  SplitError,
  splitFromDefault,
  type SplitSnapshot,
} from '../domain/split';
import { toTransactionView, transactionSnapshot } from './transaction-view';
import {
  type PageCursor,
  type TransactionChanges,
  type TransactionFilters,
  type TransactionRecord,
  TransactionsRepository,
} from './transactions.repository';

export interface TransactionInput {
  description: string;
  amountCents: number;
  date: string;
  categoryId: string;
  payerMemberId: string;
  paymentMethod: PaymentMethod;
  notes?: string | null;
  tags?: string[];
  /** Omitted → household default split (FR-TX-02). */
  split?: SplitInput;
}

export type TransactionUpdate = Partial<TransactionInput> & { version: number };

export interface ListQuery extends Omit<TransactionFilters, 'categoryIds' | 'deleted'> {
  categoryId?: string;
  deleted?: 'only';
  cursor?: string;
  limit: number;
}

const ENTITY_TYPE = 'TRANSACTION';

const notFound = (): AppException =>
  new AppException(ErrorCode.NOT_FOUND, 'Transaction not found.', HttpStatus.NOT_FOUND);

function toAppException(error: unknown): unknown {
  if (!(error instanceof SplitError)) {
    return error;
  }
  if (error.kind === 'SUM_MISMATCH') {
    return new AppException(
      ErrorCode.SPLIT_SUM_MISMATCH,
      error.message,
      HttpStatus.UNPROCESSABLE_ENTITY,
      error.details,
    );
  }
  return validationFailed([{ field: error.field, constraints: [error.message] }]);
}

/** A live expense already holds this origin (partial unique indexes, ADR-007). */
function toOriginConflict(error: unknown): unknown {
  if (isUniqueViolation(error, 'ux_transactions_recurring_occurrence')) {
    return new AppException(
      ErrorCode.OCCURRENCE_ALREADY_CONFIRMED,
      'This occurrence already has an expense.',
      HttpStatus.CONFLICT,
    );
  }
  if (isUniqueViolation(error, 'ux_transactions_installment')) {
    return new AppException(
      ErrorCode.CONFLICT,
      'This installment already has an expense.',
      HttpStatus.CONFLICT,
    );
  }
  return error;
}

function encodeCursor(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify({ d: cursor.date, i: cursor.id })).toString('base64url');
}

function decodeCursor(raw: string): PageCursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      d?: unknown;
      i?: unknown;
    };
    if (typeof parsed.d === 'string' && typeof parsed.i === 'string') {
      return { date: parsed.d, id: parsed.i };
    }
  } catch {
    // fall through
  }
  throw validationFailed([{ field: 'cursor', constraints: ['invalid cursor'] }]);
}

/** Tags: trimmed, non-empty, de-duplicated case-insensitively (first spelling wins). */
function normalizeTags(tags: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags ?? []) {
    const tag = raw.trim();
    const key = tag.toLocaleLowerCase('pt-BR');
    if (tag.length > 0 && !seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
  }
  return result;
}

function normalizeNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactions: TransactionsRepository,
    private readonly directory: HouseholdDirectory,
    private readonly categories: CategoriesService,
    private readonly incomeBasis: IncomeBasis,
    private readonly users: UsersService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditRecorder,
    private readonly auditReader: AuditReader,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  // --- split resolution ------------------------------------------------------------------------

  private splitContext(
    members: HouseholdMemberInfo[],
    alsoEligible: readonly string[] = [],
  ): SplitContext {
    const active = members
      .filter((member) => member.status === 'ACTIVE')
      .map((member) => member.id);
    return {
      eligibleMemberIds: members
        .filter((member) => member.status === 'ACTIVE' || alsoEligible.includes(member.id))
        .map((member) => member.id),
      defaultParticipantIds: active,
    };
  }

  private async resolveSplit(
    householdId: string,
    amountCents: number,
    date: string,
    input: SplitInput,
    context: SplitContext,
    tx?: TransactionContext,
  ): Promise<ResolvedSplit> {
    try {
      const plan = planSplit(input, amountCents, context);
      if (plan.type === 'INCOME_PROPORTIONAL') {
        const bps = await this.incomeBasis.sharesBps(householdId, plan.participantIds, date, tx);
        return allocateSplit(amountCents, plan, { bps, basisDate: date });
      }
      return allocateSplit(amountCents, plan);
    } catch (error) {
      throw toAppException(error);
    }
  }

  private async defaultSplit(householdId: string): Promise<SplitInput> {
    const household = await this.directory.household(householdId);
    if (!household) {
      throw notFound();
    }
    return splitFromDefault(household.defaultSplit);
  }

  private assertEligiblePayer(payerMemberId: string, context: SplitContext): void {
    if (!context.eligibleMemberIds.includes(payerMemberId)) {
      throw validationFailed([
        { field: 'payerMemberId', constraints: ['payer must be a member of the household'] },
      ]);
    }
  }

  // --- queries -----------------------------------------------------------------------------------

  async get(member: MemberContext, id: string): Promise<TransactionView> {
    const record = await this.transactions.find(member.householdId, id);
    if (!record) {
      throw notFound();
    }
    return toTransactionView(record);
  }

  async list(member: MemberContext, query: ListQuery): Promise<TransactionPage> {
    const filters: TransactionFilters = {
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      ...(query.payerMemberId ? { payerMemberId: query.payerMemberId } : {}),
      ...(query.responsibleMemberId ? { responsibleMemberId: query.responsibleMemberId } : {}),
      ...(query.splitType ? { splitType: query.splitType } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.text ? { text: query.text } : {}),
      ...(query.categoryId
        ? { categoryIds: await this.categories.subtreeIds(member.householdId, query.categoryId) }
        : {}),
      deleted: query.deleted === 'only' ? 'only' : 'exclude',
    };
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.transactions.list(member.householdId, filters, cursor, query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      data: page.map(toTransactionView),
      page: {
        nextCursor:
          rows.length > query.limit && last ? encodeCursor({ date: last.date, id: last.id }) : null,
        limit: query.limit,
      },
    };
  }

  /** Computes allocations without saving (live preview in the form; math stays server-side). */
  async preview(
    member: MemberContext,
    input: { amountCents: number; date: string; split?: SplitInput },
  ): Promise<SplitPreview> {
    const members = await this.directory.members(member.householdId);
    const resolved = await this.resolveSplit(
      member.householdId,
      input.amountCents,
      input.date,
      input.split ?? (await this.defaultSplit(member.householdId)),
      this.splitContext(members),
    );
    return { split: resolved.snapshot, allocations: resolved.allocations };
  }

  async history(member: MemberContext, id: string): Promise<TransactionHistoryEntry[]> {
    if (!(await this.transactions.find(member.householdId, id))) {
      throw notFound();
    }
    const events = await this.auditReader.forEntity(member.householdId, ENTITY_TYPE, id);
    const profiles = await this.users.findProfiles([
      ...new Set(events.map((event) => event.actorUserId)),
    ]);
    return events.map((event) => ({
      action: event.action,
      actorDisplayName: profiles.get(event.actorUserId)?.displayName ?? 'Ex-membro',
      occurredAt: event.occurredAt.toISOString(),
      before: event.before,
      after: event.after,
    }));
  }

  // --- commitments (ADR-007): used through TransactionWriter -----------------------------------

  /** Validates a template split rule against the active members (no amount, no incomes). */
  async assertSplitRule(householdId: string, split: SplitInput): Promise<void> {
    if (split.type === 'CUSTOM_AMOUNT') {
      throw validationFailed([
        { field: 'split.type', constraints: ['CUSTOM_AMOUNT is only for single expenses'] },
      ]);
    }
    const context = this.splitContext(await this.directory.members(householdId));
    try {
      planSplit(split, 1, context);
    } catch (error) {
      throw toAppException(error);
    }
  }

  /** Resolves a split once (installment plans reuse it for every installment). */
  async resolveSnapshot(
    tx: TransactionContext,
    householdId: string,
    amountCents: number,
    date: string,
    split: SplitInput | undefined,
  ): Promise<SplitSnapshot> {
    const members = await this.directory.members(householdId, tx);
    const resolved = await this.resolveSplit(
      householdId,
      amountCents,
      date,
      split ?? (await this.defaultSplit(householdId)),
      this.splitContext(members),
      tx,
    );
    return resolved.snapshot;
  }

  /**
   * Creates an expense inside the caller's transaction, with its origin. With `snapshot` the
   * stored basis is re-applied to this amount; otherwise `input.split` (or the household
   * default) is resolved on the expense date.
   */
  async createInTx(
    tx: TransactionContext,
    actor: Actor,
    member: MemberContext,
    input: TransactionInput,
    options: { origin: TransactionOrigin; snapshot?: SplitSnapshot },
  ): Promise<string> {
    const id = this.ids.next();
    const context = this.splitContext(await this.directory.members(member.householdId, tx));
    this.assertEligiblePayer(input.payerMemberId, context);
    await this.categories.assertUsable(member.householdId, input.categoryId, { tx });
    let split: ResolvedSplit;
    try {
      split = options.snapshot
        ? {
            snapshot: options.snapshot,
            allocations: reallocate(input.amountCents, options.snapshot),
          }
        : await this.resolveSplit(
            member.householdId,
            input.amountCents,
            input.date,
            input.split ?? (await this.defaultSplit(member.householdId)),
            context,
            tx,
          );
    } catch (error) {
      throw toAppException(error);
    }
    try {
      await this.transactions.insert(tx, {
        id,
        householdId: member.householdId,
        description: input.description,
        amountCents: input.amountCents,
        date: input.date,
        categoryId: input.categoryId,
        payerMemberId: input.payerMemberId,
        paymentMethod: input.paymentMethod,
        notes: normalizeNotes(input.notes),
        tags: normalizeTags(input.tags),
        split: split.snapshot,
        allocations: split.allocations,
        origin: options.origin,
        createdByMemberId: member.memberId,
      });
    } catch (error) {
      throw toOriginConflict(error);
    }
    const created = await this.transactions.find(member.householdId, id, { tx });
    await this.audit.record(tx, actor, {
      householdId: member.householdId,
      entityType: ENTITY_TYPE,
      entityId: id,
      action: 'CREATE',
      after: created ? transactionSnapshot(created) : null,
    });
    return id;
  }

  /**
   * Soft-deletes (`deletedAt` set) or restores (`null`) expenses inside the caller's transaction,
   * one audit event each. Expenses already in the target state are left alone.
   */
  async setDeletedInTx(
    tx: TransactionContext,
    actor: Actor,
    member: MemberContext,
    ids: readonly string[],
    deletedAt: Date | null,
  ): Promise<void> {
    for (const id of ids) {
      const current = await this.transactions.find(member.householdId, id, { tx, lock: true });
      if (!current || (current.deletedAt === null) === (deletedAt === null)) {
        continue;
      }
      await this.save(
        tx,
        actor,
        member,
        current,
        deletedAt ? 'DELETE' : 'RESTORE',
        current.version,
        {
          ...current,
          deletedAt,
          deletedByMemberId: deletedAt ? member.memberId : null,
        },
      );
    }
  }

  // --- commands ----------------------------------------------------------------------------------

  async create(
    actor: Actor,
    member: MemberContext,
    input: TransactionInput,
  ): Promise<TransactionView> {
    const id = this.ids.next();
    await this.uow.run(async (tx) => {
      const members = await this.directory.members(member.householdId, tx);
      const context = this.splitContext(members);
      this.assertEligiblePayer(input.payerMemberId, context);
      await this.categories.assertUsable(member.householdId, input.categoryId, { tx });
      const split = await this.resolveSplit(
        member.householdId,
        input.amountCents,
        input.date,
        input.split ?? (await this.defaultSplit(member.householdId)),
        context,
        tx,
      );
      await this.transactions.insert(tx, {
        id,
        householdId: member.householdId,
        description: input.description,
        amountCents: input.amountCents,
        date: input.date,
        categoryId: input.categoryId,
        payerMemberId: input.payerMemberId,
        paymentMethod: input.paymentMethod,
        notes: normalizeNotes(input.notes),
        tags: normalizeTags(input.tags),
        split: split.snapshot,
        allocations: split.allocations,
        origin: null,
        createdByMemberId: member.memberId,
      });
      const created = await this.transactions.find(member.householdId, id, { tx });
      await this.audit.record(tx, actor, {
        householdId: member.householdId,
        entityType: ENTITY_TYPE,
        entityId: id,
        action: 'CREATE',
        after: created ? transactionSnapshot(created) : null,
      });
    });
    return this.get(member, id);
  }

  /**
   * Edits keep the stored split basis unless a new split is sent (ADR-006, BUSINESS_RULES 6):
   * - amount only → same weights re-applied; date only → basis kept;
   * - new `split` → resolved again (proportional uses income on the new date).
   */
  async update(
    actor: Actor,
    member: MemberContext,
    id: string,
    input: TransactionUpdate,
  ): Promise<TransactionView> {
    await this.mutate(actor, member, id, 'UPDATE', input.version, async (current, tx) => {
      if (current.deletedAt) {
        throw notFound();
      }
      const referenced = [current.payerMemberId, ...current.allocations.map((a) => a.memberId)];
      const context = this.splitContext(
        await this.directory.members(member.householdId, tx),
        referenced,
      );

      const next = {
        description: input.description ?? current.description,
        amountCents: input.amountCents ?? current.amountCents,
        date: input.date ?? current.date,
        categoryId: input.categoryId ?? current.categoryId,
        payerMemberId: input.payerMemberId ?? current.payerMemberId,
        paymentMethod: input.paymentMethod ?? current.paymentMethod,
        notes: input.notes !== undefined ? normalizeNotes(input.notes) : current.notes,
        tags: input.tags !== undefined ? normalizeTags(input.tags) : current.tags,
      };
      this.assertEligiblePayer(next.payerMemberId, context);
      if (next.categoryId !== current.categoryId) {
        await this.categories.assertUsable(member.householdId, next.categoryId, {
          tx,
          allowArchivedId: current.categoryId,
        });
      }

      let split: ResolvedSplit = { snapshot: current.split, allocations: current.allocations };
      if (input.split) {
        split = await this.resolveSplit(
          member.householdId,
          next.amountCents,
          next.date,
          input.split,
          context,
          tx,
        );
      } else if (next.amountCents !== current.amountCents) {
        try {
          split = {
            snapshot: current.split,
            allocations: reallocate(next.amountCents, current.split),
          };
        } catch (error) {
          throw toAppException(error);
        }
      }
      return {
        ...next,
        split: split.snapshot,
        allocations: split.allocations,
        deletedAt: current.deletedAt,
        deletedByMemberId: current.deletedByMemberId,
      };
    });
    return this.get(member, id);
  }

  /** Soft delete (FR-TX-07); idempotent. */
  async remove(actor: Actor, member: MemberContext, id: string): Promise<void> {
    await this.mutate(actor, member, id, 'DELETE', null, (current) =>
      Promise.resolve(
        current.deletedAt
          ? null
          : { ...current, deletedAt: this.clock.now(), deletedByMemberId: member.memberId },
      ),
    );
  }

  async restore(actor: Actor, member: MemberContext, id: string): Promise<TransactionView> {
    await this.mutate(actor, member, id, 'RESTORE', null, (current) =>
      Promise.resolve(
        current.deletedAt ? { ...current, deletedAt: null, deletedByMemberId: null } : null,
      ),
    );
    return this.get(member, id);
  }

  /** Re-reads incomes on the transaction date for a proportional split (FR-TX-08). */
  async recalculate(actor: Actor, member: MemberContext, id: string): Promise<TransactionView> {
    await this.mutate(actor, member, id, 'RECALCULATE', null, async (current, tx) => {
      if (current.deletedAt) {
        throw notFound();
      }
      if (current.split.type !== 'INCOME_PROPORTIONAL') {
        throw validationFailed([
          {
            field: 'split',
            constraints: ['only income-proportional expenses can be recalculated'],
          },
        ]);
      }
      return this.recalculated(member.householdId, current, tx);
    });
    return this.get(member, id);
  }

  /** Recalculates every proportional expense in a date range, all or nothing. */
  async recalculateRange(
    actor: Actor,
    member: MemberContext,
    from: string,
    to: string,
  ): Promise<{ recalculated: number; unchanged: number }> {
    if (from > to) {
      throw validationFailed([{ field: 'to', constraints: ['must be on or after from'] }]);
    }
    return this.uow.run(async (tx) => {
      let recalculated = 0;
      let unchanged = 0;
      for (const current of await this.transactions.listProportionalInRange(
        tx,
        member.householdId,
        from,
        to,
      )) {
        const changes = await this.recalculated(member.householdId, current, tx);
        if (!changes) {
          unchanged += 1;
          continue;
        }
        await this.save(tx, actor, member, current, 'RECALCULATE', current.version, changes);
        recalculated += 1;
      }
      return { recalculated, unchanged };
    });
  }

  private async recalculated(
    householdId: string,
    current: TransactionRecord,
    tx: TransactionContext,
  ): Promise<TransactionChanges | null> {
    const participants = current.split.weights.map((w) => w.memberId);
    const bps = await this.incomeBasis.sharesBps(householdId, participants, current.date, tx);
    const snapshot = {
      type: current.split.type,
      weights: participants.map((memberId, i) => ({ memberId, weight: bps[i] ?? 0 })),
      incomeBasisDate: current.date,
    };
    const sameWeights = snapshot.weights.every(
      (w, i) => w.weight === current.split.weights[i]?.weight,
    );
    if (sameWeights && current.split.incomeBasisDate === current.date) {
      return null;
    }
    return { ...current, split: snapshot, allocations: reallocate(current.amountCents, snapshot) };
  }

  /** Locks, applies `change` (null = no-op), checks version, saves and audits — one transaction. */
  private async mutate(
    actor: Actor,
    member: MemberContext,
    id: string,
    action: 'UPDATE' | 'DELETE' | 'RESTORE' | 'RECALCULATE',
    expectedVersion: number | null,
    change: (
      current: TransactionRecord,
      tx: TransactionContext,
    ) => Promise<TransactionChanges | null>,
  ): Promise<void> {
    await this.uow.run(async (tx) => {
      const current = await this.transactions.find(member.householdId, id, { tx, lock: true });
      if (!current) {
        throw notFound();
      }
      if (expectedVersion !== null && current.version !== expectedVersion) {
        throw new AppException(
          ErrorCode.VERSION_CONFLICT,
          'The expense changed since it was loaded. Reload and try again.',
          HttpStatus.CONFLICT,
          { current: toTransactionView(current) },
        );
      }
      const changes = await change(current, tx);
      if (changes) {
        await this.save(tx, actor, member, current, action, current.version, changes);
      }
    });
  }

  private async save(
    tx: TransactionContext,
    actor: Actor,
    member: MemberContext,
    current: TransactionRecord,
    action: 'UPDATE' | 'DELETE' | 'RESTORE' | 'RECALCULATE',
    version: number,
    changes: TransactionChanges,
  ): Promise<void> {
    let updated: boolean;
    try {
      updated = await this.transactions.update(tx, current.id, version, changes);
    } catch (error) {
      throw toOriginConflict(error);
    }
    if (!updated) {
      throw new AppException(
        ErrorCode.VERSION_CONFLICT,
        'The expense changed concurrently.',
        HttpStatus.CONFLICT,
      );
    }
    const saved = await this.transactions.find(member.householdId, current.id, { tx });
    await this.audit.record(tx, actor, {
      householdId: member.householdId,
      entityType: ENTITY_TYPE,
      entityId: current.id,
      action,
      before: transactionSnapshot(current),
      after: saved ? transactionSnapshot(saved) : null,
    });
  }
}
