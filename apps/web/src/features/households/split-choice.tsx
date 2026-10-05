import type { DefaultSplitType } from '@couple-finance/shared';
import { cn } from '@/shared/lib/cn';
import { SPLIT_LABELS } from './split-labels';

interface SplitChoiceProps {
  name: string;
  value: DefaultSplitType;
  options: readonly DefaultSplitType[];
  onChange: (value: DefaultSplitType) => void;
}

/** Radio cards for the household's default split rule. */
export function SplitChoice({ name, value, options, onChange }: SplitChoiceProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium">Divisão padrão das despesas da casa</legend>
      {options.map((option) => (
        <label
          key={option}
          className={cn(
            'flex cursor-pointer gap-3 rounded-lg border p-3',
            value === option ? 'border-primary bg-primary/5' : 'border-border',
          )}
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => {
              onChange(option);
            }}
            className="mt-1 accent-[var(--primary)]"
          />
          <span>
            <span className="block font-medium">{SPLIT_LABELS[option].title}</span>
            <span className="block text-sm text-muted-foreground">
              {SPLIT_LABELS[option].description}
            </span>
          </span>
        </label>
      ))}
      <p className="text-sm text-muted-foreground">
        Dá para mudar depois, e cada despesa pode ter uma divisão diferente.
      </p>
    </fieldset>
  );
}
