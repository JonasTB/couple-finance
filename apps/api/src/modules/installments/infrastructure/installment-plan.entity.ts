import type { PaymentMethod } from '@couple-finance/shared';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintCentsTransformer } from '../../../common/money/bigint-cents.transformer';
import { CategoryEntity } from '../../categories/persistence';
import { HouseholdEntity, HouseholdMemberEntity } from '../../households/persistence';
import { type SplitSnapshot } from '../../transactions/public';

@Entity({ name: 'installment_plans' })
@Check(
  'ck_installment_plans_total',
  'original_total_cents > 0 AND original_total_cents <= 99999999999',
)
@Check('ck_installment_plans_count', 'installment_count BETWEEN 2 AND 72')
@Check('ck_installment_plans_description_length', 'char_length(description) BETWEEN 1 AND 120')
@Check('ck_installment_plans_notes_length', 'notes IS NULL OR char_length(notes) <= 500')
@Check(
  'ck_installment_plans_payment_method',
  `payment_method IN ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'BANK_TRANSFER', 'BOLETO', 'OTHER')`,
)
@Check(
  'ck_installment_plans_close',
  `(close_kind IS NULL) = (closed_at IS NULL) AND (close_kind IS NULL OR close_kind IN ('CANCEL', 'PAY_OFF'))`,
)
// Partial index managed by the migration.
@Index('ix_installment_plans_household', { synchronize: false })
export class InstallmentPlanEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_installment_plans' })
  id: string;

  @Column({ name: 'household_id', type: 'uuid' })
  householdId: string;

  @ManyToOne(() => HouseholdEntity)
  @JoinColumn({ name: 'household_id', foreignKeyConstraintName: 'fk_installment_plans_household' })
  household?: HouseholdEntity;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'category_id', foreignKeyConstraintName: 'fk_installment_plans_category' })
  category?: CategoryEntity;

  @Column({ name: 'original_total_cents', type: 'bigint', transformer: bigintCentsTransformer })
  originalTotalCents: number;

  @Column({ name: 'installment_count', type: 'integer' })
  installmentCount: number;

  @Column({ name: 'first_installment_date', type: 'date' })
  firstInstallmentDate: string;

  @Column({ name: 'payer_member_id', type: 'uuid' })
  payerMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({ name: 'payer_member_id', foreignKeyConstraintName: 'fk_installment_plans_payer' })
  payer?: HouseholdMemberEntity;

  @Column({ name: 'payment_method', type: 'text' })
  paymentMethod: PaymentMethod;

  /** Resolved once on the first installment date and applied to every installment. */
  @Column({ name: 'split_snapshot', type: 'jsonb' })
  splitSnapshot: SplitSnapshot;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_member_id', type: 'uuid' })
  createdByMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({
    name: 'created_by_member_id',
    foreignKeyConstraintName: 'fk_installment_plans_created_by',
  })
  createdBy?: HouseholdMemberEntity;

  @Column({ name: 'close_kind', type: 'text', nullable: true })
  closeKind: 'CANCEL' | 'PAY_OFF' | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'closed_by_member_id', type: 'uuid', nullable: true })
  closedByMemberId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by_member_id', type: 'uuid', nullable: true })
  deletedByMemberId: string | null;
}
