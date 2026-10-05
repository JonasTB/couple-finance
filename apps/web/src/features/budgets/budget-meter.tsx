import type { BudgetStatusView, CurrencyCode } from '@couple-finance/shared';
import { cn } from '@/shared/lib/cn';
import { formatBps, formatCents } from '@/shared/lib/money';

const STATE = {
  OK: { fill: 'bg-primary', icon: '', label: '' },
  WARNING: { fill: 'bg-warning', icon: '▲', label: 'Perto do limite' },
  EXCEEDED: { fill: 'bg-danger', icon: '●', label: 'Limite ultrapassado' },
} as const;

/**
 * One budget as a meter (FR-BUD-02). The state is never color alone: WARNING and EXCEEDED carry
 * an icon and a label. The fill stops at 100%; the text gives the real percentage.
 */
export function BudgetMeter({
  budget,
  currency,
}: {
  budget: BudgetStatusView;
  currency: CurrencyCode;
}) {
  const state = STATE[budget.state];
  const name = budget.categoryName ?? 'Total da casa';
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">
          {name}
          {budget.categoryArchived && (
            <span className="text-sm font-normal text-muted-foreground"> (arquivada)</span>
          )}
        </span>
        <span className="text-sm tabular-nums">
          {formatCents(budget.spentCents, currency)} de {formatCents(budget.amountCents, currency)}{' '}
          · <strong>{formatBps(budget.usedBps)}</strong>
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${name}: ${formatBps(budget.usedBps)} usado`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(budget.usedBps, 10000) / 100}
        className="h-2.5 rounded-sm bg-muted"
      >
        <div
          className={cn('h-full rounded-r', state.fill)}
          style={{ width: `${String(Math.min(budget.usedBps, 10000) / 100)}%` }}
        />
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        {state.label && (
          <span className="font-medium text-foreground">
            <span aria-hidden="true">{state.icon} </span>
            {state.label}
          </span>
        )}
        <span>
          {budget.remainingCents >= 0
            ? `Restam ${formatCents(budget.remainingCents, currency)}`
            : `${formatCents(-budget.remainingCents, currency)} acima do limite`}
        </span>
      </p>
    </div>
  );
}
