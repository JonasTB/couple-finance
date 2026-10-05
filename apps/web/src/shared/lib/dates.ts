/** Calendar dates are `YYYY-MM-DD` strings (ADR-003); never converted through local time. */

/** Today's calendar date in the household time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function asUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

/** "2026-03-10" → "10 de março de 2026" (or a shorter style). */
export function formatDate(date: string, style: 'long' | 'short' | 'weekday' = 'long'): string {
  const options: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
      : style === 'weekday'
        ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }
        : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat('pt-BR', options).format(asUtc(date));
}

/** "2026-03" for a date. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** First and last day of a `YYYY-MM` month. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year ?? 1970, monthNumber ?? 1, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const index = (year ?? 1970) * 12 + (monthNumber ?? 1) - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(asUtc(`${month}-01`));
}

/** Sentence case for pt-BR labels: only the first letter ("Outubro de 2026", not "Outubro De 2026"). */
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

/** Compact axis label: "2026-10" → "out/26". */
export function formatMonthShort(month: string): string {
  const name = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
    .format(asUtc(`${month}-01`))
    .replace('.', '');
  return `${name}/${month.slice(2, 4)}`;
}
