import type { GoalEntryType, GoalForecast, GoalStatus } from '@couple-finance/shared';
import { addMonthsClamped, monthsBetween } from '../../../common/time/local-date';

/**
 * Goal progress and deterministic forecast (FR-GOAL-03, CALCULATIONS.md §8). Pure: no I/O.
 *
 * - saved = Σ contributions − Σ withdrawals (live entries);
 * - pace = average net amount per month over the last complete months: up to 3, never before
 *   the month the goal was created, the current month excluded;
 * - months to go = ⌈remaining / pace⌉ (BigInt), counted from next month;
 * - required monthly = ⌈remaining / months left⌉, months left counting the current month through
 *   the deadline month (at least 1, so a passed deadline asks for everything now).
 */

export const PACE_WINDOW_MONTHS = 3;

export interface Entry {
  memberId: string;
  type: GoalEntryType;
  amountCents: number;
  date: string;
}

const signed = (entry: Entry): number =>
  entry.type === 'CONTRIBUTION' ? entry.amountCents : -entry.amountCents;

const monthPlus = (month: string, delta: number): string =>
  addMonthsClamped(`${month}-01`, delta).slice(0, 7);

export function savedOf(entries: readonly Entry[]): number {
  return entries.reduce((sum, entry) => sum + signed(entry), 0);
}

/** Net saved per member, in first-seen order of `memberOrder` then of the entries. */
export function savedByMember(
  entries: readonly Entry[],
  memberOrder: readonly string[],
): { memberId: string; savedCents: number }[] {
  const totals = new Map<string, number>(memberOrder.map((id) => [id, 0]));
  for (const entry of entries) {
    totals.set(entry.memberId, (totals.get(entry.memberId) ?? 0) + signed(entry));
  }
  return [...totals.entries()].map(([memberId, savedCents]) => ({ memberId, savedCents }));
}

/** Saved at the end of each `YYYY-MM` month (ascending): live entries dated in or before it. */
export function savedAtMonthEnds(entries: readonly Entry[], months: readonly string[]): number[] {
  return months.map((month) => savedOf(entries.filter((entry) => entry.date.slice(0, 7) <= month)));
}

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

export function goalProgress(input: {
  entries: readonly Entry[];
  targetCents: number;
  targetDate: string | null;
  /** `YYYY-MM` the goal was created in (household time zone). */
  createdMonth: string;
  /** Today in the household time zone. */
  today: string;
  archived: boolean;
}): {
  savedCents: number;
  remainingCents: number;
  progressBps: number;
  status: GoalStatus;
  forecast: GoalForecast;
} {
  const saved = savedOf(input.entries);
  const remaining = Math.max(input.targetCents - saved, 0);
  const progressBps = Math.min(
    10000,
    Math.max(0, Number((BigInt(saved) * 10000n) / BigInt(input.targetCents))),
  );
  const current = input.today.slice(0, 7);

  // Pace window: [max(created, current − 3), current − 1].
  const earliest = monthPlus(current, -PACE_WINDOW_MONTHS);
  const start = input.createdMonth > earliest ? input.createdMonth : earliest;
  const end = monthPlus(current, -1);
  const paceMonths = start <= end ? monthsBetween(`${start}-01`, `${end}-01`) + 1 : 0;
  const net = input.entries
    .filter((entry) => {
      const month = entry.date.slice(0, 7);
      return month >= start && month <= end;
    })
    .reduce((sum, entry) => sum + signed(entry), 0);

  let monthsToGo: number | null = null;
  let forecastMonth: string | null = null;
  if (remaining === 0) {
    monthsToGo = 0;
  } else if (paceMonths > 0 && net > 0) {
    // remaining / (net / paceMonths), rounded up.
    monthsToGo = Number(ceilDiv(BigInt(remaining) * BigInt(paceMonths), BigInt(net)));
    forecastMonth = monthPlus(current, monthsToGo);
  }

  let requiredMonthlyCents: number | null = null;
  const deadlinePassed =
    input.targetDate !== null && input.targetDate < input.today && remaining > 0;
  if (input.targetDate !== null && remaining > 0) {
    const monthsLeft = Math.max(
      1,
      monthsBetween(`${current}-01`, `${input.targetDate.slice(0, 7)}-01`) + 1,
    );
    requiredMonthlyCents = Number(ceilDiv(BigInt(remaining), BigInt(monthsLeft)));
  }

  return {
    savedCents: saved,
    remainingCents: remaining,
    progressBps,
    status: input.archived ? 'ARCHIVED' : remaining === 0 ? 'ACHIEVED' : 'ACTIVE',
    forecast: {
      paceCents: paceMonths > 0 ? Math.floor(net / paceMonths) : null,
      paceMonths,
      monthsToGo,
      forecastMonth,
      requiredMonthlyCents,
      deadlinePassed,
    },
  };
}
