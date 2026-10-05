import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { LoggingModule } from './logging/logging.module';
import { AnalyticsModule } from './modules/analytics/public';
import { AuthModule } from './modules/auth/public';
import { BudgetsModule } from './modules/budgets/public';
import { CategoriesModule } from './modules/categories/public';
import { GoalsModule } from './modules/goals/public';
import { HealthModule } from './modules/health/public';
import { HouseholdsModule } from './modules/households/public';
import { IncomesModule } from './modules/incomes/public';
import { InstallmentsModule } from './modules/installments/public';
import { InsightsModule } from './modules/insights/public';
import { PurchasePlansModule } from './modules/purchase-plans/public';
import { RecurringExpensesModule } from './modules/recurring-expenses/public';
import { TransactionsModule } from './modules/transactions/public';
import { UsersModule } from './modules/users/public';

@Module({
  imports: [
    // The root .env is loaded before bootstrap (load-env-file.ts); here we only validate.
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
    CommonModule,
    LoggingModule,
    DatabaseModule,
    RateLimitModule,
    HealthModule,
    UsersModule,
    AuthModule,
    HouseholdsModule,
    CategoriesModule,
    IncomesModule,
    TransactionsModule,
    RecurringExpensesModule,
    InstallmentsModule,
    BudgetsModule,
    GoalsModule,
    PurchasePlansModule,
    AnalyticsModule,
    InsightsModule,
  ],
})
export class AppModule {}
