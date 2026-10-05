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
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { type Actor, CurrentActor } from '../../../common/auth/current-actor.decorator';
import { UuidParamPipe } from '../../../common/validation/uuid-param.pipe';
import {
  CurrentMember,
  HouseholdMemberGuard,
  type MemberContext,
  RequireHouseholdPermission,
} from '../../households/public';
import { GoalsService } from '../application/goals.service';
import { CreateGoalDto, CreateGoalEntryDto, GoalDto, UpdateGoalDto } from './dto/goals.dto';

/** Savings goals (FR-GOAL-01..03): bookkeeping of money set aside elsewhere. */
@ApiTags('goals')
@ApiBearerAuth()
@UseGuards(HouseholdMemberGuard)
@Controller('households/:householdId/goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: [GoalDto] })
  list(@CurrentMember() member: MemberContext): Promise<GoalDto[]> {
    return this.goals.list(member);
  }

  @Post()
  @RequireHouseholdPermission('household.read')
  @ApiCreatedResponse({ type: GoalDto })
  create(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Body() body: CreateGoalDto,
  ): Promise<GoalDto> {
    return this.goals.create(actor, member, body);
  }

  @Get(':goalId')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: GoalDto })
  get(
    @CurrentMember() member: MemberContext,
    @Param('goalId', UuidParamPipe) id: string,
  ): Promise<GoalDto> {
    return this.goals.get(member, id);
  }

  @Patch(':goalId')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: GoalDto })
  @ApiConflictResponse({ description: 'VERSION_CONFLICT or ARCHIVED' })
  update(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('goalId', UuidParamPipe) id: string,
    @Body() body: UpdateGoalDto,
  ): Promise<GoalDto> {
    return this.goals.update(actor, member, id, body);
  }

  @Post(':goalId/archive')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: GoalDto })
  archive(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('goalId', UuidParamPipe) id: string,
  ): Promise<GoalDto> {
    return this.goals.setArchived(actor, member, id, true);
  }

  @Post(':goalId/restore')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: GoalDto })
  restore(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('goalId', UuidParamPipe) id: string,
  ): Promise<GoalDto> {
    return this.goals.setArchived(actor, member, id, false);
  }

  @Post(':goalId/entries')
  @RequireHouseholdPermission('household.read')
  @ApiCreatedResponse({ type: GoalDto, description: 'Contribution or withdrawal' })
  @ApiUnprocessableEntityResponse({ description: 'GOAL_INSUFFICIENT_BALANCE' })
  addEntry(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('goalId', UuidParamPipe) id: string,
    @Body() body: CreateGoalEntryDto,
  ): Promise<GoalDto> {
    return this.goals.addEntry(actor, member, id, body);
  }

  @Delete(':goalId/entries/:entryId')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: GoalDto, description: 'Soft delete' })
  removeEntry(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('goalId', UuidParamPipe) id: string,
    @Param('entryId', UuidParamPipe) entryId: string,
  ): Promise<GoalDto> {
    return this.goals.setEntryDeleted(actor, member, id, entryId, true);
  }

  @Post(':goalId/entries/:entryId/restore')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: GoalDto })
  restoreEntry(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('goalId', UuidParamPipe) id: string,
    @Param('entryId', UuidParamPipe) entryId: string,
  ): Promise<GoalDto> {
    return this.goals.setEntryDeleted(actor, member, id, entryId, false);
  }
}
