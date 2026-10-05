import { Injectable } from '@nestjs/common';
import { type Actor } from '../../common/auth/current-actor.decorator';
import { entityManagerOf } from '../../common/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../common/database/unit-of-work';
import { IdGenerator } from '../../common/ids/id-generator';
import { Clock } from '../../common/time/clock';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'RECALCULATE';

export interface AuditEntry {
  householdId: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  /** JSON-safe snapshots. Never include secrets (token hashes, password hashes). */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Writes audit events inside the caller's transaction, so the change and its audit record
 * commit or roll back together (ADR-008).
 */
@Injectable()
export class AuditRecorder {
  constructor(
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async record(tx: TransactionContext, actor: Actor, entry: AuditEntry): Promise<void> {
    // Parameterized SQL: TypeORM's insert typing cannot express free-form jsonb snapshots.
    await entityManagerOf(tx).query(
      `INSERT INTO audit_events
         (id, household_id, actor_user_id, entity_type, entity_id, action, before, after, request_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)`,
      [
        this.ids.next(),
        entry.householdId,
        actor.userId,
        entry.entityType,
        entry.entityId,
        entry.action,
        entry.before ? JSON.stringify(entry.before) : null,
        entry.after ? JSON.stringify(entry.after) : null,
        actor.requestId ?? null,
        this.clock.now(),
      ],
    );
  }
}
