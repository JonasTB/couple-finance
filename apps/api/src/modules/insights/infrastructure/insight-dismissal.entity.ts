import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { HouseholdEntity } from '../../households/persistence';
import { UserEntity } from '../../users/persistence';

/** A user's dismissal of one insight fingerprint in one household (FR-INS-04). */
@Entity({ name: 'insight_dismissals' })
@Check('ck_insight_dismissals_fingerprint_length', 'char_length(fingerprint) BETWEEN 1 AND 120')
export class InsightDismissalEntity {
  @PrimaryColumn({
    name: 'household_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_insight_dismissals',
  })
  householdId: string;

  @ManyToOne(() => HouseholdEntity)
  @JoinColumn({ name: 'household_id', foreignKeyConstraintName: 'fk_insight_dismissals_household' })
  household?: HouseholdEntity;

  @PrimaryColumn({
    name: 'user_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_insight_dismissals',
  })
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_insight_dismissals_user' })
  user?: UserEntity;

  @PrimaryColumn({
    name: 'fingerprint',
    type: 'text',
    primaryKeyConstraintName: 'pk_insight_dismissals',
  })
  fingerprint: string;

  /** Set from the application clock. */
  @Column({ name: 'dismissed_at', type: 'timestamptz' })
  dismissedAt: Date;
}
