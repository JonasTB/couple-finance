import fc from 'fast-check';
import {
  addDays,
  addMonthsClamped,
  compareLocalDates,
  daysBetween,
  daysInMonth,
  isLocalDate,
  isValidTimeZone,
  localDateIn,
  monthBounds,
  monthRange,
  monthsBetween,
  parseLocalDate,
  shiftMonth,
} from './local-date';

const localDateArb = fc
  .record({
    year: fc.integer({ min: 1900, max: 2200 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 31 }),
  })
  .map(({ year, month, day }) => {
    const clamped = Math.min(day, daysInMonth(year, month));
    return `${year}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
  });

describe('LocalDate', () => {
  describe('validation', () => {
    it.each(['2026-10-04', '2024-02-29', '0001-01-01'])('accepts %s', (value) => {
      expect(isLocalDate(value)).toBe(true);
    });

    it.each([
      '2026-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-10-32',
      '2026-1-4',
      '2026-10-04T00:00:00Z',
      '',
    ])('rejects %s', (value) => {
      expect(isLocalDate(value)).toBe(false);
    });

    it('throws a descriptive error when parsing invalid input', () => {
      expect(() => parseLocalDate('04/10/2026')).toThrow(/expected YYYY-MM-DD/);
    });
  });

  describe('addMonthsClamped', () => {
    it.each([
      ['2024-01-31', 1, '2024-02-29'],
      ['2025-01-31', 1, '2025-02-28'],
      ['2025-01-31', 2, '2025-03-31'],
      ['2025-03-31', -1, '2025-02-28'],
      ['2025-12-15', 1, '2026-01-15'],
      ['2026-01-15', -1, '2025-12-15'],
      ['2026-10-04', 0, '2026-10-04'],
      ['2026-10-04', 24, '2028-10-04'],
    ])('%s + %i months = %s', (date, months, expected) => {
      expect(addMonthsClamped(date, months)).toBe(expected);
    });

    it('never drifts when computed from the anchor (installment schedule)', () => {
      const schedule = Array.from({ length: 4 }, (_, k) => addMonthsClamped('2025-01-31', k));
      expect(schedule).toEqual(['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30']);
    });

    it('always yields a valid date that keeps the day or clamps it to month end', () => {
      fc.assert(
        fc.property(localDateArb, fc.integer({ min: -240, max: 240 }), (date, months) => {
          const result = addMonthsClamped(date, months);
          expect(isLocalDate(result)).toBe(true);
          const original = parseLocalDate(date);
          const shifted = parseLocalDate(result);
          const monthsBetween =
            shifted.year * 12 + shifted.month - (original.year * 12 + original.month);
          expect(monthsBetween).toBe(months);
          expect(shifted.day).toBe(
            Math.min(original.day, daysInMonth(shifted.year, shifted.month)),
          );
        }),
      );
    });

    it('rejects fractional months', () => {
      expect(() => addMonthsClamped('2026-10-04', 1.5)).toThrow(RangeError);
    });
  });

  it('compares dates in calendar order', () => {
    expect(compareLocalDates('2026-09-30', '2026-10-01')).toBe(-1);
    expect(compareLocalDates('2026-10-01', '2026-10-01')).toBe(0);
    expect(compareLocalDates('2027-01-01', '2026-12-31')).toBe(1);
  });

  describe('localDateIn', () => {
    // 2026-10-04T02:30Z is still 2026-10-03 in São Paulo (UTC-3).
    const instant = new Date('2026-10-04T02:30:00Z');

    it('uses the household time zone, not UTC', () => {
      expect(localDateIn('America/Sao_Paulo', instant)).toBe('2026-10-03');
      expect(localDateIn('UTC', instant)).toBe('2026-10-04');
      expect(localDateIn('Asia/Tokyo', instant)).toBe('2026-10-04');
    });

    it('rejects unknown time zones', () => {
      expect(isValidTimeZone('America/Sao_Paulo')).toBe(true);
      expect(isValidTimeZone('Mars/Olympus')).toBe(false);
      expect(() => localDateIn('Mars/Olympus', instant)).toThrow(/Unknown time zone/);
    });
  });

  describe('day and month arithmetic', () => {
    it('adds days across months, leap years and DST transitions', () => {
      expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
      expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
      expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
      // Brazilian and US DST switch dates never shift a calendar date.
      expect(addDays('2026-03-07', 7)).toBe('2026-03-14');
      expect(addDays('2026-11-01', 7)).toBe('2026-11-08');
    });

    it('counts days and months between dates', () => {
      expect(daysBetween('2026-01-01', '2026-03-01')).toBe(59);
      expect(daysBetween('2026-03-01', '2026-01-01')).toBe(-59);
      expect(monthsBetween('2026-01-31', '2026-03-01')).toBe(2);
      expect(monthsBetween('2026-12-15', '2026-01-15')).toBe(-11);
    });

    it('returns month bounds', () => {
      expect(monthBounds('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
      expect(monthBounds('2026-10-17')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    });

    it('shifts months and lists month ranges', () => {
      expect(shiftMonth('2026-01', -1)).toBe('2025-12');
      expect(shiftMonth('2025-11', 14)).toBe('2027-01');
      expect(monthRange('2025-11', '2026-02')).toEqual([
        '2025-11',
        '2025-12',
        '2026-01',
        '2026-02',
      ]);
      expect(monthRange('2026-02', '2026-02')).toEqual(['2026-02']);
      expect(monthRange('2026-03', '2026-02')).toEqual([]);
    });
  });
});
