import type { GoalEntryType } from '@couple-finance/shared';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { bigintCentsTransformer } from '../../../common/money/bigint-cents.transformer';
import { HouseholdMemberEntity } from '../../households/persistence';
import { GoalEntity } from './goal.entity';

/** A contribution or withdrawal (bookkeeping only; no money moves). */
@Entity({ name: 'goal_contributions' })
@Check('ck_goal_contributions_type', `type IN ('CONTRIBUTION', 'WITHDRAWAL')`)
@Check('ck_goal_contributions_amount', 'amount_cents > 0 AND amount_cents <= 99999999999')
@Check('ck_goal_contributions_notes_length', 'notes IS NULL OR char_length(notes) <= 200')
@Index('ix_goal_contributions_goal', ['goalId', 'date'])
export class GoalContributionEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_goal_contributions' })
  id: string;

  @Column({ name: 'goal_id', type: 'uuid' })
  goalId: string;

  @ManyToOne(() => GoalEntity)
  @JoinColumn({ name: 'goal_id', foreignKeyConstraintName: 'fk_goal_contributions_goal' })
  goal?: GoalEntity;

  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({ name: 'member_id', foreignKeyConstraintName: 'fk_goal_contributions_member' })
  member?: HouseholdMemberEntity;

  @Column({ type: 'text' })
  type: GoalEntryType;

  @Column({ name: 'amount_cents', type: 'bigint', transformer: bigintCentsTransformer })
  amountCents: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_member_id', type: 'uuid' })
  createdByMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({
    name: 'created_by_member_id',
    foreignKeyConstraintName: 'fk_goal_contributions_created_by',
  })
  createdBy?: HouseholdMemberEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by_member_id', type: 'uuid', nullable: true })
  deletedByMemberId: string | null;
}
