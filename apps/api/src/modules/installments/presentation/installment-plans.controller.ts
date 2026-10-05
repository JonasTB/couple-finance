import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Actor, CurrentActor } from '../../../common/auth/current-actor.decorator';
import { UuidParamPipe } from '../../../common/validation/uuid-param.pipe';
import {
  CurrentMember,
  HouseholdMemberGuard,
  type MemberContext,
  RequireHouseholdPermission,
} from '../../households/public';
import { InstallmentPlansService } from '../application/installment-plans.service';
import {
  CloseInstallmentPlanDto,
  CreateInstallmentPlanDto,
  InstallmentPlanDto,
  InstallmentSummaryDto,
  ListInstallmentPlansQuery,
} from './dto/installment-plans.dto';

/** Installment purchases (ADR-007): finite plans whose installments are ordinary expenses. */
@ApiTags('installment-plans')
@ApiBearerAuth()
@UseGuards(HouseholdMemberGuard)
@Controller('households/:householdId/installment-plans')
export class InstallmentPlansController {
  constructor(private readonly plans: InstallmentPlansService) {}

  @Get()
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: [InstallmentPlanDto] })
  list(
    @CurrentMember() member: MemberContext,
    @Query() query: ListInstallmentPlansQuery,
  ): Promise<InstallmentPlanDto[]> {
    return this.plans.list(member, query.deleted);
  }

  @Post()
  @RequireHouseholdPermission('household.read')
  @ApiCreatedResponse({ type: InstallmentPlanDto, description: 'Creates every installment' })
  create(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Body() body: CreateInstallmentPlanDto,
  ): Promise<InstallmentPlanDto> {
    return this.plans.create(actor, member, body);
  }

  @Get('summary')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({
    type: InstallmentSummaryDto,
    description: 'Monthly commitment (12 months) and release timeline',
  })
  summary(@CurrentMember() member: MemberContext): Promise<InstallmentSummaryDto> {
    return this.plans.summary(member);
  }

  @Get(':planId')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: InstallmentPlanDto })
  get(
    @CurrentMember() member: MemberContext,
    @Param('planId', UuidParamPipe) id: string,
  ): Promise<InstallmentPlanDto> {
    return this.plans.get(member, id);
  }

  @Post(':planId/close')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: InstallmentPlanDto })
  @ApiConflictResponse({ description: 'INSTALLMENT_PLAN_CLOSED' })
  close(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('planId', UuidParamPipe) id: string,
    @Body() body: CloseInstallmentPlanDto,
  ): Promise<InstallmentPlanDto> {
    return this.plans.close(actor, member, id, body);
  }

  @Delete(':planId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireHouseholdPermission('household.read')
  @ApiNoContentResponse({ description: 'Soft-deletes the plan and its expenses; restorable' })
  remove(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('planId', UuidParamPipe) id: string,
  ): Promise<void> {
    return this.plans.remove(actor, member, id);
  }

  @Post(':planId/restore')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: InstallmentPlanDto })
  restore(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('planId', UuidParamPipe) id: string,
  ): Promise<InstallmentPlanDto> {
    return this.plans.restore(actor, member, id);
  }
}
