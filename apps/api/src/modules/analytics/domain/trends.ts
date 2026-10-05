import {
  ANALYTICS_AVERAGE_MONTHS,
  type AnalyticsAverages,
  type AnalyticsCategory,
  type AnalyticsCategoryComparison,
  type AnalyticsComparison,
  type AnalyticsMonth,
  type AnalyticsPeriod,
  type MemberStatus,
} from '@couple-finance/shared';
import { allocateLargestRemainder } from '../../../common/money/allocation';
import { shiftMonth } from '../../../common/time/local-date';
import { type CategoryInfo, TOTAL_BPS } from './contribution';

/**
 * Historical analytics over a window of months (CALCULATIONS.md §11, ADR-016). Pure: no I/O.
 *
 * - Spend is the shared scope (split type ≠ INDIVIDUAL); individual spend is only reported apart.
 * - Fixed = expenses created by a recurring expense or an installment plan (their origin);
 *   variable = every other expense. A manually entered rent counts as variable.
 * - Ratios are bps truncated toward zero (BigInt); shares use largest remainder (§1).
 * - Averages use closed months on or after the first recorded expense, so months before the
 *   household started recording never pull an average down.
 */

export type SpendOrigin = 'RECURRING' | 'INSTALLMENT' | 'NONE';

/** Sum of live expenses sharing month, category, payer, scope and origin. */
export interface SpendFact {
  month: string;
  categoryId: string;
  payerMemberId: string;
  shared: boolean;
  origin: SpendOrigin;
  amountCents: number;
}

/** Shared-scope responsibility of a member in a month. */
export interface ResponsibilityFact {
  month: string;
  memberId: string;
  amountCents: number;
}

export interface TrendsInput {
  /** The window, oldest first. */
  months: readonly string[];
  /** Current month in the household time zone. */
  currentMonth: string;
  /** Month of the first live expense; null without expenses. */
  firstExpenseMonth: string | null;
  /** Every member the household ever had, in stable member order. */
  members: readonly { id: string; status: MemberStatus }[];
  /** Must cover the window and the 3 months before its last month. */
  facts: readonly SpendFact[];
  responsibility: readonly ResponsibilityFact[];
  /** Any category id (top-level or sub) → its top-level category. */
  categories: ReadonlyMap<string, CategoryInfo>;
  /** Household income per window month; null when an active member has no income. */
  incomes: ReadonlyMap<string, number | null>;
  /** Whether income amounts may be shown to the viewer (ADR-005). */
  incomeVisible: boolean;
}

export interface TrendsResult {
  members: { memberId: string; status: MemberStatus }[];
  months: AnalyticsMonth[];
  averages: AnalyticsAverages;
  comparison: AnalyticsComparison;
  categories: AnalyticsCategory[];
}

/** part ÷ whole in bps, truncated toward zero; null when `whole` is 0. */
export function ratioBps(part: number, whole: number): number | null {
  return whole === 0 ? null : Number((BigInt(part) * BigInt(TOTAL_BPS)) / BigInt(whole));
}

export function periodOf(month: string, currentMonth: string): AnalyticsPeriod {
  return month < currentMonth ? 'PAST' : month === currentMonth ? 'CURRENT' : 'FUTURE';
}

/** Rounded-down mean; null for no values. */
function averageOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.floor(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function sharesOf(values: readonly number[]): number[] | null {
  return values.reduce((sum, value) => sum + value, 0) > 0
    ? allocateLargestRemainder(TOTAL_BPS, values)
    : null;
}

interface MonthTotals {
  shared: number;
  individual: number;
  recurring: number;
  installment: number;
  paidShared: Map<string, number>;
  responsibleShared: Map<string, number>;
  /** Top-level category id → shared spend. */
  byCategory: Map<string, number>;
}

const add = (map: Map<string, number>, key: string, value: number): void => {
  map.set(key, (map.get(key) ?? 0) + value);
};

function emptyTotals(): MonthTotals {
  return {
    shared: 0,
    individual: 0,
    recurring: 0,
    installment: 0,
    paidShared: new Map(),
    responsibleShared: new Map(),
    byCategory: new Map(),
  };
}

export function computeTrends(input: TrendsInput): TrendsResult {
  const totals = new Map<string, MonthTotals>();
  const totalsOf = (month: string): MonthTotals => {
    let entry = totals.get(month);
    if (!entry) {
      entry = emptyTotals();
      totals.set(month, entry);
    }
    return entry;
  };
  const names = new Map<string, string>();
  const topLevelOf = (categoryId: string): string => {
    const info = input.categories.get(categoryId);
    const id = info?.topLevelId ?? categoryId;
    names.set(id, info?.topLevelName ?? '');
    return id;
  };

  for (const fact of input.facts) {
    const month = totalsOf(fact.month);
    if (!fact.shared) {
      month.individual += fact.amountCents;
      continue;
    }
    month.shared += fact.amountCents;
    if (fact.origin === 'RECURRING') month.recurring += fact.amountCents;
    if (fact.origin === 'INSTALLMENT') month.installment += fact.amountCents;
    add(month.paidShared, fact.payerMemberId, fact.amountCents);
    add(month.byCategory, topLevelOf(fact.categoryId), fact.amountCents);
  }
  for (const row of input.responsibility) {
    add(totalsOf(row.month).responsibleShared, row.memberId, row.amountCents);
  }
  const spendOf = (month: string): number => totals.get(month)?.shared ?? 0;

  // Active members, plus former members with figures in the window, in stable member order.
  const withFigures = new Set<string>();
  for (const month of input.months) {
    const entry = totals.get(month);
    for (const id of [
      ...(entry?.paidShared.keys() ?? []),
      ...(entry?.responsibleShared.keys() ?? []),
    ]) {
      withFigures.add(id);
    }
  }
  const members = input.members.filter((m) => m.status === 'ACTIVE' || withFigures.has(m.id));

  const months: AnalyticsMonth[] = input.months.map((month, index) => {
    const entry = totals.get(month) ?? emptyTotals();
    const paid = members.map((m) => entry.paidShared.get(m.id) ?? 0);
    const responsible = members.map((m) => entry.responsibleShared.get(m.id) ?? 0);
    const paidShares = sharesOf(paid);
    const responsibleShares = sharesOf(responsible);
    const fixed = entry.recurring + entry.installment;
    const previous = index > 0 ? spendOf(input.months[index - 1] ?? '') : null;
    const income = input.incomes.get(month) ?? null;
    const complete = income !== null && income > 0;
    return {
      month,
      period: periodOf(month, input.currentMonth),
      sharedSpendCents: entry.shared,
      individualSpendCents: entry.individual,
      recurringCents: entry.recurring,
      installmentCents: entry.installment,
      otherCents: entry.shared - fixed,
      fixedCents: fixed,
      changeCents: previous === null ? null : entry.shared - previous,
      changeBps: previous === null ? null : ratioBps(entry.shared - previous, previous),
      members: members.map((m, i) => {
        const paidShare = paidShares?.[i] ?? null;
        const responsibleShare = responsibleShares?.[i] ?? null;
        return {
          memberId: m.id,
          paidSharedCents: paid[i] ?? 0,
          responsibleSharedCents: responsible[i] ?? 0,
          paidShareBps: paidShare,
          responsibleShareBps: responsibleShare,
          deviationBps:
            paidShare !== null && responsibleShare !== null ? paidShare - responsibleShare : null,
        };
      }),
      income: {
        complete,
        incomeCents: complete && input.incomeVisible ? income : null,
        fixedBps: complete ? ratioBps(fixed, income) : null,
        spendBps: complete ? ratioBps(entry.shared, income) : null,
      },
    };
  });

  const recorded = (month: string): boolean =>
    input.firstExpenseMonth !== null && month >= input.firstExpenseMonth;

  // Averages over closed months the household was already recording.
  const closed = months.filter((m) => m.period === 'PAST' && recorded(m.month));
  const averages: AnalyticsAverages = {
    months: closed.length,
    sharedSpendCents: averageOf(closed.map((m) => m.sharedSpendCents)),
    fixedCents: averageOf(closed.map((m) => m.fixedCents)),
    installmentCents: averageOf(closed.map((m) => m.installmentCents)),
    otherCents: averageOf(closed.map((m) => m.otherCents)),
  };

  // Window categories (top level), largest first; ties by name then id.
  const categoryTotals = new Map<string, number>();
  for (const month of input.months) {
    for (const [id, cents] of totals.get(month)?.byCategory ?? []) add(categoryTotals, id, cents);
  }
  const byWeight = (a: { id: string; cents: number }, b: { id: string; cents: number }) =>
    b.cents - a.cents ||
    (names.get(a.id) ?? '').localeCompare(names.get(b.id) ?? '', 'pt-BR') ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const ranked = [...categoryTotals]
    .map(([id, cents]) => ({ id, cents }))
    .filter((c) => c.cents > 0)
    .sort(byWeight);
  const categoryShares = sharesOf(ranked.map((c) => c.cents));
  const categories: AnalyticsCategory[] = ranked.map((c, i) => ({
    categoryId: c.id,
    name: names.get(c.id) ?? '',
    totalCents: c.cents,
    shareBps: categoryShares?.[i] ?? 0,
    monthlyCents: input.months.map((month) => totals.get(month)?.byCategory.get(c.id) ?? 0),
  }));

  return {
    members: members.map((m) => ({ memberId: m.id, status: m.status })),
    months,
    averages,
    comparison: compare(input, totals, names, recorded, byWeight),
    categories,
  };
}

function compare(
  input: TrendsInput,
  totals: ReadonlyMap<string, MonthTotals>,
  names: ReadonlyMap<string, string>,
  recorded: (month: string) => boolean,
  byWeight: (a: { id: string; cents: number }, b: { id: string; cents: number }) => number,
): AnalyticsComparison {
  const month = input.months[input.months.length - 1] ?? input.currentMonth;
  const previous = shiftMonth(month, -1);
  const averageMonths = Array.from({ length: ANALYTICS_AVERAGE_MONTHS }, (_, i) =>
    shiftMonth(month, -(i + 1)),
  ).filter(recorded);
  const spendOf = (m: string): number => totals.get(m)?.shared ?? 0;
  const categoryOf = (m: string, id: string): number => totals.get(m)?.byCategory.get(id) ?? 0;

  const cents = spendOf(month);
  const previousCents = spendOf(previous);
  const averageCents = averageOf(averageMonths.map(spendOf));

  const ids = new Set<string>();
  for (const m of [month, previous, ...averageMonths]) {
    for (const [id, value] of totals.get(m)?.byCategory ?? []) if (value > 0) ids.add(id);
  }
  const categories: AnalyticsCategoryComparison[] = [...ids]
    .map((id) => ({ id, cents: categoryOf(month, id) }))
    .sort(byWeight)
    .map(({ id, cents: categoryCents }) => {
      const average = averageOf(averageMonths.map((m) => categoryOf(m, id)));
      return {
        categoryId: id,
        name: names.get(id) ?? '',
        cents: categoryCents,
        previousCents: categoryOf(previous, id),
        averageCents: average,
        vsAverageCents: average === null ? null : categoryCents - average,
        vsAverageBps: average === null ? null : ratioBps(categoryCents - average, average),
      };
    });

  return {
    month,
    period: periodOf(month, input.currentMonth),
    sharedSpendCents: cents,
    previousCents,
    changeCents: cents - previousCents,
    changeBps: ratioBps(cents - previousCents, previousCents),
    averageMonths: averageMonths.length,
    averageCents,
    vsAverageCents: averageCents === null ? null : cents - averageCents,
    vsAverageBps: averageCents === null ? null : ratioBps(cents - averageCents, averageCents),
    categories,
  };
}
