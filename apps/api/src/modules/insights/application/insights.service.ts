import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type InsightView, type InsightsView } from '@couple-finance/shared';
import { AppException } from '../../../common/errors/app.exception';
import { Clock } from '../../../common/time/clock';
import { localDateIn } from '../../../common/time/local-date';
import { AnalyticsService, DashboardService } from '../../analytics/public';
import { BudgetsService } from '../../budgets/public';
import { HouseholdDirectory, type MemberContext } from '../../households/public';
import { InstallmentPlansService } from '../../installments/public';
import { evaluateInsights } from '../domain/rules';
import { InsightDismissalsRepository } from './insight-dismissals.repository';

/**
 * Deterministic insights of a month (FR-INS-01..04), computed on read from the dashboard,
 * analytics, budgets and installment read models (ADR-009, ADR-017). Only per-user dismissals
 * are stored.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly directory: HouseholdDirectory,
    private readonly dashboard: DashboardService,
    private readonly analytics: AnalyticsService,
    private readonly budgets: BudgetsService,
    private readonly installments: InstallmentPlansService,
    private readonly dismissals: InsightDismissalsRepository,
    private readonly clock: Clock,
  ) {}

  async month(member: MemberContext, requested?: string): Promise<InsightsView> {
    const household = await this.directory.household(member.householdId);
    if (!household) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Household not found.', HttpStatus.NOT_FOUND);
    }
    const month = requested ?? localDateIn(household.timezone, this.clock.now()).slice(0, 7);

    const [dashboard, analytics, budgets, installments, dismissed] = await Promise.all([
      this.dashboard.monthly(member, month),
      this.analytics.history(member, { month, months: 1 }),
      this.budgets.month(member, month),
      this.installments.summary(member),
      this.dismissals.forUser(member.householdId, member.userId),
    ]);

    const drafts = evaluateInsights({
      month,
      period: analytics.comparison.period,
      members: dashboard.members,
      categories: dashboard.categories,
      explanations: dashboard.explanations,
      comparison: analytics.comparison,
      budgets: budgets.data,
      releases: installments.releases,
    });
    const insights: InsightView[] = drafts.map((draft) => ({
      ...draft,
      dismissedAt: dismissed.get(draft.fingerprint)?.toISOString() ?? null,
    }));
    return { month, period: analytics.comparison.period, insights };
  }

  dismiss(member: MemberContext, fingerprint: string): Promise<void> {
    return this.dismissals.dismiss(
      member.householdId,
      member.userId,
      fingerprint,
      this.clock.now(),
    );
  }

  undoDismissal(member: MemberContext, fingerprint: string): Promise<void> {
    return this.dismissals.undo(member.householdId, member.userId, fingerprint);
  }
}
