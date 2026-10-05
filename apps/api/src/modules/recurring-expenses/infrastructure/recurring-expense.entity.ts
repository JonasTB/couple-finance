import type {
  PauseWindow,
  PaymentMethod,
  RecurrenceFrequency,
  RecurringAmountType,
  SplitInput,
} from '@couple-finance/shared';
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

@Entity({ name: 'recurring_expenses' })
@Check(
  'ck_recurring_expenses_amount',
  'expected_amount_cents > 0 AND expected_amount_cents <= 99999999999',
)
@Check('ck_recurring_expenses_description_length', 'char_length(description) BETWEEN 1 AND 120')
@Check('ck_recurring_expenses_notes_length', 'notes IS NULL OR char_length(notes) <= 500')
@Check('ck_recurring_expenses_amount_type', `amount_type IN ('FIXED', 'VARIABLE')`)
@Check('ck_recurring_expenses_frequency', `frequency IN ('WEEKLY', 'MONTHLY', 'YEARLY')`)
@Check('ck_recurring_expenses_interval', '"interval" BETWEEN 1 AND 12')
@Check('ck_recurring_expenses_period', 'end_date IS NULL OR end_date >= start_date')
@Check(
  'ck_recurring_expenses_payment_method',
  `payment_method IN ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'BANK_TRANSFER', 'BOLETO', 'OTHER')`,
)
// Partial index managed by the migration.
@Index('ix_recurring_expenses_household', { synchronize: false })
export class RecurringExpenseEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_recurring_expenses' })
  id: string;

  @Column({ name: 'household_id', type: 'uuid' })
  householdId: string;

  @ManyToOne(() => HouseholdEntity)
  @JoinColumn({ name: 'household_id', foreignKeyConstraintName: 'fk_recurring_expenses_household' })
  household?: HouseholdEntity;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'category_id', foreignKeyConstraintName: 'fk_recurring_expenses_category' })
  category?: CategoryEntity;

  @Column({ name: 'expected_amount_cents', type: 'bigint', transformer: bigintCentsTransformer })
  expectedAmountCents: number;

  @Column({ name: 'amount_type', type: 'text' })
  amountType: RecurringAmountType;

  @Column({ type: 'text' })
  frequency: RecurrenceFrequency;

  @Column({ type: 'integer' })
  interval: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @Column({ name: 'payer_member_id', type: 'uuid' })
  payerMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({ name: 'payer_member_id', foreignKeyConstraintName: 'fk_recurring_expenses_payer' })
  payer?: HouseholdMemberEntity;

  @Column({ name: 'payment_method', type: 'text' })
  paymentMethod: PaymentMethod;

  /** Null → the household default rule when each occurrence is confirmed. */
  @Column({ name: 'split_rule', type: 'jsonb', nullable: true })
  splitRule: SplitInput | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  pauses: PauseWindow[];

  @Column({ name: 'created_by_member_id', type: 'uuid' })
  createdByMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({
    name: 'created_by_member_id',
    foreignKeyConstraintName: 'fk_recurring_expenses_created_by',
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
}
