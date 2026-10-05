import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { type DashboardView } from '@couple-finance/shared';
import { IsOptional, Matches } from 'class-validator';
import {
  CurrentMember,
  HouseholdMemberGuard,
  type MemberContext,
  RequireHouseholdPermission,
} from '../../households/public';
import { DashboardService } from '../application/dashboard.service';

export class DashboardQuery {
  @ApiPropertyOptional({
    example: '2026-10',
    description: 'Calendar month; defaults to the current month in the household time zone',
  })
  @IsOptional()
  @Matches(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month?: string;
}

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(HouseholdMemberGuard)
@Controller('households/:householdId/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({
    description:
      'Monthly totals, paid vs planned shares (shared scope), deviation explanation, ' +
      'period and cumulative balances (docs/domain/CALCULATIONS.md §3–4)',
  })
  monthly(
    @CurrentMember() member: MemberContext,
    @Query() query: DashboardQuery,
  ): Promise<DashboardView> {
    return this.dashboard.monthly(member, query.month);
  }
}
