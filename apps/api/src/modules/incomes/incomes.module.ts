import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/public';
import { HouseholdsModule } from '../households/public';
import { HouseholdIncome } from './application/household-income.service';
import { IncomeBasis } from './application/income-basis.service';
import { IncomesRepository } from './application/incomes.repository';
import { IncomesService } from './application/incomes.service';
import { IncomeRecordEntity } from './infrastructure/income-record.entity';
import { TypeOrmIncomesRepository } from './infrastructure/typeorm-incomes.repository';
import { IncomesController } from './presentation/incomes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([IncomeRecordEntity]), HouseholdsModule, AuditModule],
  controllers: [IncomesController],
  providers: [
    IncomesService,
    IncomeBasis,
    HouseholdIncome,
    { provide: IncomesRepository, useClass: TypeOrmIncomesRepository },
  ],
  exports: [IncomeBasis, HouseholdIncome],
})
export class IncomesModule {}
