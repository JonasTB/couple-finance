import type {
  OccurrenceStatus,
  PauseWindow,
  RecurrenceFrequency,
  RecurringStatus,
} from '@couple-finance/shared';
import {
  addDays,
  addMonthsClamped,
  daysBetween,
  type LocalDate,
  monthsBetween,
} from '../../../common/time/local-date';

/**
 * Recurrence rules (ADR-007, CALCULATIONS.md §6). Pure: no I/O.
 *
 * Occurrences are never stored: they are computed for a bounded window. Every date is derived
 * from the start date (never chained), so clamped days do not drift: a rule starting on 31 Jan
 * falls on 28/29 Feb and again on 31 Mar.
 */

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: LocalDate;
  endDate: LocalDate | null;
  pauses: PauseWindow[];
}

/** Hard stop for a single expansion; windows are capped at 24 months by the API anyway. */
const MAX_OCCURRENCES = 2_000;

/** Scheduled dates in [from, to] (inclusive), from start to end date, ignoring pauses. */
export function scheduledDates(rule: RecurrenceRule, from: LocalDate, to: LocalDate): LocalDate[] {
  const last = rule.endDate !== null && rule.endDate < to ? rule.endDate : to;
  const first = rule.startDate > from ? rule.startDate : from;
  if (first > last) {
    return [];
  }
  const dates: LocalDate[] = [];
  if (rule.frequency === 'WEEKLY') {
    const step = 7 * rule.interval;
    let i = Math.max(0, Math.floor(daysBetween(rule.startDate, first) / step));
    for (let n = 0; n < MAX_OCCURRENCES; n += 1, i += 1) {
      const date = addDays(rule.startDate, i * step);
      if (date > last) break;
      if (date >= first) dates.push(date);
    }
    return dates;
  }
  const step = rule.interval * (rule.frequency === 'YEARLY' ? 12 : 1);
  // Start one step early: clamping can pull a date back into the window's first month.
  let i = Math.max(0, Math.floor(monthsBetween(rule.startDate, first) / step) - 1);
  for (let n = 0; n < MAX_OCCURRENCES; n += 1, i += 1) {
    const date = addMonthsClamped(rule.startDate, i * step);
    if (date > last) break;
    if (date >= first) dates.push(date);
  }
  return dates;
}

export function isScheduled(rule: RecurrenceRule, date: LocalDate): boolean {
  return scheduledDates(rule, date, date).length === 1;
}

export function isPaused(rule: RecurrenceRule, date: LocalDate): boolean {
  return rule.pauses.some((pause) => date >= pause.from && (pause.to === null || date < pause.to));
}

export function openPause(rule: RecurrenceRule): PauseWindow | undefined {
  return rule.pauses.find((pause) => pause.to === null);
}

export function statusOf(rule: RecurrenceRule, today: LocalDate): RecurringStatus {
  if (rule.endDate !== null && rule.endDate < today) return 'ENDED';
  if (openPause(rule)) return 'PAUSED';
  return 'ACTIVE';
}

/** Starts a pause today (occurrences from today on are not expected while it lasts). */
export function pause(rule: RecurrenceRule, today: LocalDate): PauseWindow[] {
  if (openPause(rule)) {
    throw new RecurrenceError('already paused');
  }
  if (statusOf(rule, today) === 'ENDED') {
    throw new RecurrenceError('already ended');
  }
  return [...rule.pauses, { from: today, to: null }];
}

/** Ends the open pause today; a pause opened and closed on the same day leaves no trace. */
export function resume(rule: RecurrenceRule, today: LocalDate): PauseWindow[] {
  const current = openPause(rule);
  if (!current) {
    throw new RecurrenceError('not paused');
  }
  return rule.pauses.flatMap((window) => {
    if (window !== current) return [window];
    return window.from >= today ? [] : [{ from: window.from, to: today }];
  });
}

export class RecurrenceError extends Error {}

export interface Confirmation {
  transactionId: string;
  amountCents: number;
}

export interface Occurrence {
  date: LocalDate;
  status: OccurrenceStatus;
  transactionId: string | null;
  amountCents: number | null;
}

/**
 * Occurrences in [from, to] with their state (FR-REC-05):
 * - CONFIRMED: a live expense exists (shown even if later paused or ended);
 * - SKIPPED: a member chose not to record it;
 * - OVERDUE: before today and still open; UPCOMING: today or later and open.
 * Open occurrences inside a pause are not expected, so they are omitted.
 */
export function occurrencesBetween(
  rule: RecurrenceRule,
  from: LocalDate,
  to: LocalDate,
  today: LocalDate,
  confirmations: ReadonlyMap<LocalDate, Confirmation>,
  skips: ReadonlySet<LocalDate>,
): Occurrence[] {
  const dates = new Set(scheduledDates(rule, from, to));
  // A confirmation outside the current schedule (e.g. the end date moved earlier) stays visible.
  for (const date of confirmations.keys()) {
    if (date >= from && date <= to) dates.add(date);
  }
  return [...dates].sort().flatMap((date): Occurrence[] => {
    const confirmed = confirmations.get(date);
    if (confirmed) {
      return [
        {
          date,
          status: 'CONFIRMED',
          transactionId: confirmed.transactionId,
          amountCents: confirmed.amountCents,
        },
      ];
    }
    if (skips.has(date)) {
      return [{ date, status: 'SKIPPED', transactionId: null, amountCents: null }];
    }
    if (isPaused(rule, date)) {
      return [];
    }
    return [
      {
        date,
        status: date < today ? 'OVERDUE' : 'UPCOMING',
        transactionId: null,
        amountCents: null,
      },
    ];
  });
}

/** Next open occurrence on or after today within 24 months, or null. */
export function nextOpenOccurrence(
  rule: RecurrenceRule,
  today: LocalDate,
  handled: ReadonlySet<LocalDate>,
): LocalDate | null {
  return (
    scheduledDates(rule, today, addMonthsClamped(today, 24)).find(
      (date) => !handled.has(date) && !isPaused(rule, date),
    ) ?? null
  );
}
