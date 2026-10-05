/**
 * Settlements ("acertos", Q-01): bookkeeping of a transfer made outside the app between two
 * members. They change only the contribution balance, never spend (docs/domain/CALCULATIONS.md §3).
 */

export const SETTLEMENT_NOTES_MAX_LENGTH = 200;

export interface SettlementInput {
  /** Who transferred the money. */
  fromMemberId: string;
  /** Who received it. */
  toMemberId: string;
  amountCents: number;
  date: string;
  notes?: string | null;
}

export interface SettlementView {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
  date: string;
  notes: string | null;
  createdByMemberId: string;
  createdAt: string;
  deletedAt: string | null;
}
