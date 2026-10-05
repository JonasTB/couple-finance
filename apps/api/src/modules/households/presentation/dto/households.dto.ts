import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type CurrencyCode,
  DEFAULT_SPLIT_TYPES,
  DEFAULT_TIMEZONE,
  type DefaultSplitRule,
  type DefaultSplitType,
  HOUSEHOLD_NAME_MAX_LENGTH,
  type HouseholdDetail,
  type HouseholdMemberView,
  type HouseholdRole,
  type HouseholdSummary,
  type IncomeVisibility,
  type MemberStatus,
  type SplitWeight,
  SUPPORTED_CURRENCIES,
} from '@couple-finance/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { trimString } from '../../../../common/validation/transforms';

export class SplitWeightDto implements SplitWeight {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  memberId!: string;

  @ApiProperty({ description: 'Basis points (10000 = 100%)', example: 6000 })
  @IsInt()
  bps!: number;
}

export class DefaultSplitDto implements DefaultSplitRule {
  @ApiProperty({ enum: DEFAULT_SPLIT_TYPES })
  @IsIn(DEFAULT_SPLIT_TYPES)
  type!: DefaultSplitType;

  @ApiPropertyOptional({ type: [SplitWeightDto], description: 'Only for CUSTOM_PERCENT' })
  @IsOptional()
  @ValidateNested({ each: true })
  @ArrayMaxSize(20)
  @Type(() => SplitWeightDto)
  weights?: SplitWeightDto[];
}

export class CreateHouseholdDto {
  @ApiProperty({ example: 'Casa da Ana e do Bruno', maxLength: HOUSEHOLD_NAME_MAX_LENGTH })
  @Transform(trimString)
  @IsString()
  @Length(1, HOUSEHOLD_NAME_MAX_LENGTH)
  name!: string;

  @ApiPropertyOptional({ enum: SUPPORTED_CURRENCIES, default: 'BRL' })
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency: CurrencyCode = 'BRL';

  @ApiPropertyOptional({ example: DEFAULT_TIMEZONE, default: DEFAULT_TIMEZONE })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone: string = DEFAULT_TIMEZONE;

  @ApiPropertyOptional({
    type: DefaultSplitDto,
    description: 'EQUAL (default) or INCOME_PROPORTIONAL',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DefaultSplitDto)
  defaultSplit?: DefaultSplitDto;
}

export class UpdateHouseholdDto {
  @ApiProperty({ description: 'Version read with the household (optimistic concurrency)' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ maxLength: HOUSEHOLD_NAME_MAX_LENGTH })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, HOUSEHOLD_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({ example: DEFAULT_TIMEZONE })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ type: DefaultSplitDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DefaultSplitDto)
  defaultSplit?: DefaultSplitDto;
}

export class UpdateMyMembershipDto {
  @ApiProperty({
    enum: ['EXACT', 'RATIO_ONLY'],
    description:
      'RATIO_ONLY hides your exact income from partners. With two members, a partner who knows their own income can still infer yours from the proportion.',
  })
  @IsIn(['EXACT', 'RATIO_ONLY'])
  incomeVisibility!: IncomeVisibility;
}

export class TransferOwnershipDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  memberId!: string;
}

export class HouseholdSummaryDto implements HouseholdSummary {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: SUPPORTED_CURRENCIES }) currency!: CurrencyCode;
  @ApiProperty() timezone!: string;
  @ApiProperty({ enum: ['OWNER', 'MEMBER'] }) role!: HouseholdRole;
  @ApiProperty() activeMemberCount!: number;
}

class MeDto {
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ enum: ['OWNER', 'MEMBER'] }) role!: HouseholdRole;
}

export class HouseholdDetailDto implements HouseholdDetail {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: SUPPORTED_CURRENCIES }) currency!: CurrencyCode;
  @ApiProperty() timezone!: string;
  @ApiProperty({ type: DefaultSplitDto }) defaultSplit!: DefaultSplitDto;
  @ApiProperty() version!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: MeDto }) me!: MeDto;
}

export class HouseholdMemberDto implements HouseholdMemberView {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['OWNER', 'MEMBER'] }) role!: HouseholdRole;
  @ApiProperty({ enum: ['ACTIVE', 'LEFT', 'REMOVED'] }) status!: MemberStatus;
  @ApiProperty({ enum: ['EXACT', 'RATIO_ONLY'] }) incomeVisibility!: IncomeVisibility;
  @ApiProperty() joinedAt!: string;
  @ApiProperty() isMe!: boolean;
}
