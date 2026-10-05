import type { PaymentMethod, SplitType } from '@couple-finance/shared';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintCentsTransformer } from '../../../common/money/bigint-cents.transformer';
import { CategoryEntity } from '../../categories/persistence';
import { HouseholdEntity, HouseholdMemberEntity } from '../../households/persistence';
import { type SplitSnapshot } from '../domain/split';
import { TransactionAllocationEntity } from './transaction-allocation.entity';

@Entity({ name: 'transactions' })
@Check('ck_transactions_amount', 'amount_cents > 0 AND amount_cents <= 99999999999')
@Check('ck_transactions_description_length', 'char_length(description) BETWEEN 1 AND 120')
@Check('ck_transactions_notes_length', 'notes IS NULL OR char_length(notes) <= 500')
@Check('ck_transactions_tags', 'cardinality(tags) <= 10')
@Check(
  'ck_transactions_split_type',
  `split_type IN ('EQUAL', 'INCOME_PROPORTIONAL', 'CUSTOM_PERCENT', 'CUSTOM_AMOUNT', 'INDIVIDUAL')`,
)
@Check(
  'ck_transactions_payment_method',
  `payment_method IN ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'BANK_TRANSFER', 'BOLETO', 'OTHER')`,
)
@Check(
  'ck_transactions_recurring_origin',
  '(recurring_expense_id IS NULL) = (occurrence_date IS NULL)',
)
@Check(
  'ck_transactions_installment_origin',
  `(installment_plan_id IS NULL) = (installment_number IS NULL)
            AND (installment_plan_id IS NULL) = (installment_count IS NULL)
            AND (installment_plan_id IS NOT NULL OR NOT installment_payoff)
            AND (installment_number IS NULL OR installment_number BETWEEN 1 AND installment_count)`,
)
@Check(
  'ck_transactions_single_origin',
  'recurring_expense_id IS NULL OR installment_plan_id IS NULL',
)
// Partial/descending indexes are managed by the migration.
@Index('ix_transactions_household_date', { synchronize: false })
@Index('ix_transactions_household_category', { synchronize: false })
@Index('ux_transactions_recurring_occurrence', { synchronize: false })
@Index('ux_transactions_installment', { synchronize: false })
@Index('ix_transactions_household_deleted', { synchronize: false })
export class TransactionEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_transactions' })
  id: string;

  @Column({ name: 'household_id', type: 'uuid' })
  householdId: string;

  @ManyToOne(() => HouseholdEntity)
  @JoinColumn({ name: 'household_id', foreignKeyConstraintName: 'fk_transactions_household' })
  household?: HouseholdEntity;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'amount_cents', type: 'bigint', transformer: bigintCentsTransformer })
  amountCents: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'category_id', foreignKeyConstraintName: 'fk_transactions_category' })
  category?: CategoryEntity;

  @Column({ name: 'payer_member_id', type: 'uuid' })
  payerMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({ name: 'payer_member_id', foreignKeyConstraintName: 'fk_transactions_payer' })
  payer?: HouseholdMemberEntity;

  @Column({ name: 'payment_method', type: 'text' })
  paymentMethod: PaymentMethod;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({ name: 'split_type', type: 'text' })
  splitType: SplitType;

  @Column({ name: 'split_snapshot', type: 'jsonb' })
  splitSnapshot: SplitSnapshot;

  /**
   * Origin (ADR-007). No foreign keys: the ledger does not depend on the commitments modules;
   * they write both sides in one database transaction.
   */
  @Column({ name: 'recurring_expense_id', type: 'uuid', nullable: true })
  recurringExpenseId: string | null;

  @Column({ name: 'occurrence_date', type: 'date', nullable: true })
  occurrenceDate: string | null;

  @Column({ name: 'installment_plan_id', type: 'uuid', nullable: true })
  installmentPlanId: string | null;

  @Column({ name: 'installment_number', type: 'integer', nullable: true })
  installmentNumber: number | null;

  @Column({ name: 'installment_count', type: 'integer', nullable: true })
  installmentCount: number | null;

  @Column({ name: 'installment_payoff', type: 'boolean', default: false })
  installmentPayoff: boolean;

  @Column({ name: 'created_by_member_id', type: 'uuid' })
  createdByMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({
    name: 'created_by_member_id',
    foreignKeyConstraintName: 'fk_transactions_created_by',
  })
  createdBy?: HouseholdMemberEntity;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by_member_id', type: 'uuid', nullable: true })
  deletedByMemberId: string | null;

  @OneToMany(() => TransactionAllocationEntity, (allocation) => allocation.transaction)
  allocations?: TransactionAllocationEntity[];
}
