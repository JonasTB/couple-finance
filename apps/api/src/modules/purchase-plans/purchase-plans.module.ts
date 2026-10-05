import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/public';
import { GoalsModule } from '../goals/public';
import { HouseholdsModule } from '../households/public';
import { TransactionsModule } from '../transactions/public';
import { PurchasePlansRepository } from './application/purchase-plans.repository';
import { PurchasePlansService } from './application/purchase-plans.service';
import { PurchasePlanItemEntity } from './infrastructure/purchase-plan-item.entity';
import { PurchasePlanEntity } from './infrastructure/purchase-plan.entity';
import { TypeOrmPurchasePlansRepository } from './infrastructure/typeorm-purchase-plans.repository';
import { PurchasePlansController } from './presentation/purchase-plans.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchasePlanEntity, PurchasePlanItemEntity]),
    HouseholdsModule,
    GoalsModule,
    TransactionsModule,
    AuditModule,
  ],
  controllers: [PurchasePlansController],
  providers: [
    PurchasePlansService,
    { provide: PurchasePlansRepository, useClass: TypeOrmPurchasePlansRepository },
  ],
})
export class PurchasePlansModule {}
