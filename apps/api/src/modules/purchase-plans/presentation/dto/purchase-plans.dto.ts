import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAX_AMOUNT_CENTS,
  PURCHASE_ITEM_MAX_QUANTITY,
  PURCHASE_ITEM_NAME_MAX_LENGTH,
  PURCHASE_PLAN_NAME_MAX_LENGTH,
  PURCHASE_PRIORITIES,
  type PurchaseInput,
  type PurchaseItemInput,
  type PurchaseItemStatus,
  type PurchaseItemView,
  type PurchasePlanInput,
  type PurchasePlanStatus,
  type PurchasePlanTotals,
  type PurchasePlanView,
  type PurchasePriority,
} from '@couple-finance/shared';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsLocalDate } from '../../../../common/validation/is-local-date';
import { trimString } from '../../../../common/validation/transforms';

const OPEN_STATUSES = ['PENDING', 'FUTURE'] as const;

export class CreatePurchasePlanDto implements PurchasePlanInput {
  @ApiProperty({ example: 'Casita', maxLength: PURCHASE_PLAN_NAME_MAX_LENGTH })
  @Transform(trimString)
  @IsString()
  @Length(1, PURCHASE_PLAN_NAME_MAX_LENGTH)
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  goalId?: string | null;
}

export class UpdatePurchasePlanDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, PURCHASE_PLAN_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null unlinks the goal' })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsUUID()
  goalId?: string | null;
}

export class CreatePurchaseItemDto implements PurchaseItemInput {
  @ApiProperty({ example: 'Sofá', maxLength: PURCHASE_ITEM_NAME_MAX_LENGTH })
  @Transform(trimString)
  @IsString()
  @Length(1, PURCHASE_ITEM_NAME_MAX_LENGTH)
  name!: string;

  @ApiProperty({ description: 'Unit estimate in cents' })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  estimatedPriceCents!: number;

  @ApiProperty({ minimum: 1, maximum: PURCHASE_ITEM_MAX_QUANTITY })
  @IsInt()
  @Min(1)
  @Max(PURCHASE_ITEM_MAX_QUANTITY)
  quantity!: number;

  @ApiProperty({ enum: PURCHASE_PRIORITIES })
  @IsIn(PURCHASE_PRIORITIES)
  priority!: PurchasePriority;

  @ApiProperty({ enum: OPEN_STATUSES })
  @IsIn(OPEN_STATUSES)
  status!: 'PENDING' | 'FUTURE';

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  responsibleMemberId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  url?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpdatePurchaseItemDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, PURCHASE_ITEM_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  estimatedPriceCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PURCHASE_ITEM_MAX_QUANTITY)
  quantity?: number;

  @ApiPropertyOptional({ enum: PURCHASE_PRIORITIES })
  @IsOptional()
  @IsIn(PURCHASE_PRIORITIES)
  priority?: PurchasePriority;

  @ApiPropertyOptional({ enum: OPEN_STATUSES })
  @IsOptional()
  @IsIn(OPEN_STATUSES)
  status?: 'PENDING' | 'FUTURE';

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsUUID()
  responsibleMemberId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  url?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class PurchaseDto implements PurchaseInput {
  @ApiProperty({ description: 'Actually paid for all units, in cents' })
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT_CENTS)
  paidPriceCents!: number;

  @ApiPropertyOptional({ description: 'Default: today' })
  @IsOptional()
  @IsLocalDate()
  purchasedAt?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'A recorded expense' })
  @IsOptional()
  @IsUUID()
  transactionId?: string | null;
}

class LinkedExpenseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() description!: string;
  @ApiProperty() amountCents!: number;
  @ApiProperty() date!: string;
}

class PurchaseItemDto implements PurchaseItemView {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() estimatedPriceCents!: number;
  @ApiProperty() quantity!: number;
  @ApiProperty() estimatedTotalCents!: number;
  @ApiProperty({ enum: PURCHASE_PRIORITIES }) priority!: PurchasePriority;
  @ApiProperty({ enum: ['PENDING', 'PURCHASED', 'FUTURE'] }) status!: PurchaseItemStatus;
  @ApiProperty({ type: Number, nullable: true }) paidPriceCents!: number | null;
  @ApiProperty({ type: String, nullable: true }) purchasedAt!: string | null;
  @ApiProperty({ type: LinkedExpenseDto, nullable: true }) transaction!: LinkedExpenseDto | null;
  @ApiProperty({ type: String, nullable: true }) responsibleMemberId!: string | null;
  @ApiProperty({ type: String, nullable: true }) url!: string | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() version!: number;
}

class PlanTotalsDto implements PurchasePlanTotals {
  @ApiProperty() estimatedCents!: number;
  @ApiProperty() futureCents!: number;
  @ApiProperty() actualCents!: number;
  @ApiProperty() remainingNeedCents!: number;
  @ApiProperty() varianceCents!: number;
  @ApiProperty() pendingCount!: number;
  @ApiProperty() purchasedCount!: number;
  @ApiProperty() futureCount!: number;
}

class PlanGoalDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() savedCents!: number;
  @ApiProperty({ type: Number, nullable: true }) coverageBps!: number | null;
}

export class PurchasePlanDto implements PurchasePlanView {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'COMPLETED', 'ARCHIVED'] }) status!: PurchasePlanStatus;
  @ApiProperty({ type: PlanTotalsDto }) totals!: PlanTotalsDto;
  @ApiProperty({ type: PlanGoalDto, nullable: true }) goal!: PlanGoalDto | null;
  @ApiProperty() version!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) archivedAt!: string | null;
  @ApiPropertyOptional({ type: [PurchaseItemDto], description: 'Detail only' })
  items?: PurchaseItemDto[];
}
