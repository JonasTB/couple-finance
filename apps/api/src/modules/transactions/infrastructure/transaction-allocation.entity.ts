import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { bigintCentsTransformer } from '../../../common/money/bigint-cents.transformer';
import { HouseholdMemberEntity } from '../../households/persistence';
import { TransactionEntity } from './transaction.entity';

@Entity({ name: 'transaction_allocations' })
@Unique('uq_transaction_allocations_member', ['transactionId', 'memberId'])
@Check('ck_transaction_allocations_amount', 'amount_cents >= 0')
export class TransactionAllocationEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_transaction_allocations' })
  id: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => TransactionEntity, (transaction) => transaction.allocations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'transaction_id',
    foreignKeyConstraintName: 'fk_transaction_allocations_transaction',
  })
  transaction?: TransactionEntity;

  @Index('ix_transaction_allocations_member')
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({ name: 'member_id', foreignKeyConstraintName: 'fk_transaction_allocations_member' })
  member?: HouseholdMemberEntity;

  @Column({ name: 'amount_cents', type: 'bigint', transformer: bigintCentsTransformer })
  amountCents: number;

  /** bps, 1 or cents depending on the split type (see SplitSnapshot). */
  @Column({ type: 'bigint', transformer: bigintCentsTransformer })
  weight: number;
}
