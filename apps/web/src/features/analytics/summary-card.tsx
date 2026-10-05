import type { AnalyticsView } from '@couple-finance/shared';
import { addMonths, capitalizeFirst, formatMonth } from '@/shared/lib/dates';
import { formatCents, formatSignedBps } from '@/shared/lib/money';
import { Card } from '@/shared/ui/card';
import { changeSentence, monthName } from './labels';

/** The window's last month against the previous month and the recent average (all from the API). */
export function SummaryCard({ view }: { view: AnalyticsView }) {
  const { comparison: c, currency, averages } = view;
  const money = (cents: number) => formatCents(cents, currency);
  const last = view.months[view.months.length - 1];

  return (
    <Card
      aria-label="Resumo do mês"
      title={capitalizeFirst(formatMonth(c.month))}
      description={
        c.period === 'CURRENT'
          ? 'Mês em andamento: inclui o que já foi lançado, como parcelas do mês.'
          : c.period === 'FUTURE'
            ? 'Mês futuro: só o que já está lançado, como parcelas.'
            : undefined
      }
    >
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-semibold tabular-nums">{money(c.sharedSpendCents)}</span>
        <span className="text-sm text-muted-foreground">em despesas compartilhadas</span>
      </p>
      <ul className="space-y-1 text-sm">
        <li>
          {changeSentence(c.changeCents, currency)} {monthName(addMonths(c.month, -1))}
          {c.changeBps !== null && ` (${formatSignedBps(c.changeBps)})`}.
        </li>
        {c.averageCents !== null && c.vsAverageCents !== null ? (
          <li>
            {c.vsAverageCents === 0
              ? 'Igual à média'
              : `${money(Math.abs(c.vsAverageCents))} ${c.vsAverageCents > 0 ? 'acima' : 'abaixo'} da média`}{' '}
            {c.averageMonths === 1
              ? 'do mês anterior'
              : `dos ${String(c.averageMonths)} meses anteriores`}{' '}
            ({money(c.averageCents)}
            {c.vsAverageBps !== null && `, ${formatSignedBps(c.vsAverageBps)}`}).
          </li>
        ) : (
          <li className="text-muted-foreground">Ainda não há meses anteriores para comparar.</li>
        )}
      </ul>
      {last && (
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Recorrentes</dt>
            <dd className="font-medium tabular-nums">{money(last.recurringCents)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Parcelas</dt>
            <dd className="font-medium tabular-nums">{money(last.installmentCents)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Avulsas</dt>
            <dd className="font-medium tabular-nums">{money(last.otherCents)}</dd>
          </div>
        </dl>
      )}
      {averages.sharedSpendCents !== null && (
        <p className="text-sm text-muted-foreground">
          Média mensal no período ({averages.months}{' '}
          {averages.months === 1 ? 'mês fechado' : 'meses fechados'}):{' '}
          {money(averages.sharedSpendCents)}, sendo {money(averages.fixedCents ?? 0)} de fixos.
        </p>
      )}
    </Card>
  );
}
