import fc from 'fast-check';
import { type Entry, goalProgress, savedAtMonthEnds, savedByMember, savedOf } from './goal';

const c = (date: string, amountCents: number, memberId = 'ana'): Entry => ({
  memberId,
  type: 'CONTRIBUTION',
  amountCents,
  date,
});
const w = (date: string, amountCents: number, memberId = 'ana'): Entry => ({
  memberId,
  type: 'WITHDRAWAL',
  amountCents,
  date,
});

const base = {
  targetCents: 1_200_000,
  targetDate: null,
  createdMonth: '2026-01',
  today: '2026-10-15',
  archived: false,
};

describe('savedAtMonthEnds (goal evolution, FR-AN-03)', () => {
  it('accumulates live entries through the end of each month', () => {
    const entries = [c('2026-07-31', 100_000), c('2026-08-01', 50_000), w('2026-09-15', 30_000)];
    expect(
      savedAtMonthEnds(entries, ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']),
    ).toEqual([0, 100_000, 150_000, 120_000, 120_000]);
  });
});

describe('goalProgress (CALCULATIONS §8)', () => {
  it('averages the last 3 complete months, excluding the current one', () => {
    const result = goalProgress({
      ...base,
      entries: [
        c('2026-06-05', 999_999), // outside the window
        c('2026-07-05', 100_000),
        c('2026-08-05', 50_000),
        w('2026-08-20', 20_000),
        c('2026-09-05', 110_000),
        c('2026-10-01', 500_000), // current month: counts as saved, not in the pace
      ],
    });
    expect(result.savedCents).toBe(1_739_999);
    expect(result).toMatchObject({ remainingCents: 0, progressBps: 10000, status: 'ACHIEVED' });
    expect(result.forecast).toMatchObject({ paceCents: 80_000, paceMonths: 3, monthsToGo: 0 });
  });

  it('forecasts the completion month and the monthly amount for a deadline', () => {
    const result = goalProgress({
      ...base,
      targetDate: '2027-03-31',
      entries: [c('2026-07-10', 100_000), c('2026-08-10', 100_000), c('2026-09-10', 100_000)],
    });
    // remaining 900.000 at 100.000/month → 9 months → July 2027.
    expect(result.forecast).toEqual({
      paceCents: 100_000,
      paceMonths: 3,
      monthsToGo: 9,
      forecastMonth: '2027-07',
      // Oct..Mar = 6 months left → 150.000/month.
      requiredMonthlyCents: 150_000,
      deadlinePassed: false,
    });
    expect(result.progressBps).toBe(2500);
  });

  it('uses fewer months for a recent goal and none in its first month', () => {
    const recent = goalProgress({
      ...base,
      createdMonth: '2026-09',
      entries: [c('2026-09-10', 30_000)],
    });
    expect(recent.forecast).toMatchObject({ paceCents: 30_000, paceMonths: 1, monthsToGo: 39 });

    const brandNew = goalProgress({
      ...base,
      createdMonth: '2026-10',
      entries: [c('2026-10-02', 30_000)],
    });
    expect(brandNew.forecast).toMatchObject({
      paceCents: null,
      paceMonths: 0,
      monthsToGo: null,
      forecastMonth: null,
    });
  });

  it('has no forecast at zero or negative pace', () => {
    const zero = goalProgress({ ...base, entries: [c('2026-05-10', 10_000)] });
    expect(zero.forecast).toMatchObject({ paceCents: 0, monthsToGo: null, forecastMonth: null });
    const negative = goalProgress({
      ...base,
      entries: [c('2026-05-10', 50_000), w('2026-09-10', 30_000)],
    });
    expect(negative.forecast).toMatchObject({ paceCents: -10_000, monthsToGo: null });
  });

  it('asks for everything now once the deadline passed', () => {
    const result = goalProgress({
      ...base,
      targetDate: '2026-09-30',
      entries: [c('2026-07-10', 200_000)],
    });
    expect(result.forecast).toMatchObject({
      requiredMonthlyCents: 1_000_000,
      deadlinePassed: true,
    });
    // A deadline this month leaves one month.
    const thisMonth = goalProgress({ ...base, targetDate: '2026-10-31', entries: [] });
    expect(thisMonth.forecast).toMatchObject({
      requiredMonthlyCents: 1_200_000,
      deadlinePassed: false,
    });
  });

  it('reports archived goals as archived', () => {
    expect(goalProgress({ ...base, archived: true, entries: [] }).status).toBe('ARCHIVED');
  });

  it('per-member totals add up to the saved amount (property)', () => {
    const entry = fc.record({
      memberId: fc.constantFrom('ana', 'bruno'),
      type: fc.constantFrom('CONTRIBUTION' as const, 'WITHDRAWAL' as const),
      amountCents: fc.integer({ min: 1, max: 10_000_000 }),
      date: fc.constantFrom('2026-07-01', '2026-08-15', '2026-09-30', '2026-10-10'),
    });
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 30 }), (entries) => {
        const byMember = savedByMember(entries, ['ana', 'bruno']);
        expect(byMember.reduce((s, m) => s + m.savedCents, 0)).toBe(savedOf(entries));
        const result = goalProgress({ ...base, entries });
        expect(result.progressBps).toBeGreaterThanOrEqual(0);
        expect(result.progressBps).toBeLessThanOrEqual(10000);
      }),
    );
  });
});
