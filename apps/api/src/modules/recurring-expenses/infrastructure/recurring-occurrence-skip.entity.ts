import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { HouseholdMemberEntity } from '../../households/persistence';
import { RecurringExpenseEntity } from './recurring-expense.entity';

/** An occurrence a member chose not to record (FR-REC-05). Removing the row reopens it. */
@Entity({ name: 'recurring_occurrence_skips' })
@Unique('uq_recurring_occurrence_skips', ['recurringExpenseId', 'occurrenceDate'])
export class RecurringOccurrenceSkipEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_recurring_occurrence_skips' })
  id: string;

  @Column({ name: 'recurring_expense_id', type: 'uuid' })
  recurringExpenseId: string;

  @ManyToOne(() => RecurringExpenseEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'recurring_expense_id',
    foreignKeyConstraintName: 'fk_recurring_occurrence_skips_recurring',
  })
  recurringExpense?: RecurringExpenseEntity;

  @Column({ name: 'occurrence_date', type: 'date' })
  occurrenceDate: string;

  @Column({ name: 'created_by_member_id', type: 'uuid' })
  createdByMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({
    name: 'created_by_member_id',
    foreignKeyConstraintName: 'fk_recurring_occurrence_skips_created_by',
  })
  createdBy?: HouseholdMemberEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
