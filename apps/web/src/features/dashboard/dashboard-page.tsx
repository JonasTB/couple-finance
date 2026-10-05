import { Link, useParams, useSearchParams } from 'react-router';
import { InsightsCard } from '@/features/insights/insights-card';
import { useHousehold, useMembers } from '@/features/households/households-api';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { todayIn } from '@/shared/lib/dates';
import { formatCents } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { FormAlert } from '@/shared/ui/form-alert';
import { MonthSwitcher } from '@/shared/ui/month-switcher';
import { BalanceCard } from './balance-card';
import { BudgetsCard } from './budgets-card';
import { CategoriesCard } from './categories-card';
import { ContributionCard } from './contribution-card';
import { useDashboard } from './dashboard-api';
import { OnboardingCard } from './onboarding-card';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Monthly overview (FR-DASH-01..06). Every number comes from the API; this page only formats. */
export function DashboardPage() {
  const { householdId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const household = useHousehold(householdId);
  const members = useMembers(householdId);
  const requested = params.get('mes');
  // Without ?mes the API answers with the current month in the household time zone.
  const dashboard = useDashboard(
    householdId,
    requested && MONTH_PATTERN.test(requested) ? requested : null,
  );

  const data = dashboard.data;
  const activeMembers = members.data ?? [];
  const names = new Map(activeMembers.map((member) => [member.id, member.displayName]));
  const today = household.data ? todayIn(household.data.timezone) : '';
  const defaultDate = data && today >= data.from && today <= data.to ? today : (data?.to ?? '');
  const loadError = dashboard.error ?? members.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthSwitcher
          month={data?.month ?? ''}
          onChange={(month) => {
            setParams({ mes: month }, { replace: true });
          }}
        />
        <Button asChild>
          <Link to="despesas/nova">Nova despesa</Link>
        </Button>
      </div>

      {loadError && (
        <FormAlert
          message={errorMessage(loadError instanceof ApiError ? loadError.code : 'INTERNAL_ERROR')}
        />
      )}
      {!data && !loadError && (
        <p role="status" className="py-12 text-center text-muted-foreground">
          Carregando…
        </p>
      )}

      {data && household.data && members.data && (
        <>
          <OnboardingCard
            isOwner={household.data.me.role === 'OWNER'}
            hasPartner={activeMembers.length > 1}
            hasAnyTransactions={data.hasAnyTransactions}
          />

          {data.hasAnyTransactions && (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="col-span-2 rounded-lg border border-border bg-card p-4 sm:col-span-1">
                  <dt className="text-sm text-muted-foreground">Gasto compartilhado</dt>
                  <dd className="text-2xl font-semibold tabular-nums">
                    {formatCents(data.totals.sharedSpendCents, data.currency)}
                  </dd>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <dt className="text-sm text-muted-foreground">Individuais</dt>
                  <dd className="text-lg font-medium tabular-nums">
                    {formatCents(data.totals.individualSpendCents, data.currency)}
                  </dd>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <dt className="text-sm text-muted-foreground">
                    Total ({data.totals.transactionCount}{' '}
                    {data.totals.transactionCount === 1 ? 'despesa' : 'despesas'})
                  </dt>
                  <dd className="text-lg font-medium tabular-nums">
                    {formatCents(data.totals.totalSpendCents, data.currency)}
                  </dd>
                </div>
              </dl>

              <InsightsCard
                householdId={householdId}
                month={data.month}
                currency={data.currency}
                names={names}
              />
              <BudgetsCard householdId={householdId} month={data.month} currency={data.currency} />
              <ContributionCard dashboard={data} names={names} />
              <CategoriesCard dashboard={data} />
              <BalanceCard
                key={data.month}
                householdId={householdId}
                dashboard={data}
                names={names}
                activeMembers={activeMembers}
                defaultDate={defaultDate}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
