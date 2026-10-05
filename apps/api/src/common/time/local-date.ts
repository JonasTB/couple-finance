/**
 * Calendar dates without time zone, as `YYYY-MM-DD` strings (ADR-003).
 * They are never converted through `Date`/UTC, which avoids off-by-one-day bugs.
 */
export type LocalDate = string;

interface DateParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of `month`; UTC avoids host time zone effects.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toParts(value: string): DateParts | null {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [, y, m, d] = match;
  const parts = { year: Number(y), month: Number(m), day: Number(d) };
  if (parts.year < 1 || parts.month < 1 || parts.month > 12) {
    return null;
  }
  if (parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month)) {
    return null;
  }
  return parts;
}

function format({ year, month, day }: DateParts): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isLocalDate(value: unknown): value is LocalDate {
  return typeof value === 'string' && toParts(value) !== null;
}

export function parseLocalDate(value: string): DateParts {
  const parts = toParts(value);
  if (!parts) {
    throw new RangeError(`Invalid local date: "${value}" (expected YYYY-MM-DD)`);
  }
  return parts;
}

/**
 * Adds calendar months, clamping the day to the target month's last day
 * (2024-01-31 + 1 month = 2024-02-29). Always compute from the original anchor date,
 * never by chaining results, or clamped days would drift.
 */
export function addMonthsClamped(date: LocalDate, months: number): LocalDate {
  if (!Number.isInteger(months)) {
    throw new RangeError('months must be an integer');
  }
  const { year, month, day } = parseLocalDate(date);
  const monthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = (monthIndex % 12) + 1;
  return format({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

function toUtcDays({ year, month, day }: DateParts): number {
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Adds calendar days (UTC arithmetic on the date only, so DST never shifts it). */
export function addDays(date: LocalDate, days: number): LocalDate {
  if (!Number.isInteger(days)) {
    throw new RangeError('days must be an integer');
  }
  const shifted = new Date((toUtcDays(parseLocalDate(date)) + days) * 86_400_000);
  return format({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return toUtcDays(parseLocalDate(b)) - toUtcDays(parseLocalDate(a));
}

/** Whole calendar months from the month of `a` to the month of `b` (days ignored). */
export function monthsBetween(a: LocalDate, b: LocalDate): number {
  const from = parseLocalDate(a);
  const to = parseLocalDate(b);
  return (to.year - from.year) * 12 + (to.month - from.month);
}

/** First and last day of the month of `date` (or of a `YYYY-MM` month). */
export function monthBounds(monthOrDate: string): { from: LocalDate; to: LocalDate } {
  const { year, month } = parseLocalDate(`${monthOrDate.slice(0, 7)}-01`);
  return {
    from: format({ year, month, day: 1 }),
    to: format({ year, month, day: daysInMonth(year, month) }),
  };
}

/** `YYYY-MM` shifted by whole months (negative goes back). */
export function shiftMonth(month: string, delta: number): string {
  return addMonthsClamped(`${month}-01`, delta).slice(0, 7);
}

/** Every `YYYY-MM` from `first` to `last`, inclusive (empty when `first` is later). */
export function monthRange(first: string, last: string): string[] {
  const count = monthsBetween(`${first}-01`, `${last}-01`) + 1;
  return Array.from({ length: Math.max(count, 0) }, (_, i) => shiftMonth(first, i));
}

export function compareLocalDates(a: LocalDate, b: LocalDate): number {
  // Valid YYYY-MM-DD strings sort lexicographically in calendar order.
  parseLocalDate(a);
  parseLocalDate(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date of `instant` as seen in the given IANA time zone. */
export function localDateIn(timeZone: string, instant: Date): LocalDate {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`Unknown time zone: "${timeZone}"`);
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return format({ year: get('year'), month: get('month'), day: get('day') });
}
