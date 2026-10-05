import type {
  PurchaseItemStatus,
  PurchasePlanStatus,
  PurchasePlanTotals,
  PurchasePriority,
} from '@couple-finance/shared';

/** Purchase plan totals (FR-PP-03, CALCULATIONS.md §9). Pure: no I/O. */

export interface PlanItem {
  estimatedPriceCents: number;
  quantity: number;
  status: PurchaseItemStatus;
  paidPriceCents: number | null;
  priority: PurchasePriority;
}

export const estimatedTotal = (item: Pick<PlanItem, 'estimatedPriceCents' | 'quantity'>) =>
  item.estimatedPriceCents * item.quantity;

/**
 * - estimated = Σ estimate × quantity of PENDING and PURCHASED items (FUTURE kept apart);
 * - actual = Σ paid of PURCHASED items; variance = actual − their estimate;
 * - remaining need = Σ estimate × quantity of PENDING items.
 */
export function planTotals(items: readonly PlanItem[]): PurchasePlanTotals {
  const totals: PurchasePlanTotals = {
    estimatedCents: 0,
    futureCents: 0,
    actualCents: 0,
    remainingNeedCents: 0,
    varianceCents: 0,
    pendingCount: 0,
    purchasedCount: 0,
    futureCount: 0,
  };
  for (const item of items) {
    const estimate = estimatedTotal(item);
    if (item.status === 'FUTURE') {
      totals.futureCents += estimate;
      totals.futureCount += 1;
      continue;
    }
    totals.estimatedCents += estimate;
    if (item.status === 'PENDING') {
      totals.remainingNeedCents += estimate;
      totals.pendingCount += 1;
    } else {
      const paid = item.paidPriceCents ?? 0;
      totals.actualCents += paid;
      totals.varianceCents += paid - estimate;
      totals.purchasedCount += 1;
    }
  }
  return totals;
}

/** ARCHIVED when archived; COMPLETED once something was bought and nothing is pending. */
export function planStatus(totals: PurchasePlanTotals, archived: boolean): PurchasePlanStatus {
  if (archived) return 'ARCHIVED';
  return totals.pendingCount === 0 && totals.purchasedCount > 0 ? 'COMPLETED' : 'ACTIVE';
}

/** How much of the remaining need the linked goal covers, in bps (capped); null if no need. */
export function goalCoverageBps(savedCents: number, remainingNeedCents: number): number | null {
  if (remainingNeedCents <= 0) return null;
  const bps = (BigInt(Math.max(savedCents, 0)) * 10000n) / BigInt(remainingNeedCents);
  return Number(bps > 10000n ? 10000n : bps);
}

const STATUS_ORDER: Record<PurchaseItemStatus, number> = { PENDING: 0, PURCHASED: 1, FUTURE: 2 };
const PRIORITY_ORDER: Record<PurchasePriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** Pending first (by priority), then purchased, then future; ties by name. */
export function compareItems(
  a: PlanItem & { name: string },
  b: PlanItem & { name: string },
): number {
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    a.name.localeCompare(b.name, 'pt-BR')
  );
}
