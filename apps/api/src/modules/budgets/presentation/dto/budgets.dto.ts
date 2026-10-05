import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type BudgetChangeInput,
  type BudgetMonthView,
  type BudgetState,
  type BudgetStatusView,
  MAX_AMOUNT_CENTS,
} from '@couple-finance/shared';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min, ValidateIf } from 'class-validator';

const MONTH = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/;

export class BudgetMonthQuery {
  @ApiPropertyOptional({ example: '2026-10', description: 'Default: current month' })
  @IsOptional()
  @Matches(MONTH, { message: 'month must be YYYY-MM' })
  month?: string;
}

export class BudgetChangeDto implements BudgetChangeInput {
  @ApiProperty({ format: 'uuid', nullable: true, description: 'Null = household total' })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  categoryId!: string | null;

  @ApiProperty({ nullable: true, description: 'Integer cents; null removes the budget' })
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_CENTS)
  amountCents!: number | null;

  @ApiProperty({ example: '2026-10', description: 'Current month or later' })
  @Matches(MONTH, { message: 'fromMonth must be YYYY-MM' })
  fromMonth!: string;
}

class NextChangeDto {
  @ApiProperty() fromMonth!: string;
  @ApiProperty({ type: Number, nullable: true }) amountCents!: number | null;
}

class BudgetStatusDto implements BudgetStatusView {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) categoryId!: string | null;
  @ApiProperty({ type: String, nullable: true }) categoryName!: string | null;
  @ApiProperty() categoryArchived!: boolean;
  @ApiProperty() amountCents!: number;
  @ApiProperty() spentCents!: number;
  @ApiProperty() remainingCents!: number;
  @ApiProperty() usedBps!: number;
  @ApiProperty({ enum: ['OK', 'WARNING', 'EXCEEDED'] }) state!: BudgetState;
  @ApiProperty() fromMonth!: string;
  @ApiProperty({ type: String, nullable: true }) toMonth!: string | null;
  @ApiProperty({ type: NextChangeDto, nullable: true }) next!: NextChangeDto | null;
}

export class BudgetMonthDto implements BudgetMonthView {
  @ApiProperty() month!: string;
  @ApiProperty() editable!: boolean;
  @ApiProperty({ type: [BudgetStatusDto] }) data!: BudgetStatusDto[];
}
