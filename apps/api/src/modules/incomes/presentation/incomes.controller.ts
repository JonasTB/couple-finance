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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  type HouseholdIncomeOverview,
  type IncomeRecordView,
  type IncomeVisibility,
  MAX_AMOUNT_CENTS,
  type MemberIncomeView,
} from '@couple-finance/shared';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { type Actor, CurrentActor } from '../../../common/auth/current-actor.decorator';
import { IsLocalDate } from '../../../common/validation/is-local-date';
import { UuidParamPipe } from '../../../common/validation/uuid-param.pipe';
import {
  CurrentMember,
  HouseholdMemberGuard,
  type MemberContext,
  RequireHouseholdPermission,
} from '../../households/public';
import { IncomesService } from '../application/incomes.service';

export class AddIncomeDto {
  @ApiProperty({ description: 'Monthly income in cents', example: 650000 })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  monthlyAmountCents!: number;

  @ApiProperty({ example: '2026-10-01' })
  @IsLocalDate()
  effectiveFrom!: string;
}

export class IncomeOverviewQuery {
  @ApiPropertyOptional({
    example: '2026-10-04',
    description: 'Defaults to today in the household time zone',
  })
  @IsOptional()
  @IsLocalDate()
  date?: string;
}

class IncomeRecordDto implements IncomeRecordView {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() monthlyAmountCents!: number;
  @ApiProperty() effectiveFrom!: string;
  @ApiProperty({ type: String, nullable: true }) effectiveTo!: string | null;
}

class MemberIncomeDto implements MemberIncomeView {
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty() isMe!: boolean;
  @ApiProperty({ enum: ['EXACT', 'RATIO_ONLY'] }) visibility!: IncomeVisibility;
  @ApiProperty() hasIncome!: boolean;
  @ApiProperty({ type: Number, nullable: true, description: 'Null when hidden from you' })
  monthlyAmountCents!: number | null;
  @ApiProperty({ type: Number, nullable: true }) shareBps!: number | null;
}

class IncomeOverviewDto implements HouseholdIncomeOverview {
  @ApiProperty() date!: string;
  @ApiProperty({ type: [MemberIncomeDto] }) members!: MemberIncomeDto[];
}

@ApiTags('incomes')
@ApiBearerAuth()
@UseGuards(HouseholdMemberGuard)
@Controller('households/:householdId/incomes')
export class IncomesController {
  constructor(private readonly incomes: IncomesService) {}

  @Get()
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({
    type: IncomeOverviewDto,
    description: "Partners' amounts follow their visibility",
  })
  overview(
    @CurrentMember() member: MemberContext,
    @Query() query: IncomeOverviewQuery,
  ): Promise<IncomeOverviewDto> {
    return this.incomes.overview(member, query.date);
  }

  @Get('me')
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({ type: [IncomeRecordDto] })
  myHistory(@CurrentMember() member: MemberContext): Promise<IncomeRecordDto[]> {
    return this.incomes.myHistory(member);
  }

  @Post('me')
  @RequireHouseholdPermission('household.read')
  @ApiCreatedResponse({ type: IncomeRecordDto })
  add(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Body() body: AddIncomeDto,
  ): Promise<IncomeRecordDto> {
    return this.incomes.add(actor, member, body);
  }

  @Delete('me/:recordId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireHouseholdPermission('household.read')
  @ApiNoContentResponse({ description: 'Removes your latest record and reopens the previous one' })
  removeLatest(
    @CurrentActor() actor: Actor,
    @CurrentMember() member: MemberContext,
    @Param('recordId', UuidParamPipe) recordId: string,
  ): Promise<void> {
    return this.incomes.removeLatest(actor, member, recordId);
  }
}
