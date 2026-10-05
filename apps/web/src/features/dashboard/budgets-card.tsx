import type { CurrencyCode } from '@couple-finance/shared';
import { Link } from 'react-router';
import { BudgetMeter } from '@/features/budgets/budget-meter';
import { useBudgetMonth } from '@/features/budgets/budgets-api';
import { Card } from '@/shared/ui/card';

/**
 * Budget alerts on the dashboard (FR-BUD-02): the household total plus every budget at 80% or
 * more. Hidden when the month has no budgets.
 */
export function BudgetsCard({
  householdId,
  month,
  currency,
}: {
  householdId: string;
  month: string;
  currency: CurrencyCode;
}) {
  const budgets = useBudgetMonth(householdId, month);
  const all = budgets.data?.data ?? [];
  if (all.length === 0) {
    return null;
  }
  const shown = all.filter((b) => b.categoryId === null || b.state !== 'OK');
  const alerts = all.filter((b) => b.state !== 'OK').length;
  return (
    <Card
      aria-label="Orçamentos"
      title="Orçamentos"
      description={
        alerts === 0
          ? 'Todos os orçamentos do mês estão abaixo de 80%.'
          : `${String(alerts)} ${alerts === 1 ? 'orçamento pede' : 'orçamentos pedem'} atenção.`
      }
    >
      {shown.length > 0 && (
        <ul className="space-y-4">
          {shown.map((budget) => (
            <li key={budget.id}>
              <BudgetMeter budget={budget} currency={currency} />
            </li>
          ))}
        </ul>
      )}
      <Link
        to={`orcamentos?mes=${month}`}
        className="inline-flex min-h-6 items-center text-sm text-primary hover:underline"
      >
        Ver todos os orçamentos
      </Link>
    </Card>
  );
}
