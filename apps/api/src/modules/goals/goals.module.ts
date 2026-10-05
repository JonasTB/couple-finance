import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/public';
import { HouseholdsModule } from '../households/public';
import { GoalsRepository } from './application/goals.repository';
import { GoalsService } from './application/goals.service';
import { GoalContributionEntity } from './infrastructure/goal-contribution.entity';
import { GoalEntity } from './infrastructure/goal.entity';
import { TypeOrmGoalsRepository } from './infrastructure/typeorm-goals.repository';
import { GoalsController } from './presentation/goals.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([GoalEntity, GoalContributionEntity]),
    HouseholdsModule,
    AuditModule,
  ],
  controllers: [GoalsController],
  providers: [GoalsService, { provide: GoalsRepository, useClass: TypeOrmGoalsRepository }],
  exports: [GoalsService],
})
export class GoalsModule {}
