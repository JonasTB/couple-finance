import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Actor, CurrentActor } from '../../../common/auth/current-actor.decorator';
import { HouseholdsService } from '../application/households.service';
import { InvitationsService } from '../application/invitations.service';
import { type MemberContext } from '../application/member-context';
import { MembersService } from '../application/members.service';
import {
  CreateHouseholdDto,
  HouseholdDetailDto,
  HouseholdMemberDto,
  HouseholdSummaryDto,
  TransferOwnershipDto,
  UpdateHouseholdDto,
  UpdateMyMembershipDto,
} from './dto/households.dto';
import { CreateInvitationDto, CreatedInvitationDto, InvitationDto } from './dto/invitations.dto';
import {
  CurrentMember,
  HouseholdMemberGuard,
  RequireHouseholdPermission,
} from './household-member.guard';
import { UuidParamPipe } from '../../../common/validation/uuid-param.pipe';

@ApiTags('households')
@ApiBearerAuth()
@ApiNotFoundResponse({
  description: 'NOT_FOUND — also for households the caller is not a member of',
})
@ApiForbiddenResponse({ description: 'FORBIDDEN — member without the required role (owner only)' })
@Controller('households')
export class HouseholdsController {
  constructor(
    private readonly households: HouseholdsService,
    private readonly members: MembersService,
    private readonly invitations: InvitationsService,
  ) {}

  @Get()
  @ApiOkResponse({ type: [HouseholdSummaryDto], description: 'Active households of the caller' })
  list(@CurrentActor() actor: Actor): Promise<HouseholdSummaryDto[]> {
    return this.households.listForUser(actor.userId);
  }

  @Post()
  @ApiCreatedResponse({ type: HouseholdDetailDto, description: 'The caller becomes OWNER' })
  create(
    @CurrentActor() actor: Actor,
    @Body() body: CreateHouseholdDto,
  ): Promise<HouseholdDetailDto> {
    return this.households.create(actor, body);
  }

  @Get(':householdId')
  @UseGuards(HouseholdMemberGuard)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: HouseholdDetailDto })
  get(@CurrentMember() member: MemberContext): Promise<HouseholdDetailDto> {
    return this.households.get(member);
  }

  @Patch(':householdId')
  @UseGuards(HouseholdMemberGuard)
  @RequireHouseholdPermission('household.manage')
  @ApiOkResponse({ type: HouseholdDetailDto })
  @ApiConflictResponse({ description: 'VERSION_CONFLICT' })
  update(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Body() body: UpdateHouseholdDto,
  ): Promise<HouseholdDetailDto> {
    return this.households.update(actor, member, body);
  }

  @Delete(':householdId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(HouseholdMemberGuard)
  @RequireHouseholdPermission('household.manage')
  @ApiNoContentResponse({ description: 'Archives the household (soft delete)' })
  archive(@CurrentActor() actor: Actor, @CurrentMember() member: MemberContext): Promise<void> {
    return this.households.archive(actor, member);
  }

  @Get(':householdId/members')
  @UseGuards(HouseholdMemberGuard)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: [HouseholdMemberDto] })
  listMembers(@CurrentMember() member: MemberContext): Promise<HouseholdMemberDto[]> {
    return this.members.list(member);
  }

  @Patch(':householdId/members/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(HouseholdMemberGuard)
  @RequireHouseholdPermission('household.read')
  @ApiNoContentResponse({
    description: 'Updates your own membership preferences (income visibility)',
  })
  updateMyMembership(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Body() body: UpdateMyMembershipDto,
  ): Promise<void> {
    return this.members.setIncomeVisibility(actor, member, body.incomeVisibility);
  }

  @Delete(':householdId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(HouseholdMemberGuard)
  @RequireHouseholdPermission('members.manage')
  @ApiNoContentResponse()
  removeMember(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('memberId', UuidParamPipe) memberId: string,
  ): Promise<void> {
    return this.members.remove(actor, member, memberId);
  }

  @Post(':householdId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(HouseholdMemberGuard)
  @RequireHouseholdPermission('household.read')
  @ApiNoContentResponse({ description: 'The last member leaving archives the household' })
  @ApiConflictResponse({ description: 'OWNERSHIP_TRANSFER_REQUIRED' })
  leave(@CurrentActor() actor: Actor, @CurrentMember() member: MemberContext): Promise<void> {
    return this.members.leave(actor, member);
  }

  @Post(':householdId/transfer-ownership')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(HouseholdMemberGuard)
  @RequireHouseholdPermission('members.manage')
  @ApiNoContentResponse()
  transferOwnership(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Body() body: TransferOwnershipDto,
  ): Promise<void> {
    return this.members.transferOwnership(actor, member, body.memberId);
  }

  @Get(':householdId/invitations')
  @UseGuards(HouseholdMemberGuard)
  @RequireHouseholdPermission('invitations.manage')
  @ApiOkResponse({ type: [InvitationDto], description: 'Pending (and expired, not yet replaced)' })
  listInvitations(@CurrentMember() member: MemberContext): Promise<InvitationDto[]> {
    return this.invitations.list(member);
  }

  @Post(':householdId/invitations')
  @UseGuards(HouseholdMemberGuard)
  @RequireHouseholdPermission('invitations.manage')
  @ApiCreatedResponse({ type: CreatedInvitationDto })
  @ApiConflictResponse({ description: 'HOUSEHOLD_FULL or ALREADY_MEMBER' })
  createInvitation(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Body() body: CreateInvitationDto,
  ): Promise<CreatedInvitationDto> {
    return this.invitations.create(actor, member, body.email);
  }

  @Delete(':householdId/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(HouseholdMemberGuard)
  @RequireHouseholdPermission('invitations.manage')
  @ApiNoContentResponse()
  revokeInvitation(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('invitationId', UuidParamPipe) invitationId: string,
  ): Promise<void> {
    return this.invitations.revoke(actor, member, invitationId);
  }
}
