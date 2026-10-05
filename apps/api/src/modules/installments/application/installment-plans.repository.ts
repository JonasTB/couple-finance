import type { PaymentMethod } from '@couple-finance/shared';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import { type SplitSnapshot } from '../../transactions/public';

export interface InstallmentPlanRecord {
  id: string;
  householdId: string;
  description: string;
  categoryId: string;
  originalTotalCents: number;
  installmentCount: number;
  firstInstallmentDate: string;
  payerMemberId: string;
  paymentMethod: PaymentMethod;
  splitSnapshot: SplitSnapshot;
  notes: string | null;
  createdByMemberId: string;
  closeKind: 'CANCEL' | 'PAY_OFF' | null;
  closedAt: Date | null;
  closedByMemberId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  deletedByMemberId: string | null;
}

export type NewInstallmentPlan = Omit<
  InstallmentPlanRecord,
  'closeKind' | 'closedAt' | 'closedByMemberId' | 'createdAt' | 'deletedAt' | 'deletedByMemberId'
>;

export abstract class InstallmentPlansRepository {
  abstract insert(tx: TransactionContext, plan: NewInstallmentPlan): Promise<void>;
  /** Includes soft-deleted rows. */
  abstract find(
    householdId: string,
    id: string,
    options?: { tx?: TransactionContext; lock?: boolean },
  ): Promise<InstallmentPlanRecord | null>;
  abstract list(householdId: string, deleted: 'exclude' | 'only'): Promise<InstallmentPlanRecord[]>;
  abstract update(
    tx: TransactionContext,
    id: string,
    changes: Partial<
      Pick<
        InstallmentPlanRecord,
        'closeKind' | 'closedAt' | 'closedByMemberId' | 'deletedAt' | 'deletedByMemberId'
      >
    >,
  ): Promise<void>;
}
