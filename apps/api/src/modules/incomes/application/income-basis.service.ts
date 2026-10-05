import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@couple-finance/shared';
import { type TransactionContext } from '../../../common/database/unit-of-work';
import { AppException } from '../../../common/errors/app.exception';
import { incomeSharesBps } from '../domain/income-basis';
import { IncomesRepository } from './incomes.repository';

/**
 * Public API: proportional weights for INCOME_PROPORTIONAL splits (ADR-006, BUSINESS_RULES 21).
 * Returns bps only — never income amounts.
 */
@Injectable()
export class IncomeBasis {
  constructor(private readonly incomes: IncomesRepository) {}

  /** bps per member, in the given order; throws INCOME_BASIS_MISSING if anyone lacks income. */
  async sharesBps(
    householdId: string,
    memberIds: readonly string[],
    date: string,
    tx?: TransactionContext,
  ): Promise<number[]> {
    const records = await this.incomes.effectiveOn(householdId, memberIds, date, tx);
    const byMember = new Map(records.map((record) => [record.memberId, record.monthlyAmountCents]));
    const missing = memberIds.filter((memberId) => !byMember.has(memberId));
    if (missing.length > 0) {
      throw new AppException(
        ErrorCode.INCOME_BASIS_MISSING,
        'Every participant needs an income registered for this date to split proportionally.',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { missingMemberIds: missing, date },
      );
    }
    return incomeSharesBps(memberIds.map((memberId) => byMember.get(memberId) ?? 0));
  }
}
