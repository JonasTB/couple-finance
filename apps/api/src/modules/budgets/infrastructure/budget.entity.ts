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
  UpdateDateColumn,
} from 'typeorm';
import { bigintCentsTransformer } from '../../../common/money/bigint-cents.transformer';
import { CategoryEntity } from '../../categories/persistence';
import { HouseholdEntity, HouseholdMemberEntity } from '../../households/persistence';

@Entity({ name: 'budgets' })
@Check('ck_budgets_amount', 'amount_cents > 0 AND amount_cents <= 99999999999')
@Check(
  'ck_budgets_months',
  `extract(day FROM from_month) = 1
            AND (until_month IS NULL OR (extract(day FROM until_month) = 1 AND until_month > from_month))`,
)
@Exclusion(
  'ex_budgets_no_overlap',
  `USING gist (
          "household_id" WITH =,
          (COALESCE("category_id", '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
          daterange("from_month", "until_month") WITH &&
        ) WHERE ("deleted_at" IS NULL)`,
)
// Partial index managed by the migration.
@Index('ix_budgets_household', { synchronize: false })
export class BudgetEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_budgets' })
  id: string;

  @Column({ name: 'household_id', type: 'uuid' })
  householdId: string;

  @ManyToOne(() => HouseholdEntity)
  @JoinColumn({ name: 'household_id', foreignKeyConstraintName: 'fk_budgets_household' })
  household?: HouseholdEntity;

  /** Null = the household total. */
  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'category_id', foreignKeyConstraintName: 'fk_budgets_category' })
  category?: CategoryEntity;

  @Column({ name: 'amount_cents', type: 'bigint', transformer: bigintCentsTransformer })
  amountCents: number;

  /** First day of the first month. */
  @Column({ name: 'from_month', type: 'date' })
  fromMonth: string;

  /** First day of the month after the last one (exclusive); null = open-ended. */
  @Column({ name: 'until_month', type: 'date', nullable: true })
  untilMonth: string | null;

  @Column({ name: 'created_by_member_id', type: 'uuid' })
  createdByMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({ name: 'created_by_member_id', foreignKeyConstraintName: 'fk_budgets_created_by' })
  createdBy?: HouseholdMemberEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by_member_id', type: 'uuid', nullable: true })
  deletedByMemberId: string | null;
}
