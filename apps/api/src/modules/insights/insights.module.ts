import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsModule } from '../analytics/public';
import { BudgetsModule } from '../budgets/public';
import { HouseholdsModule } from '../households/public';
import { InstallmentsModule } from '../installments/public';
import { InsightDismissalsRepository } from './application/insight-dismissals.repository';
import { InsightsService } from './application/insights.service';
import { InsightDismissalEntity } from './infrastructure/insight-dismissal.entity';
import { TypeOrmInsightDismissalsRepository } from './infrastructure/typeorm-insight-dismissals.repository';
import { InsightsController } from './presentation/insights.controller';

/** Intelligence context: deterministic insights over the read models (ADR-009, ADR-017). */
@Module({
  imports: [
    TypeOrmModule.forFeature([InsightDismissalEntity]),
    HouseholdsModule,
    AnalyticsModule,
    BudgetsModule,
    InstallmentsModule,
  ],
  controllers: [InsightsController],
  providers: [
    InsightsService,
    { provide: InsightDismissalsRepository, useClass: TypeOrmInsightDismissalsRepository },
  ],
})
export class InsightsModule {}
