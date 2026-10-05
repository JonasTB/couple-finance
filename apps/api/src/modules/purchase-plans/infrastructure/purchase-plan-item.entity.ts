import type { PurchaseItemStatus, PurchasePriority } from '@couple-finance/shared';
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
import { HouseholdMemberEntity } from '../../households/persistence';
import { TransactionEntity } from '../../transactions/persistence';
import { PurchasePlanEntity } from './purchase-plan.entity';

@Entity({ name: 'purchase_plan_items' })
@Check('ck_purchase_plan_items_name_length', 'char_length(name) BETWEEN 1 AND 80')
@Check(
  'ck_purchase_plan_items_estimate',
  'estimated_price_cents > 0 AND estimated_price_cents <= 99999999999',
)
@Check('ck_purchase_plan_items_quantity', 'quantity BETWEEN 1 AND 999')
@Check('ck_purchase_plan_items_priority', `priority IN ('HIGH', 'MEDIUM', 'LOW')`)
@Check('ck_purchase_plan_items_status', `status IN ('PENDING', 'PURCHASED', 'FUTURE')`)
@Check(
  'ck_purchase_plan_items_purchase',
  `(status = 'PURCHASED') = (paid_price_cents IS NOT NULL)
            AND (status = 'PURCHASED') = (purchased_at IS NOT NULL)
            AND (transaction_id IS NULL OR status = 'PURCHASED')
            AND (paid_price_cents IS NULL OR (paid_price_cents >= 0 AND paid_price_cents <= 99999999999))`,
)
@Check(
  'ck_purchase_plan_items_texts',
  '(url IS NULL OR char_length(url) <= 500) AND (notes IS NULL OR char_length(notes) <= 500)',
)
@Index('ix_purchase_plan_items_plan', ['purchasePlanId'])
export class PurchasePlanItemEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_purchase_plan_items' })
  id: string;

  @Column({ name: 'purchase_plan_id', type: 'uuid' })
  purchasePlanId: string;

  @ManyToOne(() => PurchasePlanEntity)
  @JoinColumn({ name: 'purchase_plan_id', foreignKeyConstraintName: 'fk_purchase_plan_items_plan' })
  plan?: PurchasePlanEntity;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'estimated_price_cents', type: 'bigint', transformer: bigintCentsTransformer })
  estimatedPriceCents: number;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'text' })
  priority: PurchasePriority;

  @Column({ type: 'text' })
  status: PurchaseItemStatus;

  @Column({
    name: 'paid_price_cents',
    type: 'bigint',
    nullable: true,
    transformer: bigintCentsTransformer,
  })
  paidPriceCents: number | null;

  @Column({ name: 'purchased_at', type: 'date', nullable: true })
  purchasedAt: string | null;

  @Column({ name: 'transaction_id', type: 'uuid', nullable: true })
  transactionId: string | null;

  @ManyToOne(() => TransactionEntity)
  @JoinColumn({
    name: 'transaction_id',
    foreignKeyConstraintName: 'fk_purchase_plan_items_transaction',
  })
  transaction?: TransactionEntity;

  @Column({ name: 'responsible_member_id', type: 'uuid', nullable: true })
  responsibleMemberId: string | null;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({
    name: 'responsible_member_id',
    foreignKeyConstraintName: 'fk_purchase_plan_items_responsible',
  })
  responsible?: HouseholdMemberEntity;

  @Column({ type: 'text', nullable: true })
  url: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_member_id', type: 'uuid' })
  createdByMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({
    name: 'created_by_member_id',
    foreignKeyConstraintName: 'fk_purchase_plan_items_created_by',
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
