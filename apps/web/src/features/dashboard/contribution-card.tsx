import type { DashboardView } from '@couple-finance/shared';
import { Link } from 'react-router';
import { formatDate } from '@/shared/lib/dates';
import { formatBps, formatCents, formatPoints } from '@/shared/lib/money';
import { Card } from '@/shared/ui/card';
import { memberColor, personName } from './people';

interface ContributionCardProps {
  dashboard: DashboardView;
  names: ReadonlyMap<string, string>;
}

const signedCents = (cents: number, currency: DashboardView['currency']) =>
  `${cents > 0 ? '+' : '−'}${formatCents(Math.abs(cents), currency)}`;

/**
 * Paid share vs planned share on shared expenses (FR-DASH-01..03). Each member is one bar on a
 * 0–100% track (fill = paid share, tick = planned share), direct-labeled, so identity never
 * depends on color alone. The explanation lists the categories and expenses behind the gap.
 */
export function ContributionCard({ dashboard, names }: ContributionCardProps) {
  const { currency, members, explanations } = dashboard;
  const hasShared = dashboard.totals.sharedSpendCents > 0;

  // The member above plan tells the story; the other side mirrors it.
  const above = members.find((member) => (member.deviationBps ?? 0) > 0);
  const explanation = above
    ? explanations.find((e) => e.memberId === above.memberId && e.direction === 'ABOVE')
    : undefined;

  return (
    <Card
      title="Quem pagou as despesas compartilhadas"
      description="Comparado com a parte planejada de cada pessoa pela divisão de cada despesa."
    >
      {!hasShared ? (
        <p className="text-sm text-muted-foreground">Sem despesas compartilhadas neste mês.</p>
      ) : (
        <>
          <ul className="space-y-4" aria-label="Participação de cada pessoa">
            {members.map((member, index) => {
              const name = personName(names, member);
              const paid = member.paidShareBps ?? 0;
              const planned = member.responsibleShareBps ?? 0;
              const deviation = member.deviationBps ?? 0;
              return (
                <li key={member.memberId} className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="flex items-center gap-2 font-medium">
                      <span
                        aria-hidden="true"
                        className="inline-block size-3 rounded-sm"
                        style={{ backgroundColor: memberColor(index) }}
                      />
                      {name}
                    </span>
                    <span className="tabular-nums">
                      pagou {formatCents(member.paidSharedCents, currency)} ·{' '}
                      <strong>{formatBps(paid)}</strong>
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${name} pagou ${formatBps(paid)}; parte planejada ${formatBps(planned)}`}
                    title={`Pagou ${formatBps(paid)} · planejado ${formatBps(planned)}`}
                    className="relative h-3 rounded-sm bg-muted"
                  >
                    <div
                      className="h-full rounded-r"
                      style={{
                        width: `${String(paid / 100)}%`,
                        backgroundColor: memberColor(index),
                      }}
                    />
                    <div
                      aria-hidden="true"
                      className="absolute -top-1 h-5 w-0.5 rounded-full bg-foreground"
                      style={{ left: `calc(${String(planned / 100)}% - 1px)` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Parte planejada: {formatBps(planned)} (
                    {formatCents(member.responsibleSharedCents, currency)})
                    {deviation !== 0 && (
                      <>
                        {' · '}
                        <span className="whitespace-nowrap">
                          {formatPoints(deviation)} {deviation > 0 ? 'acima' : 'abaixo'}
                        </span>
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span aria-hidden="true" className="inline-block h-3 w-0.5 bg-foreground" />
            marca a parte planejada
          </p>

          {above && explanation ? (
            <div className="space-y-3 rounded-lg bg-muted/60 p-3">
              <p>
                {personName(names, above)} pagou {formatBps(above.paidShareBps ?? 0)} das despesas
                compartilhadas, frente a {formatBps(above.responsibleShareBps ?? 0)} planejado. A
                diferença de {formatCents(above.sharedDifferenceCents, currency)} veio
                principalmente de:
              </p>
              <ul className="space-y-1" aria-label="Categorias que explicam a diferença">
                {explanation.categories.map((category) => (
                  <li key={category.categoryId} className="flex justify-between gap-3">
                    <span>{category.name}</span>
                    <span className="tabular-nums">
                      {signedCents(category.deltaCents, currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <details>
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                  Despesas que mais pesaram
                </summary>
                <ul className="divide-y divide-border">
                  {explanation.transactions.map((transaction) => (
                    <li key={transaction.transactionId}>
                      <Link
                        to={`despesas/${transaction.transactionId}`}
                        className="flex justify-between gap-3 py-2 hover:underline"
                      >
                        <span className="min-w-0 truncate">
                          {transaction.description} · {formatDate(transaction.date, 'short')}
                        </span>
                        <span className="tabular-nums">
                          {signedCents(transaction.deltaCents, currency)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Os pagamentos seguiram a divisão planejada.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
