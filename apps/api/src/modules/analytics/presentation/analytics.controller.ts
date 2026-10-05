import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  ANALYTICS_DEFAULT_MONTHS,
  ANALYTICS_MAX_MONTHS,
  type AnalyticsView,
} from '@couple-finance/shared';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import {
  CurrentMember,
  HouseholdMemberGuard,
  type MemberContext,
  RequireHouseholdPermission,
} from '../../households/public';
import { AnalyticsService } from '../application/analytics.service';

export class AnalyticsQuery {
  @ApiPropertyOptional({
    example: '2026-10',
    description: 'Last month of the window; defaults to the current month (household time zone)',
  })
  @IsOptional()
  @Matches(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month?: string;

  @ApiPropertyOptional({
    default: ANALYTICS_DEFAULT_MONTHS,
    minimum: 1,
    maximum: ANALYTICS_MAX_MONTHS,
    description: 'Months in the window, ending at `month`',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ANALYTICS_MAX_MONTHS)
  months?: number;
}

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(HouseholdMemberGuard)
@Controller('households/:householdId/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({
    description:
      'Monthly trend (shared scope), fixed vs variable, installment load, income commitment, ' +
      'paid vs planned shares, categories, comparison with the previous month and the ' +
      '3-month average, and goal evolution (docs/domain/CALCULATIONS.md §11)',
  })
  history(
    @CurrentMember() member: MemberContext,
    @Query() query: AnalyticsQuery,
  ): Promise<AnalyticsView> {
    return this.analytics.history(member, query);
  }
}
