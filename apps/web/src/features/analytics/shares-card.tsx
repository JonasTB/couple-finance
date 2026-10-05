import type { AnalyticsView } from '@couple-finance/shared';
import { memberColor } from '@/features/dashboard/people';
import { capitalizeFirst, formatMonth, formatMonthShort } from '@/shared/lib/dates';
import { formatBps } from '@/shared/lib/money';
import { Card } from '@/shared/ui/card';
import { ChartLegend } from './chart-parts';

/**
 * Paid vs planned share of shared spend, month by month (FR-AN-01). One 100% bar per month,
 * split by member (fixed member colors), with a tick where the planned split falls. Members
 * appear in stable order and side by side; nobody is ranked.
 */
export function SharesCard({
  view,
  names,
}: {
  view: AnalyticsView;
  names: ReadonlyMap<string, string>;
}) {
  const nameOf = (id: string) => names.get(id) ?? 'Ex-membro';
  const order = view.members.map((m) => m.memberId);

  return (
    <Card
      aria-label="Quem pagou, mês a mês"
      title="Quem pagou, mês a mês"
      description="Parte de cada pessoa nas despesas compartilhadas. O traço marca a divisão planejada."
    >
      <ChartLegend
        items={order.map((id, index) => ({ label: nameOf(id), color: memberColor(index) }))}
      />
      <ul className="space-y-2">
        {view.months.map((month) => {
          const members = month.members;
          const hasShared = members.some((m) => m.paidShareBps !== null);
          // Position of the planned boundary after the first member (couples).
          const plannedFirst = members[0]?.responsibleShareBps ?? null;
          const description = hasShared
            ? members
                .map(
                  (m) =>
                    `${nameOf(m.memberId)} pagou ${formatBps(m.paidShareBps ?? 0)} (planejado ${formatBps(m.responsibleShareBps ?? 0)})`,
                )
                .join('; ')
            : 'sem despesas compartilhadas';
          return (
            <li key={month.month} className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatMonthShort(month.month)}
              </span>
              {hasShared ? (
                <div className="space-y-0.5">
                  <div
                    role="img"
                    aria-label={`${capitalizeFirst(formatMonth(month.month))}: ${description}`}
                    className="relative flex h-3 overflow-hidden rounded-sm bg-muted"
                  >
                    {members.map((m) => (
                      <span
                        key={m.memberId}
                        className="h-full"
                        style={{
                          width: `${String((m.paidShareBps ?? 0) / 100)}%`,
                          backgroundColor: memberColor(order.indexOf(m.memberId)),
                        }}
                      />
                    ))}
                    {plannedFirst !== null && members.length === 2 && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 w-0.5 bg-foreground"
                        style={{ left: `calc(${String(plannedFirst / 100)}% - 1px)` }}
                      />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums" aria-hidden="true">
                    {members
                      .map((m) => `${nameOf(m.memberId)} ${formatBps(m.paidShareBps ?? 0)}`)
                      .join(' · ')}
                  </p>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Sem despesas compartilhadas</span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
