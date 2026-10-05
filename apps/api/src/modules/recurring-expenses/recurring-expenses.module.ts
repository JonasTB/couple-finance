import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/public';
import { CategoriesModule } from '../categories/public';
import { HouseholdsModule } from '../households/public';
import { TransactionsModule } from '../transactions/public';
import { RecurringExpensesRepository } from './application/recurring-expenses.repository';
import { RecurringExpensesService } from './application/recurring-expenses.service';
import { RecurringExpenseEntity } from './infrastructure/recurring-expense.entity';
import { RecurringOccurrenceSkipEntity } from './infrastructure/recurring-occurrence-skip.entity';
import { TypeOrmRecurringExpensesRepository } from './infrastructure/typeorm-recurring-expenses.repository';
import { RecurringExpensesController } from './presentation/recurring-expenses.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecurringExpenseEntity, RecurringOccurrenceSkipEntity]),
    HouseholdsModule,
    CategoriesModule,
    TransactionsModule,
    AuditModule,
  ],
  controllers: [RecurringExpensesController],
  providers: [
    RecurringExpensesService,
    { provide: RecurringExpensesRepository, useClass: TypeOrmRecurringExpensesRepository },
  ],
})
export class RecurringExpensesModule {}
