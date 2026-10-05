import type {
  DashboardCategory,
  DashboardMember,
  DashboardTotals,
  DeviationExplanation,
  MemberStatus,
  SettlementSuggestion,
} from '@couple-finance/shared';
import { allocateLargestRemainder } from '../../../common/money/allocation';

/**
 * Contribution metrics and deviation attribution (CALCULATIONS.md §3–4). Pure: no I/O.
 *
 * - Shares and deviation use the shared scope (split type ≠ INDIVIDUAL), Q-07.
 * - Balances use every expense plus settlements: balance = paid − responsible + sent − received.
 * - Members are processed in stable member order (joinedAt, id), the deterministic tie-break.
 */

export const TOTAL_BPS = 10_000;
export const TOP_CATEGORIES = 3;
export const TOP_TRANSACTIONS = 5;

export interface ContributionEntry {
  id: string;
  description: string;
  date: string;
  amountCents: number;
  categoryId: string;
  payerMemberId: string;
  /** False for INDIVIDUAL expenses. */
  shared: boolean;
  allocations: { memberId: string; amountCents: number }[];
}

export interface Flows {
  paidCents: number;
  responsibleCents: number;
  settlementsSentCents: number;
  settlementsReceivedCents: number;
}

export interface CategoryInfo {
  topLevelId: string;
  topLevelName: string;
}

export interface ContributionInput {
  /** Every member the household ever had, in stable member order. */
  members: { id: string; status: MemberStatus }[];
  /** Non-deleted expenses of the period. */
  entries: ContributionEntry[];
  /** Settlements of the period, per member. */
  periodSettlements: ReadonlyMap<string, { sentCents: number; receivedCents: number }>;
  /** Flows from the first record to the end of the period, per member. */
  cumulative: ReadonlyMap<string, Flows>;
  /** Any category id (top-level or sub) → its top-level category. */
  categories: ReadonlyMap<string, CategoryInfo>;
}

export interface ContributionResult {
  totals: DashboardTotals;
  members: DashboardMember[];
  categories: DashboardCategory[];
  explanations: DeviationExplanation[];
  settlementSuggestion: SettlementSuggestion | null;
}

export function balanceOf(flows: Flows): number {
  return (
    flows.paidCents -
    flows.responsibleCents +
    flows.settlementsSentCents -
    flows.settlementsReceivedCents
  );
}

interface MemberAccumulator {
  paid: number;
  responsible: number;
  paidShared: number;
  responsibleShared: number;
  /** Shared scope: Σ (paid by member ? amount : 0) − allocation, per expense and per category. */
  deltaByEntry: Map<string, number>;
  deltaByCategory: Map<string, number>;
}

const add = (map: Map<string, number>, key: string, value: number): void => {
  map.set(key, (map.get(key) ?? 0) + value);
};

/**
 * delta_m(tx) = (payer = m ? amount : 0) − allocation_m (CALCULATIONS.md §4). The deltas of one
 * expense always add up to zero, so the explanation reconciles with the balance.
 */
export function expenseDeltas(entry: ContributionEntry): Map<string, number> {
  const deltas = new Map<string, number>([[entry.payerMemberId, entry.amountCents]]);
  for (const allocation of entry.allocations) {
    add(deltas, allocation.memberId, -allocation.amountCents);
  }
  return deltas;
}

function topLevel(categories: ReadonlyMap<string, CategoryInfo>, categoryId: string): CategoryInfo {
  // Categories are archived, never deleted, so the fallback is defensive only.
  return categories.get(categoryId) ?? { topLevelId: categoryId, topLevelName: '—' };
}

function sharesBps(values: readonly number[]): (number | null)[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 ? allocateLargestRemainder(TOTAL_BPS, values) : values.map(() => null);
}

export function computeContribution(input: ContributionInput): ContributionResult {
  const accumulators = new Map<string, MemberAccumulator>(
    input.members.map((member) => [
      member.id,
      {
        paid: 0,
        responsible: 0,
        paidShared: 0,
        responsibleShared: 0,
        deltaByEntry: new Map(),
        deltaByCategory: new Map(),
      },
    ]),
  );
  const accumulator = (memberId: string): MemberAccumulator => {
    const found = accumulators.get(memberId);
    if (!found) {
      throw new RangeError(`Unknown member ${memberId}`);
    }
    return found;
  };

  const totals: DashboardTotals = {
    sharedSpendCents: 0,
    individualSpendCents: 0,
    totalSpendCents: 0,
    transactionCount: input.entries.length,
  };
  const categorySpend = new Map<string, { name: string; cents: number; count: number }>();
  const entriesById = new Map(input.entries.map((entry) => [entry.id, entry]));

  for (const entry of input.entries) {
    totals.totalSpendCents += entry.amountCents;
    const payer = accumulator(entry.payerMemberId);
    payer.paid += entry.amountCents;
    for (const allocation of entry.allocations) {
      accumulator(allocation.memberId).responsible += allocation.amountCents;
    }
    if (!entry.shared) {
      totals.individualSpendCents += entry.amountCents;
      continue;
    }

    totals.sharedSpendCents += entry.amountCents;
    const category = topLevel(input.categories, entry.categoryId);
    const spend = categorySpend.get(category.topLevelId) ?? {
      name: category.topLevelName,
      cents: 0,
      count: 0,
    };
    spend.cents += entry.amountCents;
    spend.count += 1;
    categorySpend.set(category.topLevelId, spend);

    payer.paidShared += entry.amountCents;
    for (const allocation of entry.allocations) {
      accumulator(allocation.memberId).responsibleShared += allocation.amountCents;
    }
    for (const [memberId, delta] of expenseDeltas(entry)) {
      if (delta !== 0) {
        const member = accumulator(memberId);
        member.deltaByEntry.set(entry.id, delta);
        add(member.deltaByCategory, category.topLevelId, delta);
      }
    }
  }

  // Active members always appear; former members only when they have figures.
  const shown = input.members.filter((member) => {
    if (member.status === 'ACTIVE') return true;
    const own = accumulator(member.id);
    const settled = input.periodSettlements.get(member.id);
    const cumulative = input.cumulative.get(member.id);
    return (
      own.paid !== 0 ||
      own.responsible !== 0 ||
      (settled !== undefined && (settled.sentCents !== 0 || settled.receivedCents !== 0)) ||
      (cumulative !== undefined && balanceOf(cumulative) !== 0)
    );
  });

  const paidShares = sharesBps(shown.map((member) => accumulator(member.id).paidShared));
  const responsibleShares = sharesBps(
    shown.map((member) => accumulator(member.id).responsibleShared),
  );

  const members: DashboardMember[] = shown.map((member, index) => {
    const own = accumulator(member.id);
    const settled = input.periodSettlements.get(member.id);
    const cumulative = input.cumulative.get(member.id);
    const paidShareBps = paidShares[index] ?? null;
    const responsibleShareBps = responsibleShares[index] ?? null;
    return {
      memberId: member.id,
      status: member.status,
      paidCents: own.paid,
      paidSharedCents: own.paidShared,
      responsibleSharedCents: own.responsibleShared,
      paidShareBps,
      responsibleShareBps,
      deviationBps:
        paidShareBps !== null && responsibleShareBps !== null
          ? paidShareBps - responsibleShareBps
          : null,
      sharedDifferenceCents: own.paidShared - own.responsibleShared,
      periodBalanceCents: balanceOf({
        paidCents: own.paid,
        responsibleCents: own.responsible,
        settlementsSentCents: settled?.sentCents ?? 0,
        settlementsReceivedCents: settled?.receivedCents ?? 0,
      }),
      cumulativeBalanceCents: cumulative ? balanceOf(cumulative) : 0,
    };
  });

  const explanations: DeviationExplanation[] = members
    .filter((member) => member.sharedDifferenceCents !== 0)
    .map((member) => {
      const own = accumulator(member.memberId);
      const sign = member.sharedDifferenceCents > 0 ? 1 : -1;
      const categories = [...own.deltaByCategory.entries()]
        .filter(([, delta]) => sign * delta > 0)
        .map(([categoryId, deltaCents]) => ({
          categoryId,
          name: categorySpend.get(categoryId)?.name ?? '—',
          deltaCents,
        }))
        .sort(
          (a, b) =>
            sign * (b.deltaCents - a.deltaCents) ||
            a.name.localeCompare(b.name, 'pt-BR') ||
            (a.categoryId < b.categoryId ? -1 : 1),
        )
        .slice(0, TOP_CATEGORIES);
      const transactions = [...own.deltaByEntry.entries()]
        .filter(([, delta]) => sign * delta > 0)
        .flatMap(([entryId, deltaCents]) => {
          const entry = entriesById.get(entryId);
          return entry
            ? [
                {
                  transactionId: entry.id,
                  description: entry.description,
                  date: entry.date,
                  categoryId: entry.categoryId,
                  amountCents: entry.amountCents,
                  deltaCents,
                },
              ]
            : [];
        })
        .sort(
          (a, b) =>
            sign * (b.deltaCents - a.deltaCents) ||
            (a.date === b.date ? 0 : a.date > b.date ? -1 : 1) ||
            (a.transactionId < b.transactionId ? -1 : 1),
        )
        .slice(0, TOP_TRANSACTIONS);
      return {
        memberId: member.memberId,
        direction: sign > 0 ? ('ABOVE' as const) : ('BELOW' as const),
        categories,
        transactions,
      };
    });

  const sortedCategories = [...categorySpend.entries()].sort(
    ([idA, a], [idB, b]) =>
      b.cents - a.cents || a.name.localeCompare(b.name, 'pt-BR') || (idA < idB ? -1 : 1),
  );
  const categoryShares = sharesBps(sortedCategories.map(([, spend]) => spend.cents));
  const categories: DashboardCategory[] = sortedCategories.map(([categoryId, spend], index) => ({
    categoryId,
    name: spend.name,
    sharedSpendCents: spend.cents,
    shareBps: categoryShares[index] ?? 0,
    transactionCount: spend.count,
  }));

  return {
    totals,
    members,
    categories,
    explanations,
    settlementSuggestion: suggestSettlement(members),
  };
}

/**
 * With exactly two members carrying a cumulative balance (the couple case), one transfer from
 * the member below to the member above brings both to zero. Otherwise there is no single answer.
 */
export function suggestSettlement(members: DashboardMember[]): SettlementSuggestion | null {
  const open = members.filter((member) => member.cumulativeBalanceCents !== 0);
  if (open.length !== 2) {
    return null;
  }
  const [first, second] = open;
  if (!first || !second || first.cumulativeBalanceCents + second.cumulativeBalanceCents !== 0) {
    return null;
  }
  const [ahead, behind] = first.cumulativeBalanceCents > 0 ? [first, second] : [second, first];
  return {
    fromMemberId: behind.memberId,
    toMemberId: ahead.memberId,
    amountCents: ahead.cumulativeBalanceCents,
  };
}
