import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/public';
import { GoalsModule } from '../goals/public';
import { HouseholdsModule } from '../households/public';
import { IncomesModule } from '../incomes/public';
import { TransactionsModule } from '../transactions/public';
import { AnalyticsService } from './application/analytics.service';
import { DashboardService } from './application/dashboard.service';
import { AnalyticsController } from './presentation/analytics.controller';
import { DashboardController } from './presentation/dashboard.controller';

/** Intelligence context: read models only, no owned financial truth (ADR-009). */
@Module({
  imports: [HouseholdsModule, CategoriesModule, TransactionsModule, IncomesModule, GoalsModule],
  controllers: [DashboardController, AnalyticsController],
  providers: [DashboardService, AnalyticsService],
  exports: [DashboardService, AnalyticsService],
})
export class AnalyticsModule {}
