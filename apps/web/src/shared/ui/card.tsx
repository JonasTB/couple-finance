import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface CardProps extends Omit<ComponentProps<'section'>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
}

export function Card({ title, description, className, children, ...props }: CardProps) {
  return (
    <section
      className={cn('space-y-4 rounded-lg border border-border bg-card p-4', className)}
      {...props}
    >
      {(title ?? description) && (
        <header className="space-y-1">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
