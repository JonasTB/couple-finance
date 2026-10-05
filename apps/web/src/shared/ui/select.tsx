import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/cn';

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base outline-none',
        'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30',
        className,
      )}
      {...props}
    />
  );
}
