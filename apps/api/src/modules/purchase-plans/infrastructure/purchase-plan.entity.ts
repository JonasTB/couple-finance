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
import { GoalEntity } from '../../goals/persistence';
import { HouseholdEntity, HouseholdMemberEntity } from '../../households/persistence';

@Entity({ name: 'purchase_plans' })
@Check('ck_purchase_plans_name_length', 'char_length(name) BETWEEN 1 AND 60')
@Check(
  'ck_purchase_plans_description_length',
  'description IS NULL OR char_length(description) <= 500',
)
@Index('ix_purchase_plans_household', ['householdId'])
export class PurchasePlanEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_purchase_plans' })
  id: string;

  @Column({ name: 'household_id', type: 'uuid' })
  householdId: string;

  @ManyToOne(() => HouseholdEntity)
  @JoinColumn({ name: 'household_id', foreignKeyConstraintName: 'fk_purchase_plans_household' })
  household?: HouseholdEntity;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'goal_id', type: 'uuid', nullable: true })
  goalId: string | null;

  @ManyToOne(() => GoalEntity)
  @JoinColumn({ name: 'goal_id', foreignKeyConstraintName: 'fk_purchase_plans_goal' })
  goal?: GoalEntity;

  @Column({ name: 'created_by_member_id', type: 'uuid' })
  createdByMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({
    name: 'created_by_member_id',
    foreignKeyConstraintName: 'fk_purchase_plans_created_by',
  })
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
