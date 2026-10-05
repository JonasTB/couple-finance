import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type PurchaseInput,
  type PurchaseItemInput,
  type PurchaseItemView,
  type PurchasePlanInput,
  type PurchasePlanView,
} from '@couple-finance/shared';
import { type Actor } from '../../../common/auth/current-actor.decorator';
import { type TransactionContext, UnitOfWork } from '../../../common/database/unit-of-work';
import { AppException, validationFailed } from '../../../common/errors/app.exception';
import { IdGenerator } from '../../../common/ids/id-generator';
import { Clock } from '../../../common/time/clock';
import { localDateIn } from '../../../common/time/local-date';
import { AuditRecorder } from '../../audit/public';
import { GoalsService } from '../../goals/public';
import { HouseholdDirectory, type MemberContext } from '../../households/public';
import { LedgerQuery } from '../../transactions/public';
import {
  compareItems,
  estimatedTotal,
  goalCoverageBps,
  planStatus,
  planTotals,
} from '../domain/purchase-plan';
import {
  type ItemChanges,
  type PlanChanges,
  type PurchaseItemRecord,
  type PurchasePlanRecord,
  PurchasePlansRepository,
} from './purchase-plans.repository';

const PLAN_ENTITY = 'PURCHASE_PLAN';
const ITEM_ENTITY = 'PURCHASE_PLAN_ITEM';

export type PlanUpdate = Partial<PurchasePlanInput> & { version: number };
export type ItemUpdate = Partial<PurchaseItemInput> & { version: number };

const notFound = (what = 'Purchase plan'): AppException =>
  new AppException(ErrorCode.NOT_FOUND, `${what} not found.`, HttpStatus.NOT_FOUND);

const archived = (): AppException =>
  new AppException(ErrorCode.ARCHIVED, 'Restore the plan to change it.', HttpStatus.CONFLICT);

const stale = (): AppException =>
  new AppException(
    ErrorCode.VERSION_CONFLICT,
    'This changed since it was loaded. Reload and try again.',
    HttpStatus.CONFLICT,
  );

const trimOrNull = (text: string | null | undefined): string | null =>
  text?.trim() ? text.trim() : null;

function planSnapshot(plan: PurchasePlanRecord): Record<string, unknown> {
  const { createdAt: _c, householdId: _h, ...rest } = plan;
  return { ...rest, archivedAt: plan.archivedAt?.toISOString() ?? null };
}

function itemSnapshot(item: PurchaseItemRecord): Record<string, unknown> {
  return { ...item, deletedAt: item.deletedAt?.toISOString() ?? null };
}

/**
 * Purchase plans (FR-PP-01..04): a project ("Casita") with items to buy. Estimates vs actual
 * are bookkeeping; buying an item may link an expense already recorded, but never creates one.
 */
@Injectable()
export class PurchasePlansService {
  constructor(
    private readonly plans: PurchasePlansRepository,
    private readonly goals: GoalsService,
    private readonly ledger: LedgerQuery,
    private readonly directory: HouseholdDirectory,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditRecorder,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  // --- views -------------------------------------------------------------------------------------

  private async views(
    householdId: string,
    plans: readonly PurchasePlanRecord[],
    withItems: boolean,
  ): Promise<PurchasePlanView[]> {
    const items = await this.plans.items(plans.map((p) => p.id));
    const goalIds = plans.flatMap((p) => (p.goalId ? [p.goalId] : []));
    const [goals, transactions] = await Promise.all([
      this.goals.summaries(householdId, goalIds),
      withItems
        ? this.ledger.summaries(
            householdId,
            items.flatMap((i) => (i.transactionId ? [i.transactionId] : [])),
          )
        : Promise.resolve(new Map<string, never>()),
    ]);
    return plans.map((plan) => {
      const own = items.filter((i) => i.purchasePlanId === plan.id);
      const totals = planTotals(own);
      const goal = plan.goalId ? goals.get(plan.goalId) : undefined;
      return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        status: planStatus(totals, plan.archivedAt !== null),
        totals,
        goal: goal
          ? {
              id: goal.id,
              name: goal.name,
              savedCents: goal.savedCents,
              coverageBps: goalCoverageBps(goal.savedCents, totals.remainingNeedCents),
            }
          : null,
        version: plan.version,
        createdAt: plan.createdAt.toISOString(),
        archivedAt: plan.archivedAt?.toISOString() ?? null,
        ...(withItems
          ? {
              items: [...own].sort(compareItems).map((item): PurchaseItemView => ({
                id: item.id,
                name: item.name,
                estimatedPriceCents: item.estimatedPriceCents,
                quantity: item.quantity,
                estimatedTotalCents: estimatedTotal(item),
                priority: item.priority,
                status: item.status,
                paidPriceCents: item.paidPriceCents,
                purchasedAt: item.purchasedAt,
                // A linked expense deleted later shows as unlinked.
                transaction: item.transactionId
                  ? (transactions.get(item.transactionId) ?? null)
                  : null,
                responsibleMemberId: item.responsibleMemberId,
                url: item.url,
                notes: item.notes,
                version: item.version,
              })),
            }
          : {}),
      };
    });
  }

  async list(member: MemberContext): Promise<PurchasePlanView[]> {
    return this.views(member.householdId, await this.plans.list(member.householdId), false);
  }

  async get(member: MemberContext, id: string): Promise<PurchasePlanView> {
    const plan = await this.plans.find(member.householdId, id);
    if (!plan) {
      throw notFound();
    }
    const [view] = await this.views(member.householdId, [plan], true);
    if (!view) {
      throw notFound();
    }
    return view;
  }

  // --- validation --------------------------------------------------------------------------------

  private async assertGoal(householdId: string, goalId: string | null | undefined): Promise<void> {
    if (!goalId) return;
    const goal = (await this.goals.summaries(householdId, [goalId])).get(goalId);
    if (!goal || goal.archived) {
      throw validationFailed([{ field: 'goalId', constraints: ['unknown or archived goal'] }]);
    }
  }

  private async assertResponsible(householdId: string, memberId: string | null | undefined) {
    if (!memberId) return;
    const members = await this.directory.members(householdId);
    if (!members.some((m) => m.id === memberId && m.status === 'ACTIVE')) {
      throw validationFailed([
        { field: 'responsibleMemberId', constraints: ['must be an active member'] },
      ]);
    }
  }

  // --- plan commands -----------------------------------------------------------------------------

  async create(
    actor: Actor,
    member: MemberContext,
    input: PurchasePlanInput,
  ): Promise<PurchasePlanView> {
    await this.assertGoal(member.householdId, input.goalId);
    const id = this.ids.next();
    await this.uow.run(async (tx) => {
      await this.plans.insert(tx, {
        id,
        householdId: member.householdId,
        name: input.name,
        description: trimOrNull(input.description),
        goalId: input.goalId ?? null,
        createdByMemberId: member.memberId,
      });
      const created = await this.plans.find(member.householdId, id, { tx });
      await this.audit.record(tx, actor, {
        householdId: member.householdId,
        entityType: PLAN_ENTITY,
        entityId: id,
        action: 'CREATE',
        after: created ? planSnapshot(created) : null,
      });
    });
    return this.get(member, id);
  }

  async update(
    actor: Actor,
    member: MemberContext,
    id: string,
    input: PlanUpdate,
  ): Promise<PurchasePlanView> {
    if (input.goalId !== undefined) {
      await this.assertGoal(member.householdId, input.goalId);
    }
    await this.mutatePlan(actor, member, id, input.version, (plan) => {
      if (plan.archivedAt) throw archived();
      return {
        name: input.name ?? plan.name,
        description:
          input.description !== undefined ? trimOrNull(input.description) : plan.description,
        goalId: input.goalId !== undefined ? input.goalId : plan.goalId,
        archivedAt: null,
      };
    });
    return this.get(member, id);
  }

  async setArchived(
    actor: Actor,
    member: MemberContext,
    id: string,
    archive: boolean,
  ): Promise<PurchasePlanView> {
    await this.mutatePlan(actor, member, id, null, (plan) =>
      (plan.archivedAt !== null) === archive
        ? null
        : {
            name: plan.name,
            description: plan.description,
            goalId: plan.goalId,
            archivedAt: archive ? this.clock.now() : null,
          },
    );
    return this.get(member, id);
  }

  private async mutatePlan(
    actor: Actor,
    member: MemberContext,
    id: string,
    expectedVersion: number | null,
    change: (plan: PurchasePlanRecord) => PlanChanges | null,
  ): Promise<void> {
    await this.uow.run(async (tx) => {
      const plan = await this.plans.find(member.householdId, id, { tx, lock: true });
      if (!plan) throw notFound();
      if (expectedVersion !== null && plan.version !== expectedVersion) throw stale();
      const changes = change(plan);
      if (!changes) return;
      if (!(await this.plans.update(tx, id, plan.version, changes))) throw stale();
      const saved = await this.plans.find(member.householdId, id, { tx });
      await this.audit.record(tx, actor, {
        householdId: member.householdId,
        entityType: PLAN_ENTITY,
        entityId: id,
        action: 'UPDATE',
        before: planSnapshot(plan),
        after: saved ? planSnapshot(saved) : null,
      });
    });
  }

  // --- item commands -----------------------------------------------------------------------------

  /** Lock the plan (serializes item changes), check it is open, then run `work`. */
  private async withPlan<T>(
    member: MemberContext,
    planId: string,
    work: (tx: TransactionContext, items: PurchaseItemRecord[]) => Promise<T>,
  ): Promise<T> {
    return this.uow.run(async (tx) => {
      const plan = await this.plans.find(member.householdId, planId, { tx, lock: true });
      if (!plan) throw notFound();
      if (plan.archivedAt) throw archived();
      return work(tx, await this.plans.items([planId], { tx, withDeleted: true }));
    });
  }

  async addItem(
    actor: Actor,
    member: MemberContext,
    planId: string,
    input: PurchaseItemInput,
  ): Promise<PurchasePlanView> {
    await this.assertResponsible(member.householdId, input.responsibleMemberId);
    await this.withPlan(member, planId, async (tx) => {
      const id = this.ids.next();
      const item = {
        id,
        purchasePlanId: planId,
        name: input.name,
        estimatedPriceCents: input.estimatedPriceCents,
        quantity: input.quantity,
        priority: input.priority,
        status: input.status,
        paidPriceCents: null,
        purchasedAt: null,
        transactionId: null,
        responsibleMemberId: input.responsibleMemberId ?? null,
        url: trimOrNull(input.url),
        notes: trimOrNull(input.notes),
        createdByMemberId: member.memberId,
      };
      await this.plans.insertItem(tx, item);
      await this.audit.record(tx, actor, {
        householdId: member.householdId,
        entityType: ITEM_ENTITY,
        entityId: id,
        action: 'CREATE',
        after: item,
      });
    });
    return this.get(member, planId);
  }

  private async mutateItem(
    actor: Actor,
    member: MemberContext,
    planId: string,
    itemId: string,
    expectedVersion: number | null,
    action: 'UPDATE' | 'DELETE' | 'RESTORE',
    change: (item: PurchaseItemRecord) => Promise<ItemChanges | null> | ItemChanges | null,
  ): Promise<PurchasePlanView> {
    await this.withPlan(member, planId, async (tx, items) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) throw notFound('Item');
      if (expectedVersion !== null && item.version !== expectedVersion) throw stale();
      const changes = await change(item);
      if (!changes) return;
      if (!(await this.plans.updateItem(tx, itemId, item.version, changes))) throw stale();
      await this.audit.record(tx, actor, {
        householdId: member.householdId,
        entityType: ITEM_ENTITY,
        entityId: itemId,
        action,
        before: itemSnapshot(item),
        after: { ...changes, deletedAt: changes.deletedAt?.toISOString() ?? null },
      });
    });
    return this.get(member, planId);
  }

  private changesOf(item: PurchaseItemRecord): ItemChanges {
    const { id: _i, purchasePlanId: _p, createdByMemberId: _c, version: _v, ...rest } = item;
    return { ...rest, deletedByMemberId: null };
  }

  async updateItem(
    actor: Actor,
    member: MemberContext,
    planId: string,
    itemId: string,
    input: ItemUpdate,
  ): Promise<PurchasePlanView> {
    if (input.responsibleMemberId !== undefined) {
      await this.assertResponsible(member.householdId, input.responsibleMemberId);
    }
    return this.mutateItem(actor, member, planId, itemId, input.version, 'UPDATE', (item) => {
      if (item.deletedAt) throw notFound('Item');
      if (input.status !== undefined && item.status === 'PURCHASED') {
        throw validationFailed([
          { field: 'status', constraints: ['undo the purchase to change the status'] },
        ]);
      }
      return {
        ...this.changesOf(item),
        name: input.name ?? item.name,
        estimatedPriceCents: input.estimatedPriceCents ?? item.estimatedPriceCents,
        quantity: input.quantity ?? item.quantity,
        priority: input.priority ?? item.priority,
        status: input.status ?? item.status,
        responsibleMemberId:
          input.responsibleMemberId !== undefined
            ? input.responsibleMemberId
            : item.responsibleMemberId,
        url: input.url !== undefined ? trimOrNull(input.url) : item.url,
        notes: input.notes !== undefined ? trimOrNull(input.notes) : item.notes,
      };
    });
  }

  /** Marks an item purchased with the actual price (FR-PP-02); may link a recorded expense. */
  async purchase(
    actor: Actor,
    member: MemberContext,
    planId: string,
    itemId: string,
    input: PurchaseInput,
  ): Promise<PurchasePlanView> {
    const household = await this.directory.household(member.householdId);
    const today = localDateIn(household?.timezone ?? 'UTC', this.clock.now());
    const purchasedAt = input.purchasedAt ?? today;
    if (purchasedAt > today) {
      throw validationFailed([{ field: 'purchasedAt', constraints: ['cannot be in the future'] }]);
    }
    if (input.transactionId) {
      const found = await this.ledger.summaries(member.householdId, [input.transactionId]);
      if (!found.has(input.transactionId)) {
        throw validationFailed([
          { field: 'transactionId', constraints: ['unknown or deleted expense'] },
        ]);
      }
    }
    return this.mutateItem(actor, member, planId, itemId, null, 'UPDATE', (item) => {
      if (item.deletedAt) throw notFound('Item');
      return {
        ...this.changesOf(item),
        status: 'PURCHASED',
        paidPriceCents: input.paidPriceCents,
        purchasedAt,
        transactionId: input.transactionId ?? null,
      };
    });
  }

  /** Back to pending (wrong click, return): clears price, date and link. */
  async unpurchase(
    actor: Actor,
    member: MemberContext,
    planId: string,
    itemId: string,
  ): Promise<PurchasePlanView> {
    return this.mutateItem(actor, member, planId, itemId, null, 'UPDATE', (item) =>
      item.status !== 'PURCHASED' || item.deletedAt
        ? null
        : {
            ...this.changesOf(item),
            status: 'PENDING',
            paidPriceCents: null,
            purchasedAt: null,
            transactionId: null,
          },
    );
  }

  async setItemDeleted(
    actor: Actor,
    member: MemberContext,
    planId: string,
    itemId: string,
    deleted: boolean,
  ): Promise<PurchasePlanView> {
    return this.mutateItem(
      actor,
      member,
      planId,
      itemId,
      null,
      deleted ? 'DELETE' : 'RESTORE',
      (item) =>
        (item.deletedAt !== null) === deleted
          ? null
          : {
              ...this.changesOf(item),
              deletedAt: deleted ? this.clock.now() : null,
              deletedByMemberId: deleted ? member.memberId : null,
            },
    );
  }
}
