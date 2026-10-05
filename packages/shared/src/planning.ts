/**
 * Goals and purchase plans (FR-GOAL-01..03, FR-PP-01..04, CALCULATIONS.md §8–9).
 * Bookkeeping only: the app never moves money (BUSINESS_RULES 26).
 */

// --- goals -------------------------------------------------------------------------------------

export const GOAL_NAME_MAX_LENGTH = 60;
export const GOAL_NOTES_MAX_LENGTH = 200;

export type GoalStatus = 'ACTIVE' | 'ACHIEVED' | 'ARCHIVED';
export type GoalEntryType = 'CONTRIBUTION' | 'WITHDRAWAL';

export interface GoalInput {
  name: string;
  targetAmountCents: number;
  /** Optional deadline (`YYYY-MM-DD`). */
  targetDate?: string | null;
  /** Active members taking part; at least one. */
  participantMemberIds: string[];
}

export interface GoalEntryInput {
  memberId: string;
  type: GoalEntryType;
  amountCents: number;
  /** Today or earlier. */
  date: string;
  notes?: string | null;
}

export interface GoalEntryView {
  id: string;
  memberId: string;
  type: GoalEntryType;
  amountCents: number;
  date: string;
  notes: string | null;
  createdAt: string;
  deletedAt: string | null;
}

/** Deterministic forecast (§8). Null fields mean "not applicable". */
export interface GoalForecast {
  /** Average net amount per month over the last complete months (up to 3, since creation). */
  paceCents: number | null;
  /** Complete months the pace is based on (0 → no forecast yet). */
  paceMonths: number;
  /** Months still needed at the current pace; null when the pace is zero or negative. */
  monthsToGo: number | null;
  /** `YYYY-MM` in which the target is reached at the current pace. */
  forecastMonth: string | null;
  /** Monthly amount needed to meet the deadline (deadline goals only). */
  requiredMonthlyCents: number | null;
  /** The deadline already passed and the goal is not achieved. */
  deadlinePassed: boolean;
}

export interface GoalView {
  id: string;
  name: string;
  targetAmountCents: number;
  targetDate: string | null;
  participantMemberIds: string[];
  status: GoalStatus;
  savedCents: number;
  remainingCents: number;
  /** ⌊saved × 10000 / target⌋, capped at 10000. */
  progressBps: number;
  /** Net saved per participant (and former participants with entries). */
  byMember: { memberId: string; savedCents: number }[];
  forecast: GoalForecast;
  version: number;
  createdAt: string;
  archivedAt: string | null;
  /** Detail endpoint only, newest first. */
  entries?: GoalEntryView[];
}

// --- purchase plans ----------------------------------------------------------------------------

export const PURCHASE_PLAN_NAME_MAX_LENGTH = 60;
export const PURCHASE_ITEM_NAME_MAX_LENGTH = 80;
export const PURCHASE_ITEM_MAX_QUANTITY = 999;

export const PURCHASE_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type PurchasePriority = (typeof PURCHASE_PRIORITIES)[number];
export const PURCHASE_ITEM_STATUSES = ['PENDING', 'PURCHASED', 'FUTURE'] as const;
export type PurchaseItemStatus = (typeof PURCHASE_ITEM_STATUSES)[number];
export type PurchasePlanStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export interface PurchasePlanInput {
  name: string;
  description?: string | null;
  /** Optional goal that funds the plan (FR-PP-04). */
  goalId?: string | null;
}

export interface PurchaseItemInput {
  name: string;
  estimatedPriceCents: number;
  quantity: number;
  priority: PurchasePriority;
  /** PENDING or FUTURE; PURCHASED is set with the purchase command. */
  status: Exclude<PurchaseItemStatus, 'PURCHASED'>;
  responsibleMemberId?: string | null;
  url?: string | null;
  notes?: string | null;
}

export interface PurchaseInput {
  /** What was actually paid for the whole line (all units). */
  paidPriceCents: number;
  /** Default: today. */
  purchasedAt?: string;
  /** Optional expense already recorded for this purchase (FR-PP-02). */
  transactionId?: string | null;
}

export interface PurchaseItemView {
  id: string;
  name: string;
  estimatedPriceCents: number;
  quantity: number;
  /** estimatedPrice × quantity. */
  estimatedTotalCents: number;
  priority: PurchasePriority;
  status: PurchaseItemStatus;
  paidPriceCents: number | null;
  purchasedAt: string | null;
  transaction: { id: string; description: string; amountCents: number; date: string } | null;
  responsibleMemberId: string | null;
  url: string | null;
  notes: string | null;
  version: number;
}

/** Totals (§9). */
export interface PurchasePlanTotals {
  /** Estimated cost of PENDING + PURCHASED items. */
  estimatedCents: number;
  /** Estimated cost of FUTURE items (kept apart). */
  futureCents: number;
  /** Paid for PURCHASED items. */
  actualCents: number;
  /** Estimated cost of PENDING items: what is still needed. */
  remainingNeedCents: number;
  /** actual − estimate of the PURCHASED items (positive = paid more than estimated). */
  varianceCents: number;
  pendingCount: number;
  purchasedCount: number;
  futureCount: number;
}

export interface PurchasePlanView {
  id: string;
  name: string;
  description: string | null;
  status: PurchasePlanStatus;
  totals: PurchasePlanTotals;
  /** The linked goal with what it already covers of the remaining need. */
  goal: { id: string; name: string; savedCents: number; coverageBps: number | null } | null;
  version: number;
  createdAt: string;
  archivedAt: string | null;
  /** Detail endpoint only: by status, then priority. */
  items?: PurchaseItemView[];
}
