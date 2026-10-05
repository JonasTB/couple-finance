import { addMonths, capitalizeFirst, formatDate, formatMonth, monthRange, todayIn } from './dates';

describe('dates', () => {
  it('computes today in the household time zone, not UTC', () => {
    const instant = new Date('2026-10-04T02:30:00Z');
    expect(todayIn('America/Sao_Paulo', instant)).toBe('2026-10-03');
    expect(todayIn('UTC', instant)).toBe('2026-10-04');
  });

  it('formats calendar dates without shifting the day', () => {
    expect(formatDate('2026-03-01')).toBe('1 de março de 2026');
    expect(formatDate('2026-12-31', 'short')).toMatch(/^31 de dez/);
  });

  it('handles month ranges and navigation', () => {
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthRange('2026-04')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(formatMonth('2026-03')).toBe('março de 2026');
    expect(capitalizeFirst(formatMonth('2026-03'))).toBe('Março de 2026');
  });
});
