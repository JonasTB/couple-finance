import { type ReactElement, cloneElement, useId } from 'react';

interface FormFieldProps {
  label: string;
  error?: string | undefined;
  hint?: string;
  /** A single input element; it receives id and ARIA wiring. */
  children: ReactElement<Record<string, unknown>>;
}

/** Label + control + hint/error with accessible associations. */
export function FormField({ label, error, hint, children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-warning-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
