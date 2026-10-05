import type { AnalyticsView } from '@couple-finance/shared';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { capitalizeFirst, formatMonth, formatMonthShort } from '@/shared/lib/dates';
import { formatCents, formatCompactCents, formatSignedBps } from '@/shared/lib/money';
import { Card } from '@/shared/ui/card';
import { ChartFrame, ChartLegend, DataTable } from './chart-parts';
import { AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE } from './chart-style';
import { SPEND_KINDS } from './labels';

/**
 * Monthly shared spend stacked by kind (FR-AN-01/02): recurring and installments are the fixed
 * part, the rest is variable. Installment load is the middle segment.
 */
export function SpendTrendCard({ view }: { view: AnalyticsView }) {
  const { currency, months } = view;
  const money = (cents: number) => formatCents(cents, currency);
  const data = months.map((m) => ({ ...m, label: formatMonthShort(m.month) }));
  const first = months[0];
  const last = months[months.length - 1];
  const summary =
    first && last
      ? `Gasto compartilhado por mês, de ${formatMonth(first.month)} a ${formatMonth(last.month)}, ` +
        `separado em recorrentes, parcelas e avulsas. Último mês: ${money(last.sharedSpendCents)}.`
      : 'Gasto compartilhado por mês.';

  return (
    <Card
      aria-label="Gasto por mês"
      title="Gasto compartilhado por mês"
      description="Fixos = recorrentes confirmadas e parcelas. Avulsas = o resto, como mercado e lazer."
    >
      <ChartLegend items={SPEND_KINDS.map(({ label, color }) => ({ label, color }))} />
      <ChartFrame
        summary={summary}
        table={
          <DataTable
            caption="Gasto compartilhado por mês"
            headers={['Mês', 'Recorrentes', 'Parcelas', 'Avulsas', 'Total', 'Variação']}
            rows={months.map((m) => ({
              key: m.month,
              cells: [
                capitalizeFirst(formatMonth(m.month)),
                money(m.recurringCents),
                money(m.installmentCents),
                money(m.otherCents),
                money(m.sharedSpendCents),
                m.changeBps === null ? '—' : formatSignedBps(m.changeBps),
              ],
            }))}
          />
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
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
              tickFormatter={(value: number) => formatCompactCents(value, currency)}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value) => money(Number(value))}
              labelFormatter={(_, payload) => {
                const month = (payload[0]?.payload as { month?: string } | undefined)?.month;
                return month ? capitalizeFirst(formatMonth(month)) : '';
              }}
            />
            {SPEND_KINDS.map(({ key, label, color }) => (
              <Bar
                key={key}
                dataKey={key}
                name={label}
                stackId="spend"
                fill={color}
                stroke="var(--card)"
                strokeWidth={1}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
    </Card>
  );
}
