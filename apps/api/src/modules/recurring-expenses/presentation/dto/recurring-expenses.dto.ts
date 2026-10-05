import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type ConfirmOccurrenceInput,
  MAX_AMOUNT_CENTS,
  type OccurrenceStatus,
  type OccurrenceView,
  PAYMENT_METHODS,
  type PaymentMethod,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_MAX_INTERVAL,
  type RecurrenceFrequency,
  RECURRING_AMOUNT_TYPES,
  type RecurringAmountType,
  type RecurringExpenseInput,
  type RecurringExpenseView,
  type RecurringStatus,
  TEMPLATE_SPLIT_TYPES,
  TRANSACTION_DESCRIPTION_MAX_LENGTH,
  TRANSACTION_NOTES_MAX_LENGTH,
} from '@couple-finance/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsLocalDate } from '../../../../common/validation/is-local-date';
import { trimString } from '../../../../common/validation/transforms';
import { SplitInputDto } from '../../../transactions/public';

/** The ledger's split request; CUSTOM_AMOUNT is rejected by the service (amounts vary). */
const SPLIT_DESCRIPTION = `One of ${TEMPLATE_SPLIT_TYPES.join(', ')}. Omit or null for the household default.`;

export class CreateRecurringExpenseDto implements RecurringExpenseInput {
  @ApiProperty({ example: 'Internet', maxLength: TRANSACTION_DESCRIPTION_MAX_LENGTH })
  @Transform(trimString)
  @IsString()
  @Length(1, TRANSACTION_DESCRIPTION_MAX_LENGTH)
  description!: string;

  @ApiProperty({ format: 'uuid' }) @IsUUID() categoryId!: string;

  @ApiProperty({ description: 'Integer cents', example: 12000 })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  expectedAmountCents!: number;

  @ApiProperty({ enum: RECURRING_AMOUNT_TYPES })
  @IsIn(RECURRING_AMOUNT_TYPES)
  amountType!: RecurringAmountType;

  @ApiProperty({ enum: RECURRENCE_FREQUENCIES })
  @IsIn(RECURRENCE_FREQUENCIES)
  frequency!: RecurrenceFrequency;

  @ApiProperty({ minimum: 1, maximum: RECURRENCE_MAX_INTERVAL, default: 1 })
  @IsInt()
  @Min(1)
  @Max(RECURRENCE_MAX_INTERVAL)
  interval!: number;

  @ApiProperty({ example: '2026-10-10', description: 'First occurrence; anchors later ones' })
  @IsLocalDate()
  startDate!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Last possible occurrence date' })
  @IsOptional()
  @IsLocalDate()
  endDate?: string | null;

  @ApiProperty({ format: 'uuid' }) @IsUUID() payerMemberId!: string;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ type: SplitInputDto, nullable: true, description: SPLIT_DESCRIPTION })
  @IsOptional()
  @ValidateNested()
  @Type(() => SplitInputDto)
  split?: SplitInputDto | null;

  @ApiPropertyOptional({ nullable: true, maxLength: TRANSACTION_NOTES_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(TRANSACTION_NOTES_MAX_LENGTH)
  notes?: string | null;
}

export class UpdateRecurringExpenseDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, TRANSACTION_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  expectedAmountCents?: number;

  @ApiPropertyOptional({ enum: RECURRING_AMOUNT_TYPES })
  @IsOptional()
  @IsIn(RECURRING_AMOUNT_TYPES)
  amountType?: RecurringAmountType;

  @ApiPropertyOptional({ enum: RECURRENCE_FREQUENCIES, description: 'Locked after a confirmation' })
  @IsOptional()
  @IsIn(RECURRENCE_FREQUENCIES)
  frequency?: RecurrenceFrequency;

  @ApiPropertyOptional({ description: 'Locked after a confirmation' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(RECURRENCE_MAX_INTERVAL)
  interval?: number;

  @ApiPropertyOptional({ description: 'Locked after a confirmation' })
  @IsOptional()
  @IsLocalDate()
  startDate?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsLocalDate()
  endDate?: string | null;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() payerMemberId?: string;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ type: SplitInputDto, nullable: true, description: SPLIT_DESCRIPTION })
  @IsOptional()
  @ValidateNested()
  @Type(() => SplitInputDto)
  split?: SplitInputDto | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(TRANSACTION_NOTES_MAX_LENGTH)
  notes?: string | null;
}

export class EndRecurringExpenseDto {
  @ApiPropertyOptional({ description: 'Last occurrence date kept (default: today)' })
  @IsOptional()
  @IsLocalDate()
  lastDate?: string;
}

export class ConfirmOccurrenceDto implements ConfirmOccurrenceInput {
  @ApiPropertyOptional({ description: 'Actual amount (default: expected)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  amountCents?: number;

  @ApiPropertyOptional({ description: 'Payment date (default: occurrence date)' })
  @IsOptional()
  @IsLocalDate()
  date?: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() payerMemberId?: string;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(TRANSACTION_NOTES_MAX_LENGTH)
  notes?: string | null;
}

export class OccurrencesQuery {
  @ApiProperty({ example: '2026-10-01' }) @IsLocalDate() from!: string;
  @ApiProperty({ example: '2027-03-31', description: 'Window under 24 months' })
  @IsLocalDate()
  to!: string;
}

export class ListRecurringQuery {
  @ApiPropertyOptional({ enum: ['only'] }) @IsOptional() @IsIn(['only']) deleted?: 'only';
}

export class ConfirmedOccurrenceDto {
  @ApiProperty({ format: 'uuid' }) transactionId!: string;
}

class PauseWindowDto {
  @ApiProperty() from!: string;
  @ApiProperty({ type: String, nullable: true }) to!: string | null;
}

export class RecurringExpenseDto implements RecurringExpenseView {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ format: 'uuid' }) categoryId!: string;
  @ApiProperty() expectedAmountCents!: number;
  @ApiProperty({ enum: RECURRING_AMOUNT_TYPES }) amountType!: RecurringAmountType;
  @ApiProperty({ enum: RECURRENCE_FREQUENCIES }) frequency!: RecurrenceFrequency;
  @ApiProperty() interval!: number;
  @ApiProperty() startDate!: string;
  @ApiProperty({ type: String, nullable: true }) endDate!: string | null;
  @ApiProperty({ format: 'uuid' }) payerMemberId!: string;
  @ApiProperty({ enum: PAYMENT_METHODS }) paymentMethod!: PaymentMethod;
  @ApiProperty({ type: SplitInputDto, nullable: true }) split!: SplitInputDto | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'PAUSED', 'ENDED'] }) status!: RecurringStatus;
  @ApiProperty({ type: [PauseWindowDto] }) pauses!: PauseWindowDto[];
  @ApiProperty() scheduleLocked!: boolean;
  @ApiProperty({ type: String, nullable: true }) nextOccurrenceDate!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) deletedAt!: string | null;
}

export class OccurrenceDto implements OccurrenceView {
  @ApiProperty({ format: 'uuid' }) recurringExpenseId!: string;
  @ApiProperty() occurrenceDate!: string;
  @ApiProperty({ enum: ['CONFIRMED', 'SKIPPED', 'OVERDUE', 'UPCOMING'] }) status!: OccurrenceStatus;
  @ApiProperty() description!: string;
  @ApiProperty({ format: 'uuid' }) categoryId!: string;
  @ApiProperty() expectedAmountCents!: number;
  @ApiProperty({ enum: RECURRING_AMOUNT_TYPES }) amountType!: RecurringAmountType;
  @ApiProperty({ type: String, nullable: true }) transactionId!: string | null;
  @ApiProperty({ type: Number, nullable: true }) amountCents!: number | null;
}
