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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { type Actor, CurrentActor } from '../../../common/auth/current-actor.decorator';
import { LocalDateParamPipe } from '../../../common/validation/local-date-param.pipe';
import { UuidParamPipe } from '../../../common/validation/uuid-param.pipe';
import {
  CurrentMember,
  HouseholdMemberGuard,
  type MemberContext,
  RequireHouseholdPermission,
} from '../../households/public';
import { RecurringExpensesService } from '../application/recurring-expenses.service';
import {
  ConfirmedOccurrenceDto,
  ConfirmOccurrenceDto,
  CreateRecurringExpenseDto,
  EndRecurringExpenseDto,
  ListRecurringQuery,
  OccurrenceDto,
  OccurrencesQuery,
  RecurringExpenseDto,
  UpdateRecurringExpenseDto,
} from './dto/recurring-expenses.dto';

/** Recurring expenses (ADR-007): templates project occurrences; members confirm or skip them. */
@ApiTags('recurring-expenses')
@ApiBearerAuth()
@UseGuards(HouseholdMemberGuard)
@Controller('households/:householdId/recurring-expenses')
export class RecurringExpensesController {
  constructor(private readonly recurring: RecurringExpensesService) {}

  @Get()
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: [RecurringExpenseDto] })
  list(
    @CurrentMember() member: MemberContext,
    @Query() query: ListRecurringQuery,
  ): Promise<RecurringExpenseDto[]> {
    return this.recurring.list(member, query.deleted);
  }

  @Post()
  @RequireHouseholdPermission('household.read')
  @ApiCreatedResponse({ type: RecurringExpenseDto })
  create(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Body() body: CreateRecurringExpenseDto,
  ): Promise<RecurringExpenseDto> {
    return this.recurring.create(actor, member, body);
  }

  @Get('occurrences')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({
    type: [OccurrenceDto],
    description: 'Projected occurrences of every recurring expense (window under 24 months)',
  })
  occurrences(
    @CurrentMember() member: MemberContext,
    @Query() query: OccurrencesQuery,
  ): Promise<OccurrenceDto[]> {
    return this.recurring.occurrences(member, query.from, query.to);
  }

  @Get(':recurringId')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: RecurringExpenseDto })
  get(
    @CurrentMember() member: MemberContext,
    @Param('recurringId', UuidParamPipe) id: string,
  ): Promise<RecurringExpenseDto> {
    return this.recurring.get(member, id);
  }

  @Patch(':recurringId')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: RecurringExpenseDto, description: 'Applies to open occurrences only' })
  @ApiConflictResponse({ description: 'VERSION_CONFLICT or RECURRENCE_SCHEDULE_LOCKED' })
  update(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('recurringId', UuidParamPipe) id: string,
    @Body() body: UpdateRecurringExpenseDto,
  ): Promise<RecurringExpenseDto> {
    return this.recurring.update(actor, member, id, body);
  }

  @Post(':recurringId/pause')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: RecurringExpenseDto })
  pause(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('recurringId', UuidParamPipe) id: string,
  ): Promise<RecurringExpenseDto> {
    return this.recurring.pause(actor, member, id);
  }

  @Post(':recurringId/resume')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: RecurringExpenseDto })
  resume(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('recurringId', UuidParamPipe) id: string,
  ): Promise<RecurringExpenseDto> {
    return this.recurring.resume(actor, member, id);
  }

  @Post(':recurringId/end')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: RecurringExpenseDto })
  end(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('recurringId', UuidParamPipe) id: string,
    @Body() body: EndRecurringExpenseDto,
  ): Promise<RecurringExpenseDto> {
    return this.recurring.end(actor, member, id, body.lastDate);
  }

  @Delete(':recurringId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireHouseholdPermission('household.read')
  @ApiNoContentResponse({ description: 'Soft delete; confirmed expenses stay' })
  remove(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('recurringId', UuidParamPipe) id: string,
  ): Promise<void> {
    return this.recurring.remove(actor, member, id);
  }

  @Post(':recurringId/restore')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: RecurringExpenseDto })
  restore(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('recurringId', UuidParamPipe) id: string,
  ): Promise<RecurringExpenseDto> {
    return this.recurring.restore(actor, member, id);
  }

  @Post(':recurringId/occurrences/:date/confirm')
  @RequireHouseholdPermission('household.read')
  @ApiCreatedResponse({ type: ConfirmedOccurrenceDto, description: 'The expense created' })
  @ApiConflictResponse({ description: 'OCCURRENCE_ALREADY_CONFIRMED' })
  @ApiUnprocessableEntityResponse({ description: 'OCCURRENCE_NOT_SCHEDULED, INCOME_BASIS_MISSING' })
  async confirm(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('recurringId', UuidParamPipe) id: string,
    @Param('date', LocalDateParamPipe) date: string,
    @Body() body: ConfirmOccurrenceDto,
  ): Promise<ConfirmedOccurrenceDto> {
    return { transactionId: await this.recurring.confirm(actor, member, id, date, body) };
  }

  @Post(':recurringId/occurrences/:date/skip')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireHouseholdPermission('household.read')
  @ApiNoContentResponse({ description: 'Idempotent' })
  skip(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('recurringId', UuidParamPipe) id: string,
    @Param('date', LocalDateParamPipe) date: string,
  ): Promise<void> {
    return this.recurring.skip(actor, member, id, date);
  }

  @Delete(':recurringId/occurrences/:date/skip')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireHouseholdPermission('household.read')
  @ApiNoContentResponse({ description: 'Reopens a skipped occurrence; idempotent' })
  unskip(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('recurringId', UuidParamPipe) id: string,
    @Param('date', LocalDateParamPipe) date: string,
  ): Promise<void> {
    return this.recurring.unskip(actor, member, id, date);
  }
}
