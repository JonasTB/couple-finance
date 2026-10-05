import type { PurchaseItemStatus, PurchasePriority } from '@couple-finance/shared';
import { type TransactionContext } from '../../../common/database/unit-of-work';

export interface PurchasePlanRecord {
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  goalId: string | null;
  createdByMemberId: string;
  version: number;
  createdAt: Date;
  archivedAt: Date | null;
}

export interface PurchaseItemRecord {
  id: string;
  purchasePlanId: string;
  name: string;
  estimatedPriceCents: number;
  quantity: number;
  priority: PurchasePriority;
  status: PurchaseItemStatus;
  paidPriceCents: number | null;
  purchasedAt: string | null;
  transactionId: string | null;
  responsibleMemberId: string | null;
  url: string | null;
  notes: string | null;
  createdByMemberId: string;
  version: number;
  deletedAt: Date | null;
}

export type PlanChanges = Pick<
  PurchasePlanRecord,
  'name' | 'description' | 'goalId' | 'archivedAt'
>;
export type ItemChanges = Omit<
  PurchaseItemRecord,
  'id' | 'purchasePlanId' | 'createdByMemberId' | 'version'
> & { deletedByMemberId: string | null };

export abstract class PurchasePlansRepository {
  abstract insert(
    tx: TransactionContext,
    plan: Omit<PurchasePlanRecord, 'version' | 'createdAt' | 'archivedAt'>,
  ): Promise<void>;
  abstract find(
    householdId: string,
    id: string,
    options?: { tx?: TransactionContext; lock?: boolean },
  ): Promise<PurchasePlanRecord | null>;
  abstract list(householdId: string): Promise<PurchasePlanRecord[]>;
  /** Bumps `version`; false if `expectedVersion` (when given) is stale. */
  abstract update(
    tx: TransactionContext,
    id: string,
    expectedVersion: number,
    changes: PlanChanges,
  ): Promise<boolean>;
  abstract items(
    planIds: readonly string[],
    options?: { tx?: TransactionContext; withDeleted?: boolean },
  ): Promise<PurchaseItemRecord[]>;
  abstract insertItem(
    tx: TransactionContext,
    item: Omit<PurchaseItemRecord, 'version' | 'deletedAt'>,
  ): Promise<void>;
  abstract updateItem(
    tx: TransactionContext,
    id: string,
    expectedVersion: number,
    changes: ItemChanges,
  ): Promise<boolean>;
}
