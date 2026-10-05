import {
  type HouseholdRole,
  type IncomeVisibility,
  type MemberStatus,
} from '@couple-finance/shared';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { UserEntity } from '../../users/persistence';
import { HouseholdEntity } from './household.entity';

@Entity({ name: 'household_members' })
@Check('ck_household_members_role', `role IN ('OWNER', 'MEMBER')`)
@Check('ck_household_members_status', `status IN ('ACTIVE', 'LEFT', 'REMOVED')`)
@Check('ck_household_members_income_visibility', `income_visibility IN ('EXACT', 'RATIO_ONLY')`)
@Index('ux_household_members_active_user', ['householdId', 'userId'], {
  unique: true,
  where: `status = 'ACTIVE'`,
})
@Index('ux_household_members_active_owner', ['householdId'], {
  unique: true,
  where: `role = 'OWNER' AND status = 'ACTIVE'`,
})
@Index('ix_household_members_user_active', ['userId'], { where: `status = 'ACTIVE'` })
export class HouseholdMemberEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_household_members' })
  id: string;

  @Column({ name: 'household_id', type: 'uuid' })
  householdId: string;

  @ManyToOne(() => HouseholdEntity)
  @JoinColumn({ name: 'household_id', foreignKeyConstraintName: 'fk_household_members_household' })
  household?: HouseholdEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_household_members_user' })
  user?: UserEntity;

  @Column({ type: 'text' })
  role: HouseholdRole;

  @Column({ type: 'text' })
  status: MemberStatus;

  @Column({ name: 'income_visibility', type: 'text', default: 'RATIO_ONLY' })
  incomeVisibility: IncomeVisibility;

  @Column({ name: 'joined_at', type: 'timestamptz' })
  joinedAt: Date;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt: Date | null;
}
