import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Persistence model for `users` (infrastructure; never exposed through the API). */
@Entity({ name: 'users' })
@Unique('uq_users_email', ['email'])
@Check('ck_users_display_name_length', 'char_length(display_name) BETWEEN 1 AND 60')
export class UserEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_users' })
  id: string;

  @Column({ type: 'citext' })
  email: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash: string;

  @Column({ name: 'display_name', type: 'text' })
  displayName: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
