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
import { HouseholdEntity, HouseholdMemberEntity } from '../../households/persistence';

@Entity({ name: 'goals' })
@Check('ck_goals_name_length', 'char_length(name) BETWEEN 1 AND 60')
@Check('ck_goals_target', 'target_amount_cents > 0 AND target_amount_cents <= 99999999999')
@Check('ck_goals_participants', 'cardinality(participant_member_ids) >= 1')
@Index('ix_goals_household', ['householdId'])
export class GoalEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_goals' })
  id: string;

  @Column({ name: 'household_id', type: 'uuid' })
  householdId: string;

  @ManyToOne(() => HouseholdEntity)
  @JoinColumn({ name: 'household_id', foreignKeyConstraintName: 'fk_goals_household' })
  household?: HouseholdEntity;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'target_amount_cents', type: 'bigint', transformer: bigintCentsTransformer })
  targetAmountCents: number;

  @Column({ name: 'target_date', type: 'date', nullable: true })
  targetDate: string | null;

  @Column({ name: 'participant_member_ids', type: 'uuid', array: true })
  participantMemberIds: string[];

  @Column({ name: 'created_by_member_id', type: 'uuid' })
  createdByMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({ name: 'created_by_member_id', foreignKeyConstraintName: 'fk_goals_created_by' })
  createdBy?: HouseholdMemberEntity;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;
}
