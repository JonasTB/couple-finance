import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { UserEntity } from '../../users/persistence';
import { type StoredInvitationStatus } from '../domain/invitation-policy';
import { HouseholdMemberEntity } from './household-member.entity';
import { HouseholdEntity } from './household.entity';

@Entity({ name: 'household_invitations' })
@Unique('uq_household_invitations_token_hash', ['tokenHash'])
@Check('ck_household_invitations_status', `status IN ('PENDING', 'ACCEPTED', 'REVOKED')`)
@Index('ux_household_invitations_pending_email', ['householdId', 'email'], {
  unique: true,
  where: `status = 'PENDING'`,
})
export class HouseholdInvitationEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_household_invitations' })
  id: string;

  @Column({ name: 'household_id', type: 'uuid' })
  householdId: string;

  @ManyToOne(() => HouseholdEntity)
  @JoinColumn({
    name: 'household_id',
    foreignKeyConstraintName: 'fk_household_invitations_household',
  })
  household?: HouseholdEntity;

  @Column({ type: 'citext' })
  email: string;

  /** SHA-256 (hex) of the opaque token; the raw token is never stored. */
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash: string;

  @Column({ name: 'invited_by_member_id', type: 'uuid' })
  invitedByMemberId: string;

  @ManyToOne(() => HouseholdMemberEntity)
  @JoinColumn({
    name: 'invited_by_member_id',
    foreignKeyConstraintName: 'fk_household_invitations_invited_by',
  })
  invitedBy?: HouseholdMemberEntity;

  @Column({ type: 'text' })
  status: StoredInvitationStatus;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'accepted_by_user_id', type: 'uuid', nullable: true })
  acceptedByUserId: string | null;

  @ManyToOne(() => UserEntity)
  @JoinColumn({
    name: 'accepted_by_user_id',
    foreignKeyConstraintName: 'fk_household_invitations_accepted_by',
  })
  acceptedBy?: UserEntity;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
