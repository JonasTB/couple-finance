import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/public';
import { HouseholdsModule } from '../households/public';
import { TransactionsModule } from '../transactions/public';
import { InstallmentPlansRepository } from './application/installment-plans.repository';
import { InstallmentPlansService } from './application/installment-plans.service';
import { InstallmentPlanEntity } from './infrastructure/installment-plan.entity';
import { TypeOrmInstallmentPlansRepository } from './infrastructure/typeorm-installment-plans.repository';
import { InstallmentPlansController } from './presentation/installment-plans.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([InstallmentPlanEntity]),
    HouseholdsModule,
    TransactionsModule,
    AuditModule,
  ],
  controllers: [InstallmentPlansController],
  providers: [
    InstallmentPlansService,
    { provide: InstallmentPlansRepository, useClass: TypeOrmInstallmentPlansRepository },
  ],
  exports: [InstallmentPlansService],
})
export class InstallmentsModule {}
