import { Injectable } from '@nestjs/common';
import type { SplitType } from '@couple-finance/shared';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import { SettlementsRepository } from './settlements.repository';
import {
  type MonthlyResponsibilityRow,
  type MonthlySpendRow,
  TransactionsRepository,
} from './transactions.repository';

export type { MonthlyResponsibilityRow, MonthlySpendRow };

/** One non-deleted expense as analytics needs it (no audit or form fields). */
export interface LedgerEntry {
  id: string;
  description: string;
  date: string;
  amountCents: number;
  categoryId: string;
  payerMemberId: string;
  splitType: SplitType;
  /** Responsibility per member, in stable member order; adds up to `amountCents`. */
  allocations: { memberId: string; amountCents: number }[];
}

/** A live expense created by an installment plan. */
export interface InstallmentEntry {
  installmentPlanId: string;
  installmentNumber: number;
  payoff: boolean;
  transactionId: string;
  date: string;
  amountCents: number;
}

/** A live expense created by confirming a recurring occurrence. */
export interface ConfirmationEntry {
  recurringExpenseId: string;
  occurrenceDate: string;
  transactionId: string;
  amountCents: number;
}

/** Per-member money flows (cents). Members without any flow are absent. */
export interface MemberFlows {
  memberId: string;
  paidCents: number;
  responsibleCents: number;
  settlementsSentCents: number;
  settlementsReceivedCents: number;
}

/**
 * Canonical read access to the ledger for analytics (MODULES.md: `LedgerQuery`). Every filter
 * here excludes soft-deleted records (ADR-008); callers never re-implement those rules.
 */
@Injectable()
export class LedgerQuery {
  constructor(
    private readonly transactions: TransactionsRepository,
    private readonly settlements: SettlementsRepository,
  ) {}

  async entries(householdId: string, from: string, to: string): Promise<LedgerEntry[]> {
    const records = await this.transactions.listInRange(householdId, from, to);
    return records.map((record) => ({
      id: record.id,
      description: record.description,
      date: record.date,
      amountCents: record.amountCents,
      categoryId: record.categoryId,
      payerMemberId: record.payerMemberId,
      splitType: record.split.type,
      allocations: record.allocations,
    }));
  }

  /** Settlement flows in [from, to] (or up to `to` when `from` is omitted). */
  async settlementFlows(
    householdId: string,
    to: string,
    from?: string,
  ): Promise<Map<string, { sentCents: number; receivedCents: number }>> {
    const totals = await this.settlements.totalsByMember(householdId, to, from);
    return new Map(totals.map((t) => [t.memberId, t]));
  }

  /** Every flow from the household's first record up to `upTo` (cumulative balance). */
  async cumulativeFlows(householdId: string, upTo: string): Promise<MemberFlows[]> {
    const [ledger, settlements] = await Promise.all([
      this.transactions.totalsByMember(householdId, upTo),
      this.settlements.totalsByMember(householdId, upTo),
    ]);
    const flows = new Map<string, MemberFlows>();
    const flowOf = (memberId: string): MemberFlows => {
      let flow = flows.get(memberId);
      if (!flow) {
        flow = {
          memberId,
          paidCents: 0,
          responsibleCents: 0,
          settlementsSentCents: 0,
          settlementsReceivedCents: 0,
        };
        flows.set(memberId, flow);
      }
      return flow;
    };
    for (const row of ledger) {
      const flow = flowOf(row.memberId);
      flow.paidCents += row.paidCents;
      flow.responsibleCents += row.responsibleCents;
    }
    for (const row of settlements) {
      const flow = flowOf(row.memberId);
      flow.settlementsSentCents += row.sentCents;
      flow.settlementsReceivedCents += row.receivedCents;
    }
    return [...flows.values()];
  }

  /**
   * Monthly aggregates for analytics over [from, to]: spend per month/category/payer/scope/origin
   * and shared-scope responsibility per month/member (ADR-016).
   */
  async monthlySpend(
    householdId: string,
    from: string,
    to: string,
  ): Promise<{ spend: MonthlySpendRow[]; responsibility: MonthlyResponsibilityRow[] }> {
    const [spend, responsibility] = await Promise.all([
      this.transactions.monthlySpend(householdId, from, to),
      this.transactions.monthlyResponsibility(householdId, from, to),
    ]);
    return { spend, responsibility };
  }

  /** Date of the household's earliest live expense, or null. */
  firstExpenseDate(householdId: string): Promise<string | null> {
    return this.transactions.firstDate(householdId);
  }

  hasAnyTransaction(householdId: string): Promise<boolean> {
    return this.transactions.hasAny(householdId);
  }

  async installments(
    householdId: string,
    planIds: readonly string[],
    tx?: TransactionContext,
  ): Promise<InstallmentEntry[]> {
    const records = await this.transactions.listByOrigin(
      householdId,
      { installmentPlanIds: planIds },
      tx ? { tx } : {},
    );
    return records.flatMap((record) =>
      record.origin?.kind === 'INSTALLMENT'
        ? [
            {
              installmentPlanId: record.origin.installmentPlanId,
              installmentNumber: record.origin.installmentNumber,
              payoff: record.origin.payoff,
              transactionId: record.id,
              date: record.date,
              amountCents: record.amountCents,
            },
          ]
        : [],
    );
  }

  async confirmations(
    householdId: string,
    recurringExpenseIds: readonly string[],
    tx?: TransactionContext,
  ): Promise<ConfirmationEntry[]> {
    const records = await this.transactions.listByOrigin(
      householdId,
      { recurringExpenseIds },
      tx ? { tx } : {},
    );
    return records.flatMap((record) =>
      record.origin?.kind === 'RECURRING'
        ? [
            {
              recurringExpenseId: record.origin.recurringExpenseId,
              occurrenceDate: record.origin.occurrenceDate,
              transactionId: record.id,
              amountCents: record.amountCents,
            },
          ]
        : [],
    );
  }

  /** Live expenses among `ids`, for links from other modules (e.g. purchase plan items). */
  async summaries(
    householdId: string,
    ids: readonly string[],
  ): Promise<Map<string, { id: string; description: string; amountCents: number; date: string }>> {
    const rows = await this.transactions.summaries(householdId, ids);
    return new Map(rows.map((row) => [row.id, row]));
  }
}
