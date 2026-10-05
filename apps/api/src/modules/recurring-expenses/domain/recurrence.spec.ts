import fc from 'fast-check';
import { addMonthsClamped, daysInMonth } from '../../../common/time/local-date';
import {
  type Confirmation,
  isScheduled,
  nextOpenOccurrence,
  occurrencesBetween,
  pause,
  type RecurrenceRule,
  RecurrenceError,
  resume,
  scheduledDates,
  statusOf,
} from './recurrence';

const monthly = (startDate: string, extra: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: 'MONTHLY',
  interval: 1,
  startDate,
  endDate: null,
  pauses: [],
  ...extra,
});

describe('scheduledDates', () => {
  it('clamps month ends from the anchor without drifting', () => {
    expect(scheduledDates(monthly('2026-01-31'), '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
    expect(scheduledDates(monthly('2024-01-31'), '2024-02-01', '2024-02-29')).toEqual([
      '2024-02-29',
    ]);
  });

  it('supports intervals, weekly and yearly rules', () => {
    expect(
      scheduledDates(monthly('2026-01-10', { interval: 3 }), '2026-01-01', '2026-12-31'),
    ).toEqual(['2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10']);
    expect(
      scheduledDates(
        { ...monthly('2026-10-01'), frequency: 'WEEKLY', interval: 2 },
        '2026-10-10',
        '2026-11-10',
      ),
    ).toEqual(['2026-10-15', '2026-10-29']);
    expect(
      scheduledDates({ ...monthly('2024-02-29'), frequency: 'YEARLY' }, '2024-01-01', '2028-12-31'),
    ).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('respects start and end dates', () => {
    const rule = monthly('2026-03-05', { endDate: '2026-06-04' });
    expect(scheduledDates(rule, '2026-01-01', '2026-12-31')).toEqual([
      '2026-03-05',
      '2026-04-05',
      '2026-05-05',
    ]);
    expect(isScheduled(rule, '2026-04-05')).toBe(true);
    expect(isScheduled(rule, '2026-04-06')).toBe(false);
    expect(isScheduled(rule, '2026-06-05')).toBe(false);
  });

  it('matches the anchor formula for any window (property)', () => {
    // Days 1–31: months shorter than the day exercise clamping.
    const date = fc
      .record({
        year: fc.integer({ min: 2020, max: 2030 }),
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 1, max: 31 }),
      })
      .map(
        ({ year, month, day }) =>
          `${String(year)}-${String(month).padStart(2, '0')}-${String(
            Math.min(day, daysInMonth(year, month)),
          ).padStart(2, '0')}`,
      );
    fc.assert(
      fc.property(
        date,
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 1, max: 24 }),
        (start, interval, offset, span) => {
          const rule = monthly(start, { interval });
          const from = addMonthsClamped(start, offset);
          const to = addMonthsClamped(from, span);
          const expected: string[] = [];
          for (let i = 0; i <= 80; i += 1) {
            const d = addMonthsClamped(start, i * interval);
            if (d >= from && d <= to) expected.push(d);
          }
          expect(scheduledDates(rule, from, to)).toEqual(expected);
        },
      ),
    );
  });
});

describe('occurrencesBetween', () => {
  const today = '2026-10-15';
  const confirmations = new Map<string, Confirmation>([
    ['2026-08-10', { transactionId: 't-aug', amountCents: 9900 }],
  ]);

  it('classifies confirmed, skipped, overdue and upcoming occurrences', () => {
    const result = occurrencesBetween(
      monthly('2026-07-10'),
      '2026-07-01',
      '2026-12-31',
      today,
      confirmations,
      new Set(['2026-09-10']),
    );
    expect(result.map((o) => [o.date, o.status])).toEqual([
      ['2026-07-10', 'OVERDUE'],
      ['2026-08-10', 'CONFIRMED'],
      ['2026-09-10', 'SKIPPED'],
      ['2026-10-10', 'OVERDUE'],
      ['2026-11-10', 'UPCOMING'],
      ['2026-12-10', 'UPCOMING'],
    ]);
    expect(result[1]).toMatchObject({ transactionId: 't-aug', amountCents: 9900 });
  });

  it('omits open occurrences inside pauses but keeps confirmed ones', () => {
    const rule = monthly('2026-07-10', {
      pauses: [
        { from: '2026-08-01', to: '2026-09-15' },
        { from: '2026-12-01', to: null },
      ],
    });
    const result = occurrencesBetween(
      rule,
      '2026-07-01',
      '2027-01-31',
      today,
      confirmations,
      new Set(),
    );
    expect(result.map((o) => [o.date, o.status])).toEqual([
      ['2026-07-10', 'OVERDUE'],
      ['2026-08-10', 'CONFIRMED'],
      ['2026-10-10', 'OVERDUE'],
      ['2026-11-10', 'UPCOMING'],
    ]);
  });

  it('keeps confirmations that fall outside a shortened schedule', () => {
    const rule = monthly('2026-07-10', { endDate: '2026-07-31' });
    const result = occurrencesBetween(
      rule,
      '2026-07-01',
      '2026-12-31',
      today,
      confirmations,
      new Set(),
    );
    expect(result.map((o) => o.date)).toEqual(['2026-07-10', '2026-08-10']);
  });
});

describe('pause, resume and status', () => {
  it('pauses today and resumes with a closed window', () => {
    const rule = monthly('2026-01-10');
    const paused = { ...rule, pauses: pause(rule, '2026-10-15') };
    expect(statusOf(paused, '2026-10-20')).toBe('PAUSED');
    expect(() => pause(paused, '2026-10-16')).toThrow(RecurrenceError);
    const resumed = { ...paused, pauses: resume(paused, '2026-12-01') };
    expect(resumed.pauses).toEqual([{ from: '2026-10-15', to: '2026-12-01' }]);
    expect(statusOf(resumed, '2026-12-01')).toBe('ACTIVE');
    expect(nextOpenOccurrence(resumed, '2026-10-20', new Set())).toBe('2026-12-10');
  });

  it('drops a pause resumed on the day it started', () => {
    const rule = monthly('2026-01-10');
    const paused = { ...rule, pauses: pause(rule, '2026-10-15') };
    expect(resume(paused, '2026-10-15')).toEqual([]);
    expect(() => resume(rule, '2026-10-15')).toThrow(RecurrenceError);
  });

  it('is ended after the end date', () => {
    const rule = monthly('2026-01-10', { endDate: '2026-10-14' });
    expect(statusOf(rule, '2026-10-14')).toBe('ACTIVE');
    expect(statusOf(rule, '2026-10-15')).toBe('ENDED');
    expect(() => pause(rule, '2026-10-15')).toThrow(RecurrenceError);
    expect(nextOpenOccurrence(rule, '2026-10-15', new Set())).toBeNull();
  });

  it('skips handled dates when looking for the next occurrence', () => {
    expect(nextOpenOccurrence(monthly('2026-01-10'), '2026-10-10', new Set(['2026-10-10']))).toBe(
      '2026-11-10',
    );
  });
});
