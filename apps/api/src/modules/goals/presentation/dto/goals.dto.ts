import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  GOAL_NAME_MAX_LENGTH,
  GOAL_NOTES_MAX_LENGTH,
  type GoalEntryInput,
  type GoalEntryType,
  type GoalEntryView,
  type GoalForecast,
  type GoalInput,
  type GoalStatus,
  type GoalView,
  MAX_AMOUNT_CENTS,
} from '@couple-finance/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsLocalDate } from '../../../../common/validation/is-local-date';
import { trimString } from '../../../../common/validation/transforms';

export class CreateGoalDto implements GoalInput {
  @ApiProperty({ example: 'Reserva de emergência', maxLength: GOAL_NAME_MAX_LENGTH })
  @Transform(trimString)
  @IsString()
  @Length(1, GOAL_NAME_MAX_LENGTH)
  name!: string;

  @ApiProperty({ description: 'Integer cents', example: 1200000 })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  targetAmountCents!: number;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsLocalDate() targetDate?: string | null;

  @ApiProperty({ type: [String], description: 'Active members taking part' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  participantMemberIds!: string[];
}

export class UpdateGoalDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, GOAL_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  targetAmountCents?: number;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsLocalDate() targetDate?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  participantMemberIds?: string[];
}

export class CreateGoalEntryDto implements GoalEntryInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID() memberId!: string;

  @ApiProperty({ enum: ['CONTRIBUTION', 'WITHDRAWAL'] })
  @IsIn(['CONTRIBUTION', 'WITHDRAWAL'])
  type!: GoalEntryType;

  @ApiProperty() @IsInt() @Min(1) @Max(MAX_AMOUNT_CENTS) amountCents!: number;

  @ApiProperty({ description: 'Today or earlier' }) @IsLocalDate() date!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: GOAL_NOTES_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(GOAL_NOTES_MAX_LENGTH)
  notes?: string | null;
}

class GoalEntryDto implements GoalEntryView {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty({ enum: ['CONTRIBUTION', 'WITHDRAWAL'] }) type!: GoalEntryType;
  @ApiProperty() amountCents!: number;
  @ApiProperty() date!: string;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) deletedAt!: string | null;
}

class GoalForecastDto implements GoalForecast {
  @ApiProperty({ type: Number, nullable: true }) paceCents!: number | null;
  @ApiProperty() paceMonths!: number;
  @ApiProperty({ type: Number, nullable: true }) monthsToGo!: number | null;
  @ApiProperty({ type: String, nullable: true }) forecastMonth!: string | null;
  @ApiProperty({ type: Number, nullable: true }) requiredMonthlyCents!: number | null;
  @ApiProperty() deadlinePassed!: boolean;
}

class MemberSavedDto {
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty() savedCents!: number;
}

export class GoalDto implements GoalView {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() targetAmountCents!: number;
  @ApiProperty({ type: String, nullable: true }) targetDate!: string | null;
  @ApiProperty({ type: [String] }) participantMemberIds!: string[];
  @ApiProperty({ enum: ['ACTIVE', 'ACHIEVED', 'ARCHIVED'] }) status!: GoalStatus;
  @ApiProperty() savedCents!: number;
  @ApiProperty() remainingCents!: number;
  @ApiProperty() progressBps!: number;
  @ApiProperty({ type: [MemberSavedDto] }) byMember!: MemberSavedDto[];
  @ApiProperty({ type: GoalForecastDto }) forecast!: GoalForecastDto;
  @ApiProperty() version!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) archivedAt!: string | null;
  @ApiPropertyOptional({ type: [GoalEntryDto], description: 'Detail only, newest first' })
  entries?: GoalEntryDto[];
}
