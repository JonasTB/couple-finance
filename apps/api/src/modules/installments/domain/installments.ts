import {
  type CommitmentMonth,
  INSTALLMENT_MAX_COUNT,
  INSTALLMENT_MIN_COUNT,
  type InstallmentPlanStatus,
  MAX_AMOUNT_CENTS,
  type ReleaseMonth,
} from '@couple-finance/shared';
import { addMonthsClamped, type LocalDate } from '../../../common/time/local-date';

/**
 * Installment plans (ADR-007, CALCULATIONS.md §5). Pure: no I/O.
 * A plan is finite (2–72 installments), so its installments are created up front.
 */

export class InstallmentError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ScheduleInput {
  totalAmountCents?: number;
  installmentAmountCents?: number;
  installmentCount: number;
  firstInstallmentDate: LocalDate;
}

export interface ScheduledInstallment {
  number: number;
  date: LocalDate;
  amountCents: number;
}

/**
 * Amounts and dates (FR-INST-01/02):
 * - from the installment amount I: total = I × n, every installment is I;
 * - from the total T: base = ⌊T / n⌋, installment 1 = base + (T − base × n), the rest = base.
 * Installment k falls on firstDate + (k − 1) months, clamped, always from the first date.
 */
export function scheduleInstallments(input: ScheduleInput): {
  totalAmountCents: number;
  installments: ScheduledInstallment[];
} {
  const n = input.installmentCount;
  if (!Number.isInteger(n) || n < INSTALLMENT_MIN_COUNT || n > INSTALLMENT_MAX_COUNT) {
    throw new InstallmentError(
      'installmentCount',
      `must be between ${String(INSTALLMENT_MIN_COUNT)} and ${String(INSTALLMENT_MAX_COUNT)}`,
    );
  }
  const hasTotal = input.totalAmountCents !== undefined;
  if (hasTotal === (input.installmentAmountCents !== undefined)) {
    throw new InstallmentError(
      'totalAmountCents',
      'send exactly one of totalAmountCents or installmentAmountCents',
    );
  }
  let amounts: number[];
  let total: number;
  if (input.totalAmountCents !== undefined) {
    total = input.totalAmountCents;
    if (!Number.isSafeInteger(total) || total < n || total > MAX_AMOUNT_CENTS) {
      throw new InstallmentError(
        'totalAmountCents',
        'must be at least one cent per installment and within the amount limit',
      );
    }
    const base = Math.floor(total / n);
    amounts = Array.from({ length: n }, (_, i) => (i === 0 ? base + (total - base * n) : base));
  } else {
    const each = input.installmentAmountCents ?? 0;
    total = each * n;
    if (!Number.isSafeInteger(each) || each < 1 || total > MAX_AMOUNT_CENTS) {
      throw new InstallmentError(
        'installmentAmountCents',
        'must be positive and the total within the amount limit',
      );
    }
    amounts = Array.from({ length: n }, () => each);
  }
  return {
    totalAmountCents: total,
    installments: amounts.map((amountCents, i) => ({
      number: i + 1,
      date: addMonthsClamped(input.firstInstallmentDate, i),
      amountCents,
    })),
  };
}

/** The regular installment (2..n); with the remainder rule it is ⌊T / n⌋. */
export function regularInstallment(originalTotalCents: number, installmentCount: number): number {
  return Math.floor(originalTotalCents / installmentCount);
}

/** A live expense of the plan. */
export interface PlanInstallment {
  number: number;
  date: LocalDate;
  amountCents: number;
  payoff: boolean;
}

export interface PlanProgress {
  totalCents: number;
  paidCount: number;
  paidCents: number;
  remainingCount: number;
  remainingCents: number;
  next: PlanInstallment | null;
  releaseMonth: string | null;
  status: InstallmentPlanStatus;
}

const monthOf = (date: LocalDate): string => date.slice(0, 7);

/**
 * Date-based progress (FR-INST-03): an installment dated up to today counts as paid; a payoff
 * counts for every installment it replaced. The
 * release month is the month after the last live installment.
 */
export function planProgress(
  installments: readonly PlanInstallment[],
  today: LocalDate,
  closeKind: 'CANCEL' | 'PAY_OFF' | null,
  installmentCount: number,
): PlanProgress {
  // A payoff expense stands for installments `number..count`, so it counts as all of them.
  const units = (i: PlanInstallment) => (i.payoff ? installmentCount - i.number + 1 : 1);
  const sorted = [...installments].sort(
    (a, b) => a.date.localeCompare(b.date) || a.number - b.number,
  );
  const paid = sorted.filter((i) => i.date <= today);
  const remaining = sorted.filter((i) => i.date > today);
  const sum = (items: readonly PlanInstallment[]) => items.reduce((t, i) => t + i.amountCents, 0);
  const last = sorted[sorted.length - 1];
  return {
    totalCents: sum(sorted),
    paidCount: paid.reduce((t, i) => t + units(i), 0),
    paidCents: sum(paid),
    remainingCount: remaining.reduce((t, i) => t + units(i), 0),
    remainingCents: sum(remaining),
    next: remaining[0] ?? null,
    releaseMonth: last ? monthOf(addMonthsClamped(last.date, 1)) : null,
    status:
      closeKind === 'CANCEL'
        ? 'CANCELLED'
        : closeKind === 'PAY_OFF'
          ? 'PAID_OFF'
          : remaining.length > 0
            ? 'ACTIVE'
            : 'COMPLETED',
  };
}

export interface SummaryPlan {
  id: string;
  description: string;
  installments: readonly PlanInstallment[];
}

/**
 * Monthly commitment for the current month and the next 11, and upcoming releases
 * (CALCULATIONS.md §5): "R$ 420/mês liberados em dezembro". The released amount of a plan is its
 * last live installment, i.e. what stops being charged.
 */
export function commitmentSummary(
  plans: readonly SummaryPlan[],
  currentMonth: string,
): { months: CommitmentMonth[]; releases: ReleaseMonth[] } {
  const months: CommitmentMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: monthOf(addMonthsClamped(`${currentMonth}-01`, i)),
    installmentsCents: 0,
    activePlans: 0,
  }));
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const releases = new Map<string, ReleaseMonth>();

  for (const plan of plans) {
    const touched = new Set<string>();
    for (const installment of plan.installments) {
      const month = byMonth.get(monthOf(installment.date));
      if (month) {
        month.installmentsCents += installment.amountCents;
        touched.add(month.month);
      }
    }
    for (const month of touched) {
      const entry = byMonth.get(month);
      if (entry) entry.activePlans += 1;
    }
    const last = [...plan.installments].sort(
      (a, b) => a.date.localeCompare(b.date) || a.number - b.number,
    )[plan.installments.length - 1];
    if (!last) continue;
    const releaseMonth = monthOf(addMonthsClamped(last.date, 1));
    if (releaseMonth <= currentMonth) continue;
    const release = releases.get(releaseMonth) ?? {
      month: releaseMonth,
      releasedCents: 0,
      plans: [],
    };
    release.releasedCents += last.amountCents;
    release.plans.push({
      id: plan.id,
      description: plan.description,
      installmentAmountCents: last.amountCents,
    });
    releases.set(releaseMonth, release);
  }
  return {
    months,
    releases: [...releases.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}
