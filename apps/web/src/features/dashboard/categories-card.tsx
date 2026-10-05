import type { DashboardView } from '@couple-finance/shared';
import { Link } from 'react-router';
import { formatBps, formatCents } from '@/shared/lib/money';
import { Card } from '@/shared/ui/card';

interface CategoriesCardProps {
  dashboard: DashboardView;
}

/**
 * Shared spend by top-level category, largest first (FR-DASH-01). One series, so one hue (the
 * primary token, distinct from member colors) and no legend; values are direct labels. Each row
 * drills down to the month's expenses in that category (NFR-08).
 */
export function CategoriesCard({ dashboard }: CategoriesCardProps) {
  const { categories, currency, month } = dashboard;
  const largest = categories[0]?.sharedSpendCents ?? 0;
  return (
    <Card title="Gastos compartilhados por categoria">
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma despesa compartilhada neste mês.</p>
      ) : (
        <ul className="space-y-1" aria-label="Categorias">
          {categories.map((category) => (
            <li key={category.categoryId}>
              <Link
                to={`despesas?mes=${month}&categoria=${category.categoryId}`}
                className="block space-y-1 rounded-lg py-2 hover:bg-muted/50"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">{category.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatCents(category.sharedSpendCents, currency)}{' '}
                    <span className="text-muted-foreground">{formatBps(category.shareBps)}</span>
                  </span>
                </span>
                {/* Bars scale to the largest category so small ones stay visible. */}
                <span aria-hidden="true" className="block h-2.5 rounded-sm bg-muted">
                  <span
                    className="block h-full rounded-r bg-primary"
                    style={{
                      width: `${String(largest > 0 ? (category.sharedSpendCents / largest) * 100 : 0)}%`,
                    }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
