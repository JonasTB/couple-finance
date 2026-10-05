import type { IncomeVisibility } from './households';

/** One effective-dated monthly income record (FR-INC-01). Dates are `YYYY-MM-DD`. */
export interface IncomeRecordView {
  id: string;
  monthlyAmountCents: number;
  effectiveFrom: string;
  /** Exclusive end; null while current. */
  effectiveTo: string | null;
}

/** A member's income as seen by the viewer, honoring that member's visibility (ADR-005). */
export interface MemberIncomeView {
  memberId: string;
  isMe: boolean;
  visibility: IncomeVisibility;
  hasIncome: boolean;
  /** Null when hidden from the viewer (RATIO_ONLY and not me) or when there is no income. */
  monthlyAmountCents: number | null;
  /** Share of the household income in bps; null unless every active member has income. */
  shareBps: number | null;
}

export interface HouseholdIncomeOverview {
  date: string;
  members: MemberIncomeView[];
}
