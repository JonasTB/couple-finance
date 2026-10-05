import type { CurrencyCode, InsightView } from '@couple-finance/shared';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { insightCopy } from './insight-copy';
import { useInsightDismissals, useInsights } from './insights-api';

const SEVERITY = {
  ATTENTION: { icon: '▲', label: 'Atenção', className: 'text-warning' },
  INFO: { icon: 'ℹ', label: 'Para saber', className: 'text-muted-foreground' },
} as const;

function InsightItem({
  insight,
  currency,
  names,
  action,
}: {
  insight: InsightView;
  currency: CurrencyCode;
  names: ReadonlyMap<string, string>;
  action: ReactNode;
}) {
  const copy = insightCopy(insight, currency, names);
  const severity = SEVERITY[insight.severity];
  return (
    <li className="space-y-2 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase">
        {/* Color only on the icon; the label keeps full text contrast. */}
        <span aria-hidden="true" className={severity.className}>
          {severity.icon}
        </span>
        {severity.label}
      </p>
      <p>{copy.text}</p>
      {copy.evidence.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm" aria-label="Evidências">
          {copy.evidence.map((line) => (
            <li key={line.text}>
              {line.to ? (
                <Link
                  to={line.to}
                  className="inline-flex min-h-6 items-center text-primary hover:underline"
                >
                  {line.text}
                </Link>
              ) : (
                line.text
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {copy.links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="inline-flex min-h-6 items-center text-primary hover:underline"
          >
            {link.label}
          </Link>
        ))}
        {action}
      </div>
      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer py-1">Por que este destaque?</summary>
        <p>{copy.why}</p>
        <p>
          Regra {insight.ruleId}, versão {insight.ruleVersion}.
        </p>
      </details>
    </li>
  );
}

/**
 * Deterministic insights of the month (FR-INS-01..04): neutral copy, evidence with links to the
 * expenses behind each number, the rule that produced it, and per-user dismissal with undo.
 */
export function InsightsCard({
  householdId,
  month,
  currency,
  names,
}: {
  householdId: string;
  month: string;
  currency: CurrencyCode;
  names: ReadonlyMap<string, string>;
}) {
  const insights = useInsights(householdId, month);
  const dismissals = useInsightDismissals(householdId);
  const [showDismissed, setShowDismissed] = useState(false);
  const [lastDismissed, setLastDismissed] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const all = insights.data?.insights ?? [];
  const visible = all.filter((i) => i.dismissedAt === null);
  const dismissed = all.filter((i) => i.dismissedAt !== null);

  const run = (action: () => Promise<unknown>, after?: () => void) => {
    setError(undefined);
    action().then(after, (failure: unknown) => {
      setError(errorMessage(failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR'));
    });
  };

  return (
    <Card
      aria-label="Destaques do mês"
      title="Destaques do mês"
      description="Calculados por regras fixas a partir das despesas, orçamentos e parcelamentos."
    >
      <FormAlert message={error} />
      {insights.error && (
        <FormAlert
          message={errorMessage(
            insights.error instanceof ApiError ? insights.error.code : 'INTERNAL_ERROR',
          )}
        />
      )}
      {lastDismissed && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
        >
          <span>Destaque dispensado.</span>
          <Button
            variant="outline"
            onClick={() => {
              run(() => dismissals.undo.mutateAsync(lastDismissed));
              setLastDismissed(null);
            }}
          >
            Desfazer
          </Button>
        </div>
      )}
      {insights.isSuccess && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">Nada fora do comum neste mês.</p>
      )}
      {visible.length > 0 && (
        <ul className="divide-y divide-border" aria-label="Destaques">
          {visible.map((insight) => (
            <InsightItem
              key={insight.fingerprint}
              insight={insight}
              currency={currency}
              names={names}
              action={
                <Button
                  variant="ghost"
                  className="ml-auto"
                  aria-label={`Dispensar: ${insightCopy(insight, currency, names).text}`}
                  onClick={() => {
                    run(
                      () => dismissals.dismiss.mutateAsync(insight.fingerprint),
                      () => {
                        setLastDismissed(insight.fingerprint);
                      },
                    );
                  }}
                >
                  Dispensar
                </Button>
              }
            />
          ))}
        </ul>
      )}
      {dismissed.length > 0 && (
        <div className="space-y-2">
          <Button
            variant="ghost"
            aria-expanded={showDismissed}
            onClick={() => {
              setShowDismissed((current) => !current);
            }}
          >
            {showDismissed
              ? 'Ocultar dispensados'
              : `Mostrar dispensados (${String(dismissed.length)})`}
          </Button>
          {showDismissed && (
            <ul className="divide-y divide-border opacity-80" aria-label="Destaques dispensados">
              {dismissed.map((insight) => (
                <InsightItem
                  key={insight.fingerprint}
                  insight={insight}
                  currency={currency}
                  names={names}
                  action={
                    <Button
                      variant="ghost"
                      className="ml-auto"
                      onClick={() => {
                        run(() => dismissals.undo.mutateAsync(insight.fingerprint));
                      }}
                    >
                      Mostrar de novo
                    </Button>
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
