import { ANALYTICS_DEFAULT_MONTHS } from '@couple-finance/shared';
import { Link, useParams, useSearchParams } from 'react-router';
import { useMembers } from '@/features/households/households-api';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { MonthSwitcher } from '@/shared/ui/month-switcher';
import { useAnalytics } from './analytics-api';
import { CategoriesCard } from './categories-card';
import { GoalsCard } from './goals-card';
import { IncomeCard } from './income-card';
import { SharesCard } from './shares-card';
import { SpendTrendCard } from './spend-trend-card';
import { SummaryCard } from './summary-card';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const PERIODS = [6, 12, 24] as const;

/**
 * Historical analytics (FR-AN-01..04). Loaded on demand with the chart library. Every number
 * comes from the API; components only format and draw.
 */
export function AnalyticsPage() {
  const { householdId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const members = useMembers(householdId);
  const requested = params.get('mes');
  const month = requested && MONTH_PATTERN.test(requested) ? requested : null;
  const period = Number(params.get('periodo'));
  const months = (PERIODS as readonly number[]).includes(period)
    ? period
    : ANALYTICS_DEFAULT_MONTHS;
  const analytics = useAnalytics(householdId, month, months);
  const data = analytics.data;
  const names = new Map((members.data ?? []).map((m) => [m.id, m.displayName]));

  const update = (next: { mes?: string; periodo?: number }) => {
    const search = new URLSearchParams(params);
    if (next.mes) search.set('mes', next.mes);
    if (next.periodo) search.set('periodo', String(next.periodo));
    setParams(search, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthSwitcher
          month={data?.to ?? ''}
          onChange={(mes) => {
            update({ mes });
          }}
        />
        <div role="group" aria-label="Período" className="flex gap-1">
          {PERIODS.map((value) => (
            <Button
              key={value}
              variant={value === months ? 'primary' : 'outline'}
              aria-pressed={value === months}
              className="px-3"
              onClick={() => {
                update({ periodo: value });
              }}
            >
              {value} meses
            </Button>
          ))}
        </div>
      </div>

      {analytics.error && (
        <FormAlert
          message={errorMessage(
            analytics.error instanceof ApiError ? analytics.error.code : 'INTERNAL_ERROR',
          )}
        />
      )}
      {!data && !analytics.error && (
        <p role="status" className="py-12 text-center text-muted-foreground">
          Carregando…
        </p>
      )}

      {data && (
        <>
          {data.hasAnyTransactions ? (
            <>
              <SummaryCard view={data} />
              <SpendTrendCard view={data} />
              <IncomeCard view={data} />
              {data.members.length > 1 && <SharesCard view={data} names={names} />}
              <CategoriesCard view={data} />
            </>
          ) : (
            <Card title="Ainda sem análises">
              <p className="text-sm text-muted-foreground">
                As tendências aparecem depois da primeira despesa.
              </p>
              <Button asChild>
                <Link to="../despesas/nova" relative="path">
                  Registrar despesa
                </Link>
              </Button>
            </Card>
          )}
          <GoalsCard view={data} />
        </>
      )}
    </div>
  );
}
