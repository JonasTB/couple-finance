import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InsightDismissalsRepository } from '../application/insight-dismissals.repository';
import { InsightDismissalEntity } from './insight-dismissal.entity';

@Injectable()
export class TypeOrmInsightDismissalsRepository extends InsightDismissalsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async forUser(householdId: string, userId: string): Promise<Map<string, Date>> {
    const rows = await this.dataSource.manager.find(InsightDismissalEntity, {
      where: { householdId, userId },
    });
    return new Map(rows.map((row) => [row.fingerprint, row.dismissedAt]));
  }

  async dismiss(householdId: string, userId: string, fingerprint: string, at: Date): Promise<void> {
    await this.dataSource.manager
      .createQueryBuilder()
      .insert()
      .into(InsightDismissalEntity)
      .values({ householdId, userId, fingerprint, dismissedAt: at })
      .orIgnore()
      .execute();
  }

  async undo(householdId: string, userId: string, fingerprint: string): Promise<void> {
    await this.dataSource.manager.delete(InsightDismissalEntity, {
      householdId,
      userId,
      fingerprint,
    });
  }
}
