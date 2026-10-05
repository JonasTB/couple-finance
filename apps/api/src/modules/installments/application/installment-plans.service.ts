import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type CloseInstallmentPlanInput,
  ErrorCode,
  type InstallmentPlanInput,
  type InstallmentPlanView,
  type InstallmentSummary,
} from '@couple-finance/shared';
import { type Actor } from '../../../common/auth/current-actor.decorator';
import { type TransactionContext, UnitOfWork } from '../../../common/database/unit-of-work';
import { AppException, validationFailed } from '../../../common/errors/app.exception';
import { IdGenerator } from '../../../common/ids/id-generator';
import { Clock } from '../../../common/time/clock';
import { localDateIn } from '../../../common/time/local-date';
import { AuditRecorder } from '../../audit/public';
import { HouseholdDirectory, type MemberContext } from '../../households/public';
import { type InstallmentEntry, LedgerQuery, TransactionWriter } from '../../transactions/public';
import {
  commitmentSummary,
  InstallmentError,
  type PlanInstallment,
  planProgress,
  regularInstallment,
  scheduleInstallments,
} from '../domain/installments';
import {
  type InstallmentPlanRecord,
  InstallmentPlansRepository,
} from './installment-plans.repository';

const ENTITY_TYPE = 'INSTALLMENT_PLAN';

const notFound = (): AppException =>
  new AppException(ErrorCode.NOT_FOUND, 'Installment plan not found.', HttpStatus.NOT_FOUND);

function snapshot(plan: InstallmentPlanRecord): Record<string, unknown> {
  const { createdAt: _created, householdId: _household, ...rest } = plan;
  return {
    ...rest,
    closedAt: plan.closedAt?.toISOString() ?? null,
    deletedAt: plan.deletedAt?.toISOString() ?? null,
  };
}

function toPlanInstallments(entries: readonly InstallmentEntry[]): PlanInstallment[] {
  return entries.map((entry) => ({
    number: entry.installmentNumber,
    date: entry.date,
    amountCents: entry.amountCents,
    payoff: entry.payoff,
  }));
}

/**
 * Installment plans (FR-INST-01..04, ADR-007). Creating a plan creates its n installments as
 * ordinary expenses in the same database transaction; analytics and balances need nothing else.
 *
 * - Every installment carries the plan's split snapshot, resolved once on the first date.
 * - Closing early (CANCEL / PAY_OFF) soft-deletes the installments dated after the cut-off;
 *   PAY_OFF also records one payoff expense standing for them.
 * - Deleting a plan soft-deletes all of its expenses; restoring brings back exactly those.
 * Individual installments stay editable like any expense.
 */
@Injectable()
export class InstallmentPlansService {
  constructor(
    private readonly plans: InstallmentPlansRepository,
    private readonly directory: HouseholdDirectory,
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

  private toView(
    plan: InstallmentPlanRecord,
    entries: readonly InstallmentEntry[],
    today: string,
    withInstallments: boolean,
  ): InstallmentPlanView {
    const installments = toPlanInstallments(entries);
    const progress = planProgress(installments, today, plan.closeKind, plan.installmentCount);
    return {
      id: plan.id,
      description: plan.description,
      categoryId: plan.categoryId,
      payerMemberId: plan.payerMemberId,
      paymentMethod: plan.paymentMethod,
      installmentCount: plan.installmentCount,
      firstInstallmentDate: plan.firstInstallmentDate,
      originalTotalCents: plan.originalTotalCents,
      totalCents: progress.totalCents,
      paidCount: progress.paidCount,
      paidCents: progress.paidCents,
      remainingCount: progress.remainingCount,
      remainingCents: progress.remainingCents,
      installmentAmountCents: regularInstallment(plan.originalTotalCents, plan.installmentCount),
      nextInstallment: progress.next
        ? {
            number: progress.next.number,
            date: progress.next.date,
            amountCents: progress.next.amountCents,
          }
        : null,
      releaseMonth: progress.releaseMonth,
      status: progress.status,
      split: plan.splitSnapshot,
      notes: plan.notes,
      closedAt: plan.closedAt?.toISOString() ?? null,
      createdAt: plan.createdAt.toISOString(),
      deletedAt: plan.deletedAt?.toISOString() ?? null,
      ...(withInstallments
        ? {
            installments: entries.map((entry) => ({
              number: entry.installmentNumber,
              transactionId: entry.transactionId,
              date: entry.date,
              amountCents: entry.amountCents,
              status: entry.date <= today ? ('PAID' as const) : ('REMAINING' as const),
              payoff: entry.payoff,
            })),
          }
        : {}),
    };
  }

  // --- queries -----------------------------------------------------------------------------------

  async list(member: MemberContext, deleted?: 'only'): Promise<InstallmentPlanView[]> {
    const plans = await this.plans.list(member.householdId, deleted ? 'only' : 'exclude');
    const today = await this.today(member.householdId);
    const entries = await this.ledger.installments(
      member.householdId,
      plans.map((p) => p.id),
    );
    return plans.map((plan) =>
      this.toView(
        plan,
        entries.filter((e) => e.installmentPlanId === plan.id),
        today,
        false,
      ),
    );
  }

  async get(member: MemberContext, id: string): Promise<InstallmentPlanView> {
    const plan = await this.plans.find(member.householdId, id);
    if (!plan) {
      throw notFound();
    }
    const entries = await this.ledger.installments(member.householdId, [id]);
    return this.toView(plan, entries, await this.today(member.householdId), true);
  }

  /** Monthly commitment (12 months) and release timeline (FR-INST-03). */
  async summary(member: MemberContext): Promise<InstallmentSummary> {
    const plans = await this.plans.list(member.householdId, 'exclude');
    const today = await this.today(member.householdId);
    const entries = await this.ledger.installments(
      member.householdId,
      plans.map((p) => p.id),
    );
    return commitmentSummary(
      plans.map((plan) => ({
        id: plan.id,
        description: plan.description,
        installments: toPlanInstallments(entries.filter((e) => e.installmentPlanId === plan.id)),
      })),
      today.slice(0, 7),
    );
  }

  // --- commands ----------------------------------------------------------------------------------

  async create(
    actor: Actor,
    member: MemberContext,
    input: InstallmentPlanInput,
  ): Promise<InstallmentPlanView> {
    let schedule: ReturnType<typeof scheduleInstallments>;
    try {
      schedule = scheduleInstallments({
        installmentCount: input.installmentCount,
        firstInstallmentDate: input.firstInstallmentDate,
        ...(input.totalAmountCents !== undefined
          ? { totalAmountCents: input.totalAmountCents }
          : {}),
        ...(input.installmentAmountCents !== undefined
          ? { installmentAmountCents: input.installmentAmountCents }
          : {}),
      });
    } catch (error) {
      if (error instanceof InstallmentError) {
        throw validationFailed([{ field: error.field, constraints: [error.message] }]);
      }
      throw error;
    }
    if (input.split?.type === 'CUSTOM_AMOUNT') {
      throw validationFailed([
        { field: 'split.type', constraints: ['CUSTOM_AMOUNT is only for single expenses'] },
      ]);
    }
    const id = this.ids.next();
    const notes = input.notes?.trim() ? input.notes.trim() : null;
    await this.uow.run(async (tx) => {
      // One basis for the whole purchase: incomes on the first installment date (CALCULATIONS §5).
      const split = await this.writer.resolveSnapshot(
        tx,
        member.householdId,
        schedule.totalAmountCents,
        input.firstInstallmentDate,
        input.split,
      );
      await this.plans.insert(tx, {
        id,
        householdId: member.householdId,
        description: input.description,
        categoryId: input.categoryId,
        originalTotalCents: schedule.totalAmountCents,
        installmentCount: input.installmentCount,
        firstInstallmentDate: input.firstInstallmentDate,
        payerMemberId: input.payerMemberId,
        paymentMethod: input.paymentMethod,
        splitSnapshot: split,
        notes,
        createdByMemberId: member.memberId,
      });
      for (const installment of schedule.installments) {
        await this.writer.create(
          tx,
          actor,
          member,
          {
            description: input.description,
            amountCents: installment.amountCents,
            date: installment.date,
            categoryId: input.categoryId,
            payerMemberId: input.payerMemberId,
            paymentMethod: input.paymentMethod,
            notes: null,
            tags: [],
          },
          {
            origin: {
              kind: 'INSTALLMENT',
              installmentPlanId: id,
              installmentNumber: installment.number,
              installmentCount: input.installmentCount,
              payoff: false,
            },
            snapshot: split,
          },
        );
      }
      const created = await this.plans.find(member.householdId, id, { tx });
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

  /**
   * Early end (FR-INST-04). Installments dated after the cut-off (default today) are removed;
   * PAY_OFF records one expense with the amount actually paid, numbered as the first removed
   * installment and carrying the plan's split.
   */
  async close(
    actor: Actor,
    member: MemberContext,
    id: string,
    input: CloseInstallmentPlanInput,
  ): Promise<InstallmentPlanView> {
    const cutoff = input.date ?? (await this.today(member.householdId));
    if (input.kind === 'PAY_OFF' && input.payoffAmountCents === undefined) {
      throw validationFailed([
        { field: 'payoffAmountCents', constraints: ['required for PAY_OFF'] },
      ]);
    }
    if (input.kind === 'CANCEL' && input.payoffAmountCents !== undefined) {
      throw validationFailed([{ field: 'payoffAmountCents', constraints: ['only for PAY_OFF'] }]);
    }
    await this.mutate(actor, member, id, async (plan, tx) => {
      if (plan.deletedAt) {
        throw notFound();
      }
      if (plan.closeKind) {
        throw new AppException(
          ErrorCode.INSTALLMENT_PLAN_CLOSED,
          'The plan was already closed.',
          HttpStatus.CONFLICT,
        );
      }
      const live = await this.ledger.installments(member.householdId, [id], tx);
      const removed = live
        .filter((entry) => entry.date > cutoff)
        .sort((a, b) => a.installmentNumber - b.installmentNumber);
      const first = removed[0];
      if (!first) {
        throw validationFailed([
          { field: 'date', constraints: ['no installment is dated after this date'] },
        ]);
      }
      const now = this.clock.now();
      await this.writer.setDeleted(
        tx,
        actor,
        member,
        removed.map((entry) => entry.transactionId),
        now,
      );
      if (input.kind === 'PAY_OFF') {
        await this.writer.create(
          tx,
          actor,
          member,
          {
            description: plan.description,
            amountCents: input.payoffAmountCents ?? 0,
            date: cutoff,
            categoryId: plan.categoryId,
            payerMemberId: plan.payerMemberId,
            paymentMethod: plan.paymentMethod,
            notes: `Quitação antecipada das parcelas ${String(first.installmentNumber)} a ${String(plan.installmentCount)}`,
            tags: [],
          },
          {
            origin: {
              kind: 'INSTALLMENT',
              installmentPlanId: id,
              installmentNumber: first.installmentNumber,
              installmentCount: plan.installmentCount,
              payoff: true,
            },
            snapshot: plan.splitSnapshot,
          },
        );
      }
      return { closeKind: input.kind, closedAt: now, closedByMemberId: member.memberId };
    });
    return this.get(member, id);
  }

  /** Soft-deletes the plan and all of its live expenses at one instant. */
  async remove(actor: Actor, member: MemberContext, id: string): Promise<void> {
    await this.mutate(actor, member, id, async (plan, tx) => {
      if (plan.deletedAt) {
        return null;
      }
      // Restore matches expenses by this exact instant, so it must differ from the instant an
      // earlier close removed installments at (both run under the plan's row lock).
      let now = this.clock.now();
      if (plan.closedAt && now.getTime() <= plan.closedAt.getTime()) {
        now = new Date(plan.closedAt.getTime() + 1);
      }
      const live = await this.ledger.installments(member.householdId, [id], tx);
      await this.writer.setDeleted(
        tx,
        actor,
        member,
        live.map((entry) => entry.transactionId),
        now,
      );
      return { deletedAt: now, deletedByMemberId: member.memberId };
    });
  }

  /** Restores the plan and exactly the expenses its deletion removed. */
  async restore(actor: Actor, member: MemberContext, id: string): Promise<InstallmentPlanView> {
    await this.mutate(actor, member, id, async (plan, tx) => {
      if (!plan.deletedAt) {
        return null;
      }
      const ids = await this.writer.idsDeletedWithPlan(tx, member.householdId, id, plan.deletedAt);
      await this.writer.setDeleted(tx, actor, member, ids, null);
      return { deletedAt: null, deletedByMemberId: null };
    });
    return this.get(member, id);
  }

  private async mutate(
    actor: Actor,
    member: MemberContext,
    id: string,
    change: (
      plan: InstallmentPlanRecord,
      tx: TransactionContext,
    ) => Promise<Parameters<InstallmentPlansRepository['update']>[2] | null>,
  ): Promise<void> {
    await this.uow.run(async (tx) => {
      const plan = await this.plans.find(member.householdId, id, { tx, lock: true });
      if (!plan) {
        throw notFound();
      }
      const changes = await change(plan, tx);
      if (!changes) {
        return;
      }
      await this.plans.update(tx, id, changes);
      const saved = await this.plans.find(member.householdId, id, { tx });
      await this.audit.record(tx, actor, {
        householdId: member.householdId,
        entityType: ENTITY_TYPE,
        entityId: id,
        action:
          changes.deletedAt !== undefined ? (changes.deletedAt ? 'DELETE' : 'RESTORE') : 'UPDATE',
        before: snapshot(plan),
        after: saved ? snapshot(saved) : null,
      });
    });
  }
}
