import { type TransactionContext } from '../../../common/database/unit-of-work';

export interface SettlementRecord {
  id: string;
  householdId: string;
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
  date: string;
  notes: string | null;
  createdByMemberId: string;
  createdAt: Date;
  deletedAt: Date | null;
  deletedByMemberId: string | null;
}

export type NewSettlement = Omit<SettlementRecord, 'createdAt' | 'deletedAt' | 'deletedByMemberId'>;

/** Per-member settlement sums (cents). */
export interface SettlementTotals {
  memberId: string;
  sentCents: number;
  receivedCents: number;
}

export abstract class SettlementsRepository {
  abstract insert(tx: TransactionContext, settlement: NewSettlement): Promise<void>;
  /** Includes soft-deleted rows; `lock` takes a row lock for updates. */
  abstract find(
    householdId: string,
    id: string,
    options?: { tx?: TransactionContext; lock?: boolean },
  ): Promise<SettlementRecord | null>;
  abstract setDeleted(
    tx: TransactionContext,
    id: string,
    deletedAt: Date | null,
    deletedByMemberId: string | null,
  ): Promise<void>;
  /** Newest first (date DESC, created_at DESC); at most `limit` rows. */
  abstract list(
    householdId: string,
    range: { from?: string; to?: string },
    deleted: 'exclude' | 'only',
    limit: number,
  ): Promise<SettlementRecord[]>;
  /** Non-deleted settlements dated on or before `upTo` (or in [from, upTo]). */
  abstract totalsByMember(
    householdId: string,
    upTo: string,
    from?: string,
  ): Promise<SettlementTotals[]>;
}
