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
import { type RefreshTokenRevokedReason } from '../domain/refresh-token-policy';

@Entity({ name: 'refresh_tokens' })
@Unique('uq_refresh_tokens_token_hash', ['tokenHash'])
@Check('ck_refresh_tokens_revoked_reason', `revoked_reason IN ('LOGOUT', 'REUSE_DETECTED')`)
export class RefreshTokenEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_refresh_tokens' })
  id: string;

  @Index('ix_refresh_tokens_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_refresh_tokens_user' })
  user?: UserEntity;

  @Index('ix_refresh_tokens_family_id')
  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  /** SHA-256 (hex) of the opaque token; the raw token is never stored. */
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotatedAt: Date | null;

  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  replacedById: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_reason', type: 'text', nullable: true })
  revokedReason: RefreshTokenRevokedReason | null;
}
