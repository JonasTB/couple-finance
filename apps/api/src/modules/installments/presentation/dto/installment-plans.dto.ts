import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type CloseInstallmentPlanInput,
  type CommitmentMonth,
  INSTALLMENT_MAX_COUNT,
  INSTALLMENT_MIN_COUNT,
  type InstallmentPlanInput,
  type InstallmentPlanStatus,
  type InstallmentPlanView,
  type InstallmentStatus,
  type InstallmentSummary,
  type InstallmentView,
  MAX_AMOUNT_CENTS,
  PAYMENT_METHODS,
  type PaymentMethod,
  type ReleaseMonth,
  type SplitSnapshotView,
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

export class CreateInstallmentPlanDto implements InstallmentPlanInput {
  @ApiProperty({ example: 'Geladeira', maxLength: TRANSACTION_DESCRIPTION_MAX_LENGTH })
  @Transform(trimString)
  @IsString()
  @Length(1, TRANSACTION_DESCRIPTION_MAX_LENGTH)
  description!: string;

  @ApiProperty({ format: 'uuid' }) @IsUUID() categoryId!: string;

  @ApiPropertyOptional({ description: 'Total in cents (send this or installmentAmountCents)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  totalAmountCents?: number;

  @ApiPropertyOptional({ description: 'Each installment in cents (or totalAmountCents)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  installmentAmountCents?: number;

  @ApiProperty({ minimum: INSTALLMENT_MIN_COUNT, maximum: INSTALLMENT_MAX_COUNT })
  @IsInt()
  @Min(INSTALLMENT_MIN_COUNT)
  @Max(INSTALLMENT_MAX_COUNT)
  installmentCount!: number;

  @ApiProperty({ example: '2026-10-10' }) @IsLocalDate() firstInstallmentDate!: string;

  @ApiProperty({ format: 'uuid' }) @IsUUID() payerMemberId!: string;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({
    type: SplitInputDto,
    description: `One of ${TEMPLATE_SPLIT_TYPES.join(', ')}; omit for the household default`,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SplitInputDto)
  split?: SplitInputDto;

  @ApiPropertyOptional({ nullable: true, maxLength: TRANSACTION_NOTES_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(TRANSACTION_NOTES_MAX_LENGTH)
  notes?: string | null;
}

export class CloseInstallmentPlanDto implements CloseInstallmentPlanInput {
  @ApiProperty({ enum: ['CANCEL', 'PAY_OFF'] })
  @IsIn(['CANCEL', 'PAY_OFF'])
  kind!: 'CANCEL' | 'PAY_OFF';

  @ApiPropertyOptional({ description: 'Cut-off and payoff date (default: today)' })
  @IsOptional()
  @IsLocalDate()
  date?: string;

  @ApiPropertyOptional({ description: 'Required for PAY_OFF' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  payoffAmountCents?: number;
}

export class ListInstallmentPlansQuery {
  @ApiPropertyOptional({ enum: ['only'] }) @IsOptional() @IsIn(['only']) deleted?: 'only';
}

class InstallmentDto implements InstallmentView {
  @ApiProperty() number!: number;
  @ApiProperty({ format: 'uuid' }) transactionId!: string;
  @ApiProperty() date!: string;
  @ApiProperty() amountCents!: number;
  @ApiProperty({ enum: ['PAID', 'REMAINING'] }) status!: InstallmentStatus;
  @ApiProperty() payoff!: boolean;
}

class NextInstallmentDto {
  @ApiProperty() number!: number;
  @ApiProperty() date!: string;
  @ApiProperty() amountCents!: number;
}

export class InstallmentPlanDto implements InstallmentPlanView {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ format: 'uuid' }) categoryId!: string;
  @ApiProperty({ format: 'uuid' }) payerMemberId!: string;
  @ApiProperty({ enum: PAYMENT_METHODS }) paymentMethod!: PaymentMethod;
  @ApiProperty() installmentCount!: number;
  @ApiProperty() firstInstallmentDate!: string;
  @ApiProperty() originalTotalCents!: number;
  @ApiProperty() totalCents!: number;
  @ApiProperty() paidCount!: number;
  @ApiProperty() paidCents!: number;
  @ApiProperty() remainingCount!: number;
  @ApiProperty() remainingCents!: number;
  @ApiProperty() installmentAmountCents!: number;
  @ApiProperty({ type: NextInstallmentDto, nullable: true })
  nextInstallment!: NextInstallmentDto | null;
  @ApiProperty({ type: String, nullable: true }) releaseMonth!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'COMPLETED', 'CANCELLED', 'PAID_OFF'] })
  status!: InstallmentPlanStatus;
  @ApiProperty({ type: Object }) split!: SplitSnapshotView;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: String, nullable: true }) closedAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) deletedAt!: string | null;
  @ApiPropertyOptional({ type: [InstallmentDto], description: 'Detail endpoint only' })
  installments?: InstallmentDto[];
}

class CommitmentMonthDto implements CommitmentMonth {
  @ApiProperty() month!: string;
  @ApiProperty() installmentsCents!: number;
  @ApiProperty() activePlans!: number;
}

class ReleasedPlanDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() description!: string;
  @ApiProperty() installmentAmountCents!: number;
}

class ReleaseMonthDto implements ReleaseMonth {
  @ApiProperty() month!: string;
  @ApiProperty() releasedCents!: number;
  @ApiProperty({ type: [ReleasedPlanDto] }) plans!: ReleasedPlanDto[];
}

export class InstallmentSummaryDto implements InstallmentSummary {
  @ApiProperty({ type: [CommitmentMonthDto] }) months!: CommitmentMonthDto[];
  @ApiProperty({ type: [ReleaseMonthDto] }) releases!: ReleaseMonthDto[];
}
