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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  type DismissInsightInput,
  INSIGHT_FINGERPRINT_PATTERN,
  type InsightsView,
} from '@couple-finance/shared';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { validationFailed } from '../../../common/errors/app.exception';
import {
  CurrentMember,
  HouseholdMemberGuard,
  type MemberContext,
  RequireHouseholdPermission,
} from '../../households/public';
import { InsightsService } from '../application/insights.service';

export class InsightsQuery {
  @ApiPropertyOptional({
    example: '2026-10',
    description: 'Calendar month; defaults to the current month in the household time zone',
  })
  @IsOptional()
  @Matches(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month?: string;
}

export class DismissInsightDto implements DismissInsightInput {
  @ApiProperty({ example: 'CATEGORY_ABOVE_AVERAGE:2026-10:0199a0b0-0000-7000-8000-0000000000c1' })
  @IsString()
  @MaxLength(120)
  @Matches(INSIGHT_FINGERPRINT_PATTERN, { message: 'fingerprint must be RULE:YYYY-MM:subject' })
  fingerprint!: string;
}

function checkedFingerprint(value: string): string {
  if (value.length > 120 || !INSIGHT_FINGERPRINT_PATTERN.test(value)) {
    throw validationFailed([
      { field: 'fingerprint', constraints: ['fingerprint must be RULE:YYYY-MM:subject'] },
    ]);
  }
  return value;
}

@ApiTags('insights')
@ApiBearerAuth()
@UseGuards(HouseholdMemberGuard)
@Controller('households/:householdId/insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get()
  @RequireHouseholdPermission('household.read')
  @ApiOkResponse({
    description:
      'Deterministic insights of the month with rule id, version, thresholds, metrics and ' +
      'evidence; dismissed ones are flagged for the current user (docs/domain/CALCULATIONS.md §10)',
  })
  month(
    @CurrentMember() member: MemberContext,
    @Query() query: InsightsQuery,
  ): Promise<InsightsView> {
    return this.insights.month(member, query.month);
  }

  @Post('dismissals')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireHouseholdPermission('household.read')
  @ApiNoContentResponse({ description: 'Hides the insight for the current user (idempotent)' })
  async dismiss(
    @CurrentMember() member: MemberContext,
    @Body() body: DismissInsightDto,
  ): Promise<void> {
    await this.insights.dismiss(member, body.fingerprint);
  }

  @Delete('dismissals/:fingerprint')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireHouseholdPermission('household.read')
  @ApiNoContentResponse({ description: 'Shows the insight again for the current user' })
  async undo(
    @CurrentMember() member: MemberContext,
    @Param('fingerprint') fingerprint: string,
  ): Promise<void> {
    await this.insights.undoDismissal(member, checkedFingerprint(fingerprint));
  }
}
