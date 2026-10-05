import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Exclusion,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { bigintCentsTransformer } from '../../../common/money/bigint-cents.transformer';
import { HouseholdEntity, HouseholdMemberEntity } from '../../households/persistence';

@Entity({ name: 'income_records' })
@Check(
  'ck_income_records_amount',
  'monthly_amount_cents > 0 AND monthly_amount_cents <= 99999999999',
)
@Check('ck_income_records_period', 'effective_to IS NULL OR effective_to > effective_from')
@Exclusion(
  'ex_income_records_no_overlap',
  `USING gist ("member_id" WITH =, daterange("effective_from", "effective_to") WITH &&) WHERE ("deleted_at" IS NULL)`,
)
@Index('ix_income_records_member', ['memberId', 'effectiveFrom'])
export class IncomeRecordEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_income_records' })
  id: string;

  @Column({ name: 'household_id', type: 'uuid' })
  householdId: string;

  @ManyToOne(() => HouseholdEntity)
  @JoinColumn({ name: 'household_id', foreignKeyConstraintName: 'fk_income_records_household' })
  household?: HouseholdEntity;

  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({ name: 'member_id', foreignKeyConstraintName: 'fk_income_records_member' })
  member?: HouseholdMemberEntity;

  @Column({ name: 'monthly_amount_cents', type: 'bigint', transformer: bigintCentsTransformer })
  monthlyAmountCents: number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
