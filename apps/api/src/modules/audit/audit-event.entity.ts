import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { type AuditAction } from './audit-recorder';

/**
 * Append-only audit trail (ADR-008). No foreign keys on purpose: the log must survive the
 * anonymization or removal of the records and people it mentions.
 */
@Entity({ name: 'audit_events' })
@Index('ix_audit_events_entity', ['householdId', 'entityType', 'entityId', 'occurredAt'])
@Check(
  'ck_audit_events_action',
  `action IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'RECALCULATE')`,
)
export class AuditEventEntity {
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_audit_events' })
  id: string;

  @Column({ name: 'household_id', type: 'uuid', nullable: true })
  householdId: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId: string;

  @Column({ name: 'entity_type', type: 'text' })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ type: 'text' })
  action: AuditAction;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;

  @Column({ name: 'request_id', type: 'text', nullable: true })
  requestId: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;
}
