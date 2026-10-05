import type { GoalEntryType } from '@couple-finance/shared';
import { type TransactionContext } from '../../../common/database/unit-of-work';

export interface GoalRecord {
  id: string;
  householdId: string;
  name: string;
  targetAmountCents: number;
  targetDate: string | null;
  participantMemberIds: string[];
  createdByMemberId: string;
  version: number;
  createdAt: Date;
  archivedAt: Date | null;
}

export interface GoalEntryRecord {
  id: string;
  goalId: string;
  memberId: string;
  type: GoalEntryType;
  amountCents: number;
  date: string;
  notes: string | null;
  createdByMemberId: string;
  createdAt: Date;
  deletedAt: Date | null;
}

export type GoalChanges = Pick<
  GoalRecord,
  'name' | 'targetAmountCents' | 'targetDate' | 'participantMemberIds' | 'archivedAt'
>;

export abstract class GoalsRepository {
  /** `createdAt` comes from the application clock: it defines the goal's first pace month. */
  abstract insert(
    tx: TransactionContext,
    goal: Omit<GoalRecord, 'version' | 'archivedAt'>,
  ): Promise<void>;
  abstract find(
    householdId: string,
    id: string,
    options?: { tx?: TransactionContext; lock?: boolean },
  ): Promise<GoalRecord | null>;
  abstract list(householdId: string, ids?: readonly string[]): Promise<GoalRecord[]>;
  /** Bumps `version`; false if `expectedVersion` is stale. */
  abstract update(
    tx: TransactionContext,
    id: string,
    expectedVersion: number,
    changes: GoalChanges,
  ): Promise<boolean>;
  /** Entries of the goals, oldest first; live only unless `withDeleted`. */
  abstract entries(
    goalIds: readonly string[],
    options?: { tx?: TransactionContext; withDeleted?: boolean },
  ): Promise<GoalEntryRecord[]>;
  abstract insertEntry(
    tx: TransactionContext,
    entry: Omit<GoalEntryRecord, 'createdAt' | 'deletedAt'>,
  ): Promise<void>;
  abstract setEntryDeleted(
    tx: TransactionContext,
    id: string,
    deletedAt: Date | null,
    deletedByMemberId: string | null,
  ): Promise<void>;
}
