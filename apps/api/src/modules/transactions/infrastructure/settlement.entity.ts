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
import { HouseholdEntity, HouseholdMemberEntity } from '../../households/persistence';

@Entity({ name: 'settlements' })
@Check('ck_settlements_amount', 'amount_cents > 0 AND amount_cents <= 99999999999')
@Check('ck_settlements_distinct_members', 'from_member_id <> to_member_id')
@Check('ck_settlements_notes_length', 'notes IS NULL OR char_length(notes) <= 200')
// Partial index managed by the migration.
@Index('ix_settlements_household_date', { synchronize: false })
export class SettlementEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_settlements' })
  id: string;

  @Column({ name: 'household_id', type: 'uuid' })
  householdId: string;

  @ManyToOne(() => HouseholdEntity)
  @JoinColumn({ name: 'household_id', foreignKeyConstraintName: 'fk_settlements_household' })
  household?: HouseholdEntity;

  @Column({ name: 'from_member_id', type: 'uuid' })
  fromMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({ name: 'from_member_id', foreignKeyConstraintName: 'fk_settlements_from_member' })
  fromMember?: HouseholdMemberEntity;

  @Column({ name: 'to_member_id', type: 'uuid' })
  toMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({ name: 'to_member_id', foreignKeyConstraintName: 'fk_settlements_to_member' })
  toMember?: HouseholdMemberEntity;

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
    foreignKeyConstraintName: 'fk_settlements_created_by',
  })
  createdBy?: HouseholdMemberEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by_member_id', type: 'uuid', nullable: true })
  deletedByMemberId: string | null;
}
