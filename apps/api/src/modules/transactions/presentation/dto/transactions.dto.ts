import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type AllocationView,
  MAX_AMOUNT_CENTS,
  PAYMENT_METHODS,
  type PaymentMethod,
  SPLIT_TYPES,
  type SplitInput,
  type SplitPreview,
  type SplitSnapshotView,
  type SplitType,
  TRANSACTION_DESCRIPTION_MAX_LENGTH,
  TRANSACTION_MAX_TAGS,
  TRANSACTION_NOTES_MAX_LENGTH,
  TRANSACTION_TAG_MAX_LENGTH,
  type TransactionHistoryEntry,
  type TransactionOrigin,
  type TransactionPage,
  type TransactionView,
} from '@couple-finance/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  ValidateNested,
} from 'class-validator';
import { IsLocalDate } from '../../../../common/validation/is-local-date';
import { trimString } from '../../../../common/validation/transforms';

class SplitWeightInputDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() memberId!: string;
  @ApiProperty({ description: 'Basis points (10000 = 100%)' }) @IsInt() bps!: number;
}

class SplitAmountInputDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() memberId!: string;
  @ApiProperty() @IsInt() @Min(0) @Max(MAX_AMOUNT_CENTS) amountCents!: number;
}

export class SplitInputDto implements SplitInput {
  @ApiProperty({ enum: SPLIT_TYPES })
  @IsIn(SPLIT_TYPES)
  type!: SplitType;

  @ApiPropertyOptional({
    type: [String],
    description: 'EQUAL / INCOME_PROPORTIONAL (default: all active members)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  participants?: string[];

  @ApiPropertyOptional({ type: [SplitWeightInputDto], description: 'CUSTOM_PERCENT' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SplitWeightInputDto)
  weights?: SplitWeightInputDto[];

  @ApiPropertyOptional({ type: [SplitAmountInputDto], description: 'CUSTOM_AMOUNT' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SplitAmountInputDto)
  amounts?: SplitAmountInputDto[];

  @ApiPropertyOptional({ format: 'uuid', description: 'INDIVIDUAL' })
  @IsOptional()
  @IsUUID()
  responsibleMemberId?: string;
}

const trimTags = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? (value as unknown[]).map((tag) => (typeof tag === 'string' ? tag.trim() : tag))
    : value;

export class CreateTransactionDto {
  @ApiProperty({ example: 'Supermercado do mês', maxLength: TRANSACTION_DESCRIPTION_MAX_LENGTH })
  @Transform(trimString)
  @IsString()
  @Length(1, TRANSACTION_DESCRIPTION_MAX_LENGTH)
  description!: string;

  @ApiProperty({ description: 'Integer cents (ADR-002)', example: 45990 })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  amountCents!: number;

  @ApiProperty({ example: '2026-10-04' })
  @IsLocalDate()
  date!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ format: 'uuid', description: 'Who paid (independent from who is responsible)' })
  @IsUUID()
  payerMemberId!: string;

  @ApiProperty({ enum: PAYMENT_METHODS, description: 'Informational only; nothing is charged' })
  @IsIn(PAYMENT_METHODS)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ maxLength: TRANSACTION_NOTES_MAX_LENGTH, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(TRANSACTION_NOTES_MAX_LENGTH)
  notes?: string | null;

  @ApiPropertyOptional({ type: [String], maxItems: TRANSACTION_MAX_TAGS })
  @IsOptional()
  @Transform(trimTags)
  @IsArray()
  @ArrayMaxSize(TRANSACTION_MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(TRANSACTION_TAG_MAX_LENGTH, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: SplitInputDto, description: 'Omit to use the household default' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SplitInputDto)
  split?: SplitInputDto;
}

export class UpdateTransactionDto {
  @ApiProperty({ description: 'Version read with the expense (optimistic concurrency)' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, TRANSACTION_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  amountCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLocalDate()
  date?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  payerMemberId?: string;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(TRANSACTION_NOTES_MAX_LENGTH)
  notes?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(trimTags)
  @IsArray()
  @ArrayMaxSize(TRANSACTION_MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(TRANSACTION_TAG_MAX_LENGTH, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    type: SplitInputDto,
    description: 'Send to change the split; omit to keep the stored basis',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SplitInputDto)
  split?: SplitInputDto;
}

export class PreviewSplitDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  amountCents!: number;

  @ApiProperty()
  @IsLocalDate()
  date!: string;

  @ApiPropertyOptional({ type: SplitInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SplitInputDto)
  split?: SplitInputDto;
}

export class RecalculateRangeDto {
  @ApiProperty({ example: '2026-01-01' }) @IsLocalDate() from!: string;
  @ApiProperty({ example: '2026-12-31' }) @IsLocalDate() to!: string;
}

export class ListTransactionsQuery {
  @ApiPropertyOptional() @IsOptional() @IsLocalDate() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsLocalDate() to?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Includes its subcategories' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() payerMemberId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() responsibleMemberId?: string;
  @ApiPropertyOptional({ enum: SPLIT_TYPES })
  @IsOptional()
  @IsIn(SPLIT_TYPES)
  splitType?: SplitType;
  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;
  @ApiPropertyOptional({ description: 'Searches description, notes and tags' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
  @ApiPropertyOptional({ enum: ['only'], description: 'List deleted expenses only' })
  @IsOptional()
  @IsIn(['only'])
  deleted?: 'only';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) cursor?: string;
  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

class AllocationDto implements AllocationView {
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty() amountCents!: number;
}

class SplitWeightDto {
  @ApiProperty({ format: 'uuid' }) memberId!: string;
  @ApiProperty() weight!: number;
}

class SplitSnapshotDto implements SplitSnapshotView {
  @ApiProperty({ enum: SPLIT_TYPES }) type!: SplitType;
  @ApiProperty({ type: [SplitWeightDto] }) weights!: SplitWeightDto[];
  @ApiPropertyOptional() incomeBasisDate?: string;
}

export class TransactionDto implements TransactionView {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() description!: string;
  @ApiProperty() amountCents!: number;
  @ApiProperty() date!: string;
  @ApiProperty({ format: 'uuid' }) categoryId!: string;
  @ApiProperty({ format: 'uuid' }) payerMemberId!: string;
  @ApiProperty({ enum: PAYMENT_METHODS }) paymentMethod!: PaymentMethod;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty({ type: SplitSnapshotDto }) split!: SplitSnapshotDto;
  @ApiProperty({ type: [AllocationDto] }) allocations!: AllocationDto[];
  @ApiProperty({
    type: Object,
    nullable: true,
    description:
      'RECURRING {recurringExpenseId, occurrenceDate} | INSTALLMENT {installmentPlanId, installmentNumber, installmentCount, payoff}',
  })
  origin!: TransactionOrigin | null;
  @ApiProperty({ format: 'uuid' }) createdByMemberId!: string;
  @ApiProperty() version!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ type: String, nullable: true }) deletedAt!: string | null;
}

class PageInfoDto {
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty() limit!: number;
}

export class TransactionPageDto implements TransactionPage {
  @ApiProperty({ type: [TransactionDto] }) data!: TransactionDto[];
  @ApiProperty({ type: PageInfoDto }) page!: PageInfoDto;
}

export class SplitPreviewDto implements SplitPreview {
  @ApiProperty({ type: SplitSnapshotDto }) split!: SplitSnapshotDto;
  @ApiProperty({ type: [AllocationDto] }) allocations!: AllocationDto[];
}

export class TransactionHistoryEntryDto implements TransactionHistoryEntry {
  @ApiProperty({ enum: ['CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'RECALCULATE'] })
  action!: TransactionHistoryEntry['action'];
  @ApiProperty() actorDisplayName!: string;
  @ApiProperty() occurredAt!: string;
  @ApiProperty({ type: Object, nullable: true }) before!: Partial<TransactionView> | null;
  @ApiProperty({ type: Object, nullable: true }) after!: Partial<TransactionView> | null;
}

export class RecalculateRangeResultDto {
  @ApiProperty() recalculated!: number;
  @ApiProperty() unchanged!: number;
}
