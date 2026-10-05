import type { AnalyticsView } from '@couple-finance/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { capitalizeFirst, formatMonth, formatMonthShort } from '@/shared/lib/dates';
import { formatBps, formatCents, formatCompactCents, formatSignedBps } from '@/shared/lib/money';
import { Card } from '@/shared/ui/card';
import { FormField } from '@/shared/ui/form-field';
import { Select } from '@/shared/ui/select';
import { ChartFrame, DataTable } from './chart-parts';
import { AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE } from './chart-style';

/**
 * Categories (FR-AN-01): the last month against each category's recent average, then one
 * category's monthly trend (single series, primary hue). Rows drill down to the expenses.
 */
export function CategoriesCard({ view }: { view: AnalyticsView }) {
  const { currency, comparison, categories } = view;
  const money = (cents: number) => formatCents(cents, currency);
  const [selected, setSelected] = useState(categories[0]?.categoryId ?? '');
  const category = categories.find((c) => c.categoryId === selected) ?? categories[0];
  const data = category
    ? view.months.map((m, i) => ({
        month: m.month,
        label: formatMonthShort(m.month),
        cents: category.monthlyCents[i] ?? 0,
      }))
    : [];

  return (
    <Card aria-label="Categorias" title="Categorias">
      {comparison.categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem despesas compartilhadas no período.</p>
      ) : (
        <section
          aria-label={`Categorias em ${formatMonth(comparison.month)}`}
          className="space-y-2"
        >
          <h3 className="text-sm font-medium">
            {capitalizeFirst(formatMonth(comparison.month))}
            {comparison.averageMonths > 0 &&
              ` comparado com a média ${comparison.averageMonths === 1 ? 'do mês anterior' : `dos ${String(comparison.averageMonths)} meses anteriores`}`}
          </h3>
          <ul className="divide-y divide-border">
            {comparison.categories.map((c) => (
              <li key={c.categoryId}>
                <Link
                  to={`../despesas?mes=${comparison.month}&categoria=${c.categoryId}`}
                  relative="path"
                  className="flex items-baseline justify-between gap-3 py-2 hover:bg-muted/50"
                >
                  <span className="min-w-0 break-words">{c.name}</span>
                  <span className="shrink-0 text-right text-sm tabular-nums">
                    <span className="font-medium">{money(c.cents)}</span>
                    {c.averageCents !== null && (
                      <span className="block text-muted-foreground">
                        média {money(c.averageCents)}
                        {c.vsAverageBps !== null && ` · ${formatSignedBps(c.vsAverageBps)}`}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {category && (
        <section aria-label="Evolução da categoria" className="space-y-3">
          <FormField label="Categoria">
            <Select
              value={category.categoryId}
              onChange={(event) => {
                setSelected(event.target.value);
              }}
            >
              {categories.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>
                  {c.name} ({formatBps(c.shareBps)} do período)
                </option>
              ))}
            </Select>
          </FormField>
          <p className="text-sm text-muted-foreground">
            {money(category.totalCents)} no período, {formatBps(category.shareBps)} do gasto
            compartilhado.
          </p>
          <ChartFrame
            height={180}
            summary={`${category.name}: gasto compartilhado por mês, total de ${money(category.totalCents)} no período.`}
            table={
              <DataTable
                caption={`${category.name} por mês`}
                headers={['Mês', category.name]}
                rows={data.map((row) => ({
                  key: row.month,
                  cells: [capitalizeFirst(formatMonth(row.month)), money(row.cents)],
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
                <Bar
                  dataKey="cents"
                  name={category.name}
                  fill="var(--primary)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </section>
      )}
    </Card>
  );
}
