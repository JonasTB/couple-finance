import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAX_AMOUNT_CENTS,
  SETTLEMENT_NOTES_MAX_LENGTH,
  type SettlementInput,
  type SettlementView,
} from '@couple-finance/shared';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { IsLocalDate } from '../../../../common/validation/is-local-date';

export class CreateSettlementDto implements SettlementInput {
  @ApiProperty({ format: 'uuid', description: 'Who transferred the money' })
  @IsUUID()
  fromMemberId!: string;

  @ApiProperty({ format: 'uuid', description: 'Who received it' })
  @IsUUID()
  toMemberId!: string;

  @ApiProperty({ description: 'Integer cents (ADR-002)', example: 35000 })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  amountCents!: number;

  @ApiProperty({ example: '2026-10-04' })
  @IsLocalDate()
  date!: string;

  @ApiPropertyOptional({ maxLength: SETTLEMENT_NOTES_MAX_LENGTH, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(SETTLEMENT_NOTES_MAX_LENGTH)
  notes?: string | null;
}

export class ListSettlementsQuery {
  @ApiPropertyOptional() @IsOptional() @IsLocalDate() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsLocalDate() to?: string;
  @ApiPropertyOptional({ enum: ['only'], description: 'List deleted settlements only' })
  @IsOptional()
  @IsIn(['only'])
  deleted?: 'only';
}

export class SettlementDto implements SettlementView {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) fromMemberId!: string;
  @ApiProperty({ format: 'uuid' }) toMemberId!: string;
  @ApiProperty() amountCents!: number;
  @ApiProperty() date!: string;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ format: 'uuid' }) createdByMemberId!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) deletedAt!: string | null;
}
