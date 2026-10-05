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
import { UuidParamPipe } from '../../../common/validation/uuid-param.pipe';
import {
  CurrentMember,
  HouseholdMemberGuard,
  type MemberContext,
  RequireHouseholdPermission,
} from '../../households/public';
import { TransactionsService } from '../application/transactions.service';
import {
  CreateTransactionDto,
  ListTransactionsQuery,
  PreviewSplitDto,
  RecalculateRangeDto,
  RecalculateRangeResultDto,
  SplitPreviewDto,
  TransactionDto,
  TransactionHistoryEntryDto,
  TransactionPageDto,
  UpdateTransactionDto,
} from './dto/transactions.dto';

/** All members read and write every household expense, including individual ones (ADR-005). */
@ApiTags('transactions')
@ApiBearerAuth()
@ApiUnprocessableEntityResponse({
  description: 'SPLIT_SUM_MISMATCH, INCOME_BASIS_MISSING or CATEGORY_ARCHIVED',
})
@UseGuards(HouseholdMemberGuard)
@Controller('households/:householdId/transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: TransactionPageDto })
  list(
    @CurrentMember() member: MemberContext,
    @Query() query: ListTransactionsQuery,
  ): Promise<TransactionPageDto> {
    const { q, ...rest } = query;
    return this.transactions.list(member, { ...rest, ...(q ? { text: q } : {}) });
  }

  @Post()
  @RequireHouseholdPermission('household.read')
  @ApiCreatedResponse({ type: TransactionDto })
  create(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Body() body: CreateTransactionDto,
  ): Promise<TransactionDto> {
    return this.transactions.create(actor, member, body);
  }

  @Post('preview-split')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({
    type: SplitPreviewDto,
    description: 'Allocations for a draft expense; nothing is saved',
  })
  preview(
    @CurrentMember() member: MemberContext,
    @Body() body: PreviewSplitDto,
  ): Promise<SplitPreviewDto> {
    return this.transactions.preview(member, body);
  }

  @Post('recalculate-split')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({
    type: RecalculateRangeResultDto,
    description: 'Income-proportional expenses in the range',
  })
  recalculateRange(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Body() body: RecalculateRangeDto,
  ): Promise<RecalculateRangeResultDto> {
    return this.transactions.recalculateRange(actor, member, body.from, body.to);
  }

  @Get(':transactionId')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: TransactionDto })
  get(
    @CurrentMember() member: MemberContext,
    @Param('transactionId', UuidParamPipe) id: string,
  ): Promise<TransactionDto> {
    return this.transactions.get(member, id);
  }

  @Get(':transactionId/history')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: [TransactionHistoryEntryDto] })
  history(
    @CurrentMember() member: MemberContext,
    @Param('transactionId', UuidParamPipe) id: string,
  ): Promise<TransactionHistoryEntryDto[]> {
    return this.transactions.history(member, id);
  }

  @Patch(':transactionId')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: TransactionDto })
  @ApiConflictResponse({ description: 'VERSION_CONFLICT (details.current has the latest version)' })
  update(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('transactionId', UuidParamPipe) id: string,
    @Body() body: UpdateTransactionDto,
  ): Promise<TransactionDto> {
    return this.transactions.update(actor, member, id, body);
  }

  @Delete(':transactionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireHouseholdPermission('household.read')
  @ApiNoContentResponse({ description: 'Soft delete; restorable' })
  remove(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('transactionId', UuidParamPipe) id: string,
  ): Promise<void> {
    return this.transactions.remove(actor, member, id);
  }

  @Post(':transactionId/restore')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: TransactionDto })
  restore(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('transactionId', UuidParamPipe) id: string,
  ): Promise<TransactionDto> {
    return this.transactions.restore(actor, member, id);
  }

  @Post(':transactionId/recalculate-split')
  @HttpCode(HttpStatus.OK)
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: TransactionDto })
  recalculate(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('transactionId', UuidParamPipe) id: string,
  ): Promise<TransactionDto> {
    return this.transactions.recalculate(actor, member, id);
  }
}
