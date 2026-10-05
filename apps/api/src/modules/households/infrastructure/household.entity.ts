import { type CurrencyCode, type DefaultSplitType, type SplitWeight } from '@couple-finance/shared';
import { Check, Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'households' })
@Check('ck_households_name_length', 'char_length(name) BETWEEN 1 AND 60')
@Check('ck_households_currency', `currency IN ('BRL', 'USD', 'EUR')`)
@Check(
  'ck_households_default_split_type',
  `default_split_type IN ('EQUAL', 'INCOME_PROPORTIONAL', 'CUSTOM_PERCENT')`,
)
export class HouseholdEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_households' })
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'char', length: 3 })
  currency: CurrencyCode;

  @Column({ type: 'text' })
  timezone: string;

  @Column({ name: 'default_split_type', type: 'text' })
  defaultSplitType: DefaultSplitType;

  @Column({ name: 'default_split_weights', type: 'jsonb', nullable: true })
  defaultSplitWeights: SplitWeight[] | null;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;
}
