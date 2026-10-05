import { addMonths, capitalizeFirst, formatMonth } from '@/shared/lib/dates';
import { Button } from './button';

interface MonthSwitcherProps {
  /** `YYYY-MM`, or empty while loading. */
  month: string;
  onChange: (month: string) => void;
}

/** "‹ Outubro de 2026 ›" */
export function MonthSwitcher({ month, onChange }: MonthSwitcherProps) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        aria-label="Mês anterior"
        disabled={!month}
        onClick={() => {
          onChange(addMonths(month, -1));
        }}
      >
        ‹
      </Button>
      <h2 className="min-w-36 text-center font-semibold">
        {month ? capitalizeFirst(formatMonth(month)) : ''}
      </h2>
      <Button
        variant="ghost"
        aria-label="Próximo mês"
        disabled={!month}
        onClick={() => {
          onChange(addMonths(month, 1));
        }}
      >
        ›
      </Button>
    </div>
  );
}
