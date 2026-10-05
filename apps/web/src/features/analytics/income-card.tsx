import type { AnalyticsView } from '@couple-finance/shared';
import { Link } from 'react-router';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { capitalizeFirst, formatMonth, formatMonthShort } from '@/shared/lib/dates';
import { formatBps, formatCents } from '@/shared/lib/money';
import { Card } from '@/shared/ui/card';
import { ChartFrame, ChartLegend, DataTable } from './chart-parts';
import { AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE } from './chart-style';

const SERIES = [
  { key: 'spendBps', label: 'Gasto compartilhado', color: 'var(--primary)', dashed: false },
  { key: 'fixedBps', label: 'Fixos', color: 'var(--kind-1)', dashed: true },
] as const;

/**
 * Income commitment (FR-AN-02): share of the household income taken by fixed spend and by all
 * shared spend. Amounts appear only when every partner shares theirs (ADR-005).
 */
export function IncomeCard({ view }: { view: AnalyticsView }) {
  const { months, currency, incomeVisible } = view;
  const latest = [...months].reverse().find((m) => m.income.complete);
  const data = months.map((m) => ({
    month: m.month,
    label: formatMonthShort(m.month),
    spendBps: m.income.spendBps,
    fixedBps: m.income.fixedBps,
  }));

  return (
    <Card
      aria-label="Renda comprometida"
      title="Quanto da renda da casa vai para os gastos"
      description="Renda da casa = soma das rendas de todos, vigentes no fim de cada mês."
    >
      {!latest ? (
        <p className="text-sm text-muted-foreground">
          Para ver esta análise, cada pessoa precisa cadastrar a renda em{' '}
          <Link to="../renda" relative="path" className="text-primary hover:underline">
            Renda
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="text-sm">
            Em {formatMonth(latest.month)}, os fixos usaram{' '}
            <strong>{formatBps(latest.income.fixedBps ?? 0)}</strong> da renda da casa e o gasto
            compartilhado, <strong>{formatBps(latest.income.spendBps ?? 0)}</strong>
            {latest.income.incomeCents !== null &&
              ` (renda de ${formatCents(latest.income.incomeCents, currency)})`}
            .
          </p>
          <ChartLegend
            items={SERIES.map(({ label, color, dashed }) => ({ label, color, dashed, line: true }))}
          />
          <ChartFrame
            summary={`Percentual da renda da casa usado por mês. Em ${formatMonth(latest.month)}: fixos ${formatBps(latest.income.fixedBps ?? 0)}, gasto compartilhado ${formatBps(latest.income.spendBps ?? 0)}.`}
            table={
              <DataTable
                caption="Renda comprometida por mês"
                headers={[
                  'Mês',
                  ...(incomeVisible ? ['Renda da casa'] : []),
                  'Fixos',
                  'Gasto compartilhado',
                ]}
                rows={months.map((m) => ({
                  key: m.month,
                  cells: [
                    capitalizeFirst(formatMonth(m.month)),
                    ...(incomeVisible
                      ? [
                          m.income.incomeCents === null
                            ? '—'
                            : formatCents(m.income.incomeCents, currency),
                        ]
                      : []),
                    m.income.fixedBps === null ? '—' : formatBps(m.income.fixedBps),
                    m.income.spendBps === null ? '—' : formatBps(m.income.spendBps),
                  ],
                }))}
              />
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                  width={48}
                  tickFormatter={(value: number) => formatBps(value)}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  cursor={{ stroke: 'var(--border)' }}
                  formatter={(value) => formatBps(Number(value))}
                  labelFormatter={(_, payload) => {
                    const month = (payload[0]?.payload as { month?: string } | undefined)?.month;
                    return month ? capitalizeFirst(formatMonth(month)) : '';
                  }}
                />
                {SERIES.map(({ key, label, color, dashed }) => (
                  <Line
                    key={key}
                    dataKey={key}
                    name={label}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray={dashed ? '6 4' : undefined}
                    dot={{ r: 3, fill: color, strokeWidth: 0 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
          {!incomeVisible && (
            <p className="text-sm text-muted-foreground">
              Os valores de renda não aparecem porque há quem prefira mostrar só a proporção.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
