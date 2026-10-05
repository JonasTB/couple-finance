import { Injectable } from '@nestjs/common';
import {
  type HouseholdIncomeOverview,
  type IncomeRecordView,
  type MemberIncomeView,
} from '@couple-finance/shared';
import { type Actor } from '../../../common/auth/current-actor.decorator';
import { UnitOfWork } from '../../../common/database/unit-of-work';
import { validationFailed } from '../../../common/errors/app.exception';
import { IdGenerator } from '../../../common/ids/id-generator';
import { Clock } from '../../../common/time/clock';
import { localDateIn } from '../../../common/time/local-date';
import { AuditRecorder } from '../../audit/public';
import { HouseholdDirectory, type MemberContext } from '../../households/public';
import { incomeSharesBps } from '../domain/income-basis';
import { type IncomeRecord, IncomesRepository } from './incomes.repository';

function toView(record: IncomeRecord): IncomeRecordView {
  return {
    id: record.id,
    monthlyAmountCents: record.monthlyAmountCents,
    effectiveFrom: record.effectiveFrom,
    effectiveTo: record.effectiveTo,
  };
}

function snapshot(record: IncomeRecord): Record<string, unknown> {
  return { memberId: record.memberId, ...toView(record) };
}

/**
 * Effective-dated monthly income per member (FR-INC-01..04). Only the member themselves can
 * change their income; partners see amounts only under EXACT visibility.
 */
@Injectable()
export class IncomesService {
  constructor(
    private readonly incomes: IncomesRepository,
    private readonly directory: HouseholdDirectory,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditRecorder,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async todayIn(householdId: string): Promise<string> {
    const household = await this.directory.household(householdId);
    return localDateIn(household?.timezone ?? 'UTC', this.clock.now());
  }

  async overview(context: MemberContext, date?: string): Promise<HouseholdIncomeOverview> {
    const onDate = date ?? (await this.todayIn(context.householdId));
    const active = (await this.directory.members(context.householdId)).filter(
      (member) => member.status === 'ACTIVE',
    );
    const records = await this.incomes.effectiveOn(
      context.householdId,
      active.map((member) => member.id),
      onDate,
    );
    const amounts = new Map(records.map((record) => [record.memberId, record.monthlyAmountCents]));
    const everyoneHasIncome = active.every((member) => amounts.has(member.id));
    const shares = everyoneHasIncome
      ? incomeSharesBps(active.map((member) => amounts.get(member.id) ?? 0))
      : null;

    const members: MemberIncomeView[] = active.map((member, index) => {
      const isMe = member.id === context.memberId;
      const amount = amounts.get(member.id) ?? null;
      const visible = isMe || member.incomeVisibility === 'EXACT';
      return {
        memberId: member.id,
        isMe,
        visibility: member.incomeVisibility,
        hasIncome: amount !== null,
        monthlyAmountCents: visible ? amount : null,
        shareBps: shares?.[index] ?? null,
      };
    });
    return { date: onDate, members };
  }

  async myHistory(context: MemberContext): Promise<IncomeRecordView[]> {
    return (await this.incomes.listForMember(context.memberId)).map(toView);
  }

  /**
   * Appends a new income period starting at `effectiveFrom`, closing the current one.
   * Same start date as the latest record → corrects its amount. Earlier dates are rejected:
   * history is corrected by removing the latest record (BUSINESS_RULES 5).
   */
  async add(
    actor: Actor,
    context: MemberContext,
    input: { monthlyAmountCents: number; effectiveFrom: string },
  ): Promise<IncomeRecordView> {
    return this.uow.run(async (tx) => {
      const [latest] = await this.incomes.listForMember(context.memberId, { tx, lock: true });
      if (latest && input.effectiveFrom < latest.effectiveFrom) {
        throw validationFailed([
          {
            field: 'effectiveFrom',
            constraints: [
              `must be on or after ${latest.effectiveFrom} (remove the latest record to correct earlier history)`,
            ],
          },
        ]);
      }
      if (latest?.effectiveFrom === input.effectiveFrom) {
        const updated = { ...latest, monthlyAmountCents: input.monthlyAmountCents };
        await this.incomes.update(tx, latest.id, { monthlyAmountCents: input.monthlyAmountCents });
        await this.audit.record(tx, actor, {
          householdId: context.householdId,
          entityType: 'INCOME_RECORD',
          entityId: latest.id,
          action: 'UPDATE',
          before: snapshot(latest),
          after: snapshot(updated),
        });
        return toView(updated);
      }
      if (latest && latest.effectiveTo === null) {
        await this.incomes.update(tx, latest.id, { effectiveTo: input.effectiveFrom });
        await this.audit.record(tx, actor, {
          householdId: context.householdId,
          entityType: 'INCOME_RECORD',
          entityId: latest.id,
          action: 'UPDATE',
          before: snapshot(latest),
          after: snapshot({ ...latest, effectiveTo: input.effectiveFrom }),
        });
      }
      const record: IncomeRecord = {
        id: this.ids.next(),
        householdId: context.householdId,
        memberId: context.memberId,
        monthlyAmountCents: input.monthlyAmountCents,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
      };
      await this.incomes.insert(tx, record);
      await this.audit.record(tx, actor, {
        householdId: context.householdId,
        entityType: 'INCOME_RECORD',
        entityId: record.id,
        action: 'CREATE',
        after: snapshot(record),
      });
      return toView(record);
    });
  }

  /** Removes the member's latest record and reopens the previous period. */
  async removeLatest(actor: Actor, context: MemberContext, recordId: string): Promise<void> {
    await this.uow.run(async (tx) => {
      const [latest, previous] = await this.incomes.listForMember(context.memberId, {
        tx,
        lock: true,
      });
      if (latest?.id !== recordId) {
        throw validationFailed([
          {
            field: 'recordId',
            constraints: ['only your most recent income record can be removed'],
          },
        ]);
      }
      await this.incomes.softDelete(tx, latest.id, this.clock.now());
      await this.audit.record(tx, actor, {
        householdId: context.householdId,
        entityType: 'INCOME_RECORD',
        entityId: latest.id,
        action: 'DELETE',
        before: snapshot(latest),
      });
      if (previous) {
        await this.incomes.update(tx, previous.id, { effectiveTo: null });
        await this.audit.record(tx, actor, {
          householdId: context.householdId,
          entityType: 'INCOME_RECORD',
          entityId: previous.id,
          action: 'UPDATE',
          before: snapshot(previous),
          after: snapshot({ ...previous, effectiveTo: null }),
        });
      }
    });
  }
}
