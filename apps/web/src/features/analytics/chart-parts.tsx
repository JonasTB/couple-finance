import type { ReactNode } from 'react';

export interface LegendItem {
  label: string;
  color: string;
  /** Drawn as a dashed line swatch (line series). */
  dashed?: boolean;
  /** Drawn as a line swatch instead of a block. */
  line?: boolean;
}

/** Direct, always-visible legend: identity never depends on hovering. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Legenda">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          {item.line ? (
            <span
              aria-hidden="true"
              className="inline-block w-5 border-t-2"
              style={{ borderColor: item.color, borderStyle: item.dashed ? 'dashed' : 'solid' }}
            />
          ) : (
            <span
              aria-hidden="true"
              className="inline-block size-3 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * A chart plus the same numbers as a table. The drawing is described by `summary` for screen
 * readers; the table (collapsed by default) is the exact, accessible source.
 */
export function ChartFrame({
  summary,
  height = 220,
  table,
  children,
}: {
  summary: string;
  height?: number;
  table: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div role="img" aria-label={summary} style={{ height }} className="w-full">
        {children}
      </div>
      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 text-primary">Ver dados em tabela</summary>
        <div className="overflow-x-auto">{table}</div>
      </details>
    </div>
  );
}

export function DataTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  return (
    <table className="w-full min-w-max border-collapse text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          {headers.map((header, index) => (
            <th
              key={header}
              scope="col"
              className={
                index === 0 ? 'py-1.5 pr-3 font-medium' : 'py-1.5 pl-3 text-right font-medium'
              }
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-b border-border last:border-0">
            {row.cells.map((cell, index) =>
              index === 0 ? (
                <th key={index} scope="row" className="py-1.5 pr-3 text-left font-normal">
                  {cell}
                </th>
              ) : (
                <td key={index} className="py-1.5 pl-3 text-right tabular-nums">
                  {cell}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
