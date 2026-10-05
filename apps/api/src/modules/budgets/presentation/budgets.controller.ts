import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type Actor, CurrentActor } from '../../../common/auth/current-actor.decorator';
import {
  CurrentMember,
  HouseholdMemberGuard,
  type MemberContext,
  RequireHouseholdPermission,
} from '../../households/public';
import { BudgetsService } from '../application/budgets.service';
import { BudgetChangeDto, BudgetMonthDto, BudgetMonthQuery } from './dto/budgets.dto';

/** Monthly budgets (FR-BUD-01..04): no rollover, shared spend only, changes from a month on. */
@ApiTags('budgets')
@ApiBearerAuth()
@UseGuards(HouseholdMemberGuard)
@Controller('households/:householdId/budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({
    type: BudgetMonthDto,
    description: 'Budgets in effect in the month, with status',
  })
  month(
    @CurrentMember() member: MemberContext,
    @Query() query: BudgetMonthQuery,
  ): Promise<BudgetMonthDto> {
    return this.budgets.month(member, query.month);
  }

  @Post('changes')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: BudgetMonthDto, description: 'The month the change starts' })
  @ApiConflictResponse({ description: 'CONFLICT (concurrent change)' })
  change(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Body() body: BudgetChangeDto,
  ): Promise<BudgetMonthDto> {
    return this.budgets.change(actor, member, body);
  }
}
