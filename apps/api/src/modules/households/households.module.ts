import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/public';
import { UsersModule } from '../users/public';
import { HouseholdAccess } from './application/household-access';
import { HouseholdDirectory } from './application/household-directory';
import { HouseholdsRepository } from './application/households.repository';
import { HouseholdsService } from './application/households.service';
import { InvitationsService } from './application/invitations.service';
import { MembersService } from './application/members.service';
import { HouseholdInvitationEntity } from './infrastructure/household-invitation.entity';
import { HouseholdMemberEntity } from './infrastructure/household-member.entity';
import { HouseholdEntity } from './infrastructure/household.entity';
import { TypeOrmHouseholdsRepository } from './infrastructure/typeorm-households.repository';
import { HouseholdMemberGuard } from './presentation/household-member.guard';
import { HouseholdsController } from './presentation/households.controller';
import { InvitationsController } from './presentation/invitations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([HouseholdEntity, HouseholdMemberEntity, HouseholdInvitationEntity]),
    UsersModule,
    AuditModule,
  ],
  controllers: [HouseholdsController, InvitationsController],
  providers: [
    HouseholdsService,
    MembersService,
    InvitationsService,
    HouseholdAccess,
    HouseholdDirectory,
    HouseholdMemberGuard,
    { provide: HouseholdsRepository, useClass: TypeOrmHouseholdsRepository },
  ],
  exports: [HouseholdAccess, HouseholdDirectory, HouseholdMemberGuard],
})
export class HouseholdsModule {}
