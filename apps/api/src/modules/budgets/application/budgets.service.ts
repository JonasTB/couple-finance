import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type BudgetChangeInput,
  type BudgetMonthView,
  type BudgetStatusView,
  type CategoryView,
  ErrorCode,
} from '@couple-finance/shared';
import { QueryFailedError } from 'typeorm';
import { type Actor } from '../../../common/auth/current-actor.decorator';
import { UnitOfWork } from '../../../common/database/unit-of-work';
import { AppException, validationFailed } from '../../../common/errors/app.exception';
import { IdGenerator } from '../../../common/ids/id-generator';
import { Clock } from '../../../common/time/clock';
import { addMonthsClamped, localDateIn, monthBounds } from '../../../common/time/local-date';
import { AuditRecorder } from '../../audit/public';
import { CategoriesService } from '../../categories/public';
import { HouseholdDirectory, type MemberContext } from '../../households/public';
import { LedgerQuery } from '../../transactions/public';
import { budgetStatus, effectiveIn, nextChange, planChange } from '../domain/budget';
import { type BudgetRecord, BudgetsRepository } from './budgets.repository';

const ENTITY_TYPE = 'BUDGET';
const PG_EXCLUSION_VIOLATION = '23P01';

const previousMonth = (month: string): string => addMonthsClamped(`${month}-01`, -1).slice(0, 7);

interface CategoryInfo {
  name: string;
  archived: boolean;
  /** The category and its subcategories (FR-BUD-01). */
  subtree: Set<string>;
}

function categoryIndex(tree: readonly CategoryView[]): Map<string, CategoryInfo> {
  const index = new Map<string, CategoryInfo>();
  for (const parent of tree) {
    index.set(parent.id, {
      name: parent.name,
      archived: parent.archived,
      subtree: new Set([parent.id, ...parent.children.map((c) => c.id)]),
    });
    for (const child of parent.children) {
      index.set(child.id, {
        name: `${parent.name} › ${child.name}`,
        archived: child.archived,
        subtree: new Set([child.id]),
      });
    }
  }
  return index;
}

const lineKey = (categoryId: string | null): string => categoryId ?? 'TOTAL';

/**
 * Monthly budgets (FR-BUD-01..04, ADR-009: computed on read). Spend is the shared scope
 * (split ≠ INDIVIDUAL) of the month, with subcategories; there is no rollover between months.
 * Changes apply from the current month or later, so past months are never rewritten.
 */
@Injectable()
export class BudgetsService {
  constructor(
    private readonly budgets: BudgetsRepository,
    private readonly directory: HouseholdDirectory,
    private readonly categories: CategoriesService,
    private readonly ledger: LedgerQuery,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditRecorder,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  private async currentMonth(householdId: string): Promise<string> {
    const household = await this.directory.household(householdId);
    if (!household) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Household not found.', HttpStatus.NOT_FOUND);
    }
    return localDateIn(household.timezone, this.clock.now()).slice(0, 7);
  }

  async month(member: MemberContext, requested?: string): Promise<BudgetMonthView> {
    const current = await this.currentMonth(member.householdId);
    const month = requested ?? current;
    const { from, to } = monthBounds(month);
    const [records, tree, entries] = await Promise.all([
      this.budgets.list(member.householdId),
      this.categories.list(member.householdId, true),
      this.ledger.entries(member.householdId, from, to),
    ]);
    const categories = categoryIndex(tree);
    const shared = entries.filter((entry) => entry.splitType !== 'INDIVIDUAL');

    const lines = new Map<string, BudgetRecord[]>();
    for (const record of records) {
      const key = lineKey(record.categoryId);
      lines.set(key, [...(lines.get(key) ?? []), record]);
    }

    const data: BudgetStatusView[] = [];
    for (const periods of lines.values()) {
      const period = effectiveIn(periods, month);
      if (!period) continue;
      const category = period.categoryId ? categories.get(period.categoryId) : undefined;
      const spentCents = shared
        .filter((entry) => !category || category.subtree.has(entry.categoryId))
        .reduce((sum, entry) => sum + entry.amountCents, 0);
      data.push({
        id: period.id,
        categoryId: period.categoryId,
        categoryName: period.categoryId ? (category?.name ?? '—') : null,
        categoryArchived: category?.archived ?? false,
        amountCents: period.amountCents,
        spentCents,
        ...budgetStatus(period.amountCents, spentCents),
        fromMonth: period.fromMonth,
        toMonth: period.untilMonth ? previousMonth(period.untilMonth) : null,
        next: nextChange(periods, period),
      });
    }
    data.sort((a, b) =>
      a.categoryId === null
        ? -1
        : b.categoryId === null
          ? 1
          : (a.categoryName ?? '').localeCompare(b.categoryName ?? '', 'pt-BR'),
    );
    return { month, editable: month >= current, data };
  }

  /** "From `fromMonth` on, this line's budget is `amountCents`" (null removes it). */
  async change(
    actor: Actor,
    member: MemberContext,
    input: BudgetChangeInput,
  ): Promise<BudgetMonthView> {
    const current = await this.currentMonth(member.householdId);
    if (input.fromMonth < current) {
      throw validationFailed([
        {
          field: 'fromMonth',
          constraints: ['past months cannot change; use the current month or later'],
        },
      ]);
    }
    if (input.categoryId && input.amountCents !== null) {
      await this.categories.assertUsable(member.householdId, input.categoryId);
    }
    try {
      await this.uow.run(async (tx) => {
        // Locks the household's live periods; a first-ever line is guarded by the exclusion.
        const all = await this.budgets.list(member.householdId, tx);
        const periods = all.filter((p) => p.categoryId === input.categoryId);
        const plan = planChange(periods, input.fromMonth, input.amountCents);
        if (!plan) return;
        const now = this.clock.now();
        await this.budgets.softDelete(tx, plan.remove, now, member.memberId);
        if (plan.truncate) {
          await this.budgets.setUntil(tx, plan.truncate.id, plan.truncate.untilMonth);
        }
        let createdId: string | null = null;
        if (plan.create) {
          createdId = this.ids.next();
          await this.budgets.insert(tx, {
            id: createdId,
            householdId: member.householdId,
            categoryId: input.categoryId,
            amountCents: plan.create.amountCents,
            fromMonth: plan.create.fromMonth,
            untilMonth: null,
            createdByMemberId: member.memberId,
          });
        }
        const after = (await this.budgets.list(member.householdId, tx)).filter(
          (p) => p.categoryId === input.categoryId,
        );
        await this.audit.record(tx, actor, {
          householdId: member.householdId,
          entityType: ENTITY_TYPE,
          entityId: createdId ?? plan.truncate?.id ?? plan.remove[0] ?? member.householdId,
          action: periods.length === 0 ? 'CREATE' : after.length === 0 ? 'DELETE' : 'UPDATE',
          before: { categoryId: input.categoryId, fromMonth: input.fromMonth, periods },
          after: { categoryId: input.categoryId, fromMonth: input.fromMonth, periods: after },
        });
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === PG_EXCLUSION_VIOLATION
      ) {
        throw new AppException(
          ErrorCode.CONFLICT,
          'The budget changed concurrently. Reload and try again.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
    return this.month(member, input.fromMonth);
  }
}
