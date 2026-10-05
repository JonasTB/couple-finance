import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { type AuditAction } from './audit-recorder';

export interface AuditEventRecord {
  actorUserId: string;
  action: AuditAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  occurredAt: Date;
}

/** Reads the trail of one entity. Callers must project snapshots for the viewer (privacy). */
@Injectable()
export class AuditReader {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async forEntity(
    householdId: string,
    entityType: string,
    entityId: string,
  ): Promise<AuditEventRecord[]> {
    const rows: {
      actor_user_id: string;
      action: AuditAction;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
      occurred_at: Date;
    }[] = await this.dataSource.query(
      `SELECT actor_user_id, action, before, after, occurred_at FROM audit_events
       WHERE household_id = $1 AND entity_type = $2 AND entity_id = $3
       ORDER BY occurred_at ASC, id ASC`,
      [householdId, entityType, entityId],
    );
    return rows.map((row) => ({
      actorUserId: row.actor_user_id,
      action: row.action,
      before: row.before,
      after: row.after,
      occurredAt: row.occurred_at,
    }));
  }
}
