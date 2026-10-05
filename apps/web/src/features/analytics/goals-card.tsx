import type { AnalyticsView } from '@couple-finance/shared';
import { Link } from 'react-router';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { capitalizeFirst, formatMonth, formatMonthShort } from '@/shared/lib/dates';
import { formatCents, formatCompactCents } from '@/shared/lib/money';
import { Card } from '@/shared/ui/card';
import { ChartFrame, DataTable } from './chart-parts';
import { AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE } from './chart-style';

/**
 * Goal evolution (FR-AN-03): one small chart per goal (saved at each month's end), with the
 * target as a labelled reference line. Months before the goal existed are blank.
 */
export function GoalsCard({ view }: { view: AnalyticsView }) {
  const { currency, goals, months } = view;
  const money = (cents: number) => formatCents(cents, currency);

  return (
    <Card aria-label="Evolução das metas" title="Evolução das metas">
      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma meta ativa.{' '}
          <Link to="../metas" relative="path" className="text-primary hover:underline">
            Criar uma meta
          </Link>
        </p>
      ) : (
        <ul className="space-y-6">
          {goals.map((goal) => {
            const data = months.map((m, i) => ({
              month: m.month,
              label: formatMonthShort(m.month),
              saved: goal.savedCents[i] ?? null,
            }));
            const latest = [...goal.savedCents].reverse().find((v) => v !== null) ?? 0;
            return (
              <li key={goal.goalId} className="space-y-2">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <Link
                    to={`../metas/${goal.goalId}`}
                    relative="path"
                    className="font-medium text-primary hover:underline"
                  >
                    {goal.name}
                  </Link>
                  <span className="text-sm tabular-nums">
                    {money(latest)} de {money(goal.targetAmountCents)}
                    {goal.status === 'ACHIEVED' && ' · atingida'}
                  </span>
                </p>
                <ChartFrame
                  height={150}
                  summary={`${goal.name}: valor guardado no fim de cada mês, chegando a ${money(latest)} de ${money(goal.targetAmountCents)}.`}
                  table={
                    <DataTable
                      caption={`${goal.name} por mês`}
                      headers={['Mês', 'Guardado']}
                      rows={data.map((row) => ({
                        key: row.month,
                        cells: [
                          capitalizeFirst(formatMonth(row.month)),
                          row.saved === null ? 'meta ainda não criada' : money(row.saved),
                        ],
                      }))}
                    />
                  }
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                      <XAxis
                        dataKey="label"
                        tick={AXIS_TICK}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={8}
                      />
                      <YAxis
                        tick={AXIS_TICK}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                        domain={[0, (max: number) => Math.max(max, goal.targetAmountCents)]}
                        tickFormatter={(value: number) => formatCompactCents(value, currency)}
                      />
                      <Tooltip
                        {...TOOLTIP_STYLE}
                        cursor={{ stroke: 'var(--border)' }}
                        formatter={(value) => money(Number(value))}
                        labelFormatter={(_, payload) => {
                          const month = (payload[0]?.payload as { month?: string } | undefined)
                            ?.month;
                          return month ? capitalizeFirst(formatMonth(month)) : '';
                        }}
                      />
                      <ReferenceLine
                        y={goal.targetAmountCents}
                        stroke="var(--muted-foreground)"
                        strokeDasharray="4 4"
                        label={{
                          value: 'Meta',
                          position: 'insideTopLeft',
                          fill: 'var(--muted-foreground)',
                          fontSize: 12,
                        }}
                      />
                      <Line
                        dataKey="saved"
                        name="Guardado"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: 'var(--primary)', strokeWidth: 0 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartFrame>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
