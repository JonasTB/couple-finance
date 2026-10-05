import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/public';
import { CategoriesModule } from '../categories/public';
import { HouseholdsModule } from '../households/public';
import { TransactionsModule } from '../transactions/public';
import { BudgetsRepository } from './application/budgets.repository';
import { BudgetsService } from './application/budgets.service';
import { BudgetEntity } from './infrastructure/budget.entity';
import { TypeOrmBudgetsRepository } from './infrastructure/typeorm-budgets.repository';
import { BudgetsController } from './presentation/budgets.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BudgetEntity]),
    HouseholdsModule,
    CategoriesModule,
    TransactionsModule,
    AuditModule,
  ],
  controllers: [BudgetsController],
  providers: [BudgetsService, { provide: BudgetsRepository, useClass: TypeOrmBudgetsRepository }],
  exports: [BudgetsService],
})
export class BudgetsModule {}
