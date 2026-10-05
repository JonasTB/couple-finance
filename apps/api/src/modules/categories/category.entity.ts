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
import { HouseholdEntity } from '../households/persistence';

@Entity({ name: 'categories' })
@Check('ck_categories_name_length', 'char_length(name) BETWEEN 1 AND 40')
// Expression index managed by the migration (case-insensitive unique names per parent).
@Index('ux_categories_name', { synchronize: false })
export class CategoryEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_categories' })
  id: string;

  @Index('ix_categories_household')
  @Column({ name: 'household_id', type: 'uuid' })
  householdId: string;

  @ManyToOne(() => HouseholdEntity)
  @JoinColumn({ name: 'household_id', foreignKeyConstraintName: 'fk_categories_household' })
  household?: HouseholdEntity;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'parent_id', foreignKeyConstraintName: 'fk_categories_parent' })
  parent?: CategoryEntity;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;
}
