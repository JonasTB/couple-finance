import { Link } from 'react-router';
import { cn } from '@/shared/lib/cn';
import { Card } from '@/shared/ui/card';

interface OnboardingCardProps {
  isOwner: boolean;
  hasPartner: boolean;
  hasAnyTransactions: boolean;
}

/** Empty state that points to the next action (FR-DASH-05): household → invite → first expense. */
export function OnboardingCard({ isOwner, hasPartner, hasAnyTransactions }: OnboardingCardProps) {
  if (hasPartner && hasAnyTransactions) {
    return null;
  }
  const steps = [
    { done: true, label: 'Criar a casa', action: null },
    {
      done: hasPartner,
      label: 'Convidar quem divide a casa com você',
      action: isOwner ? { to: 'casa', text: 'Convidar' } : null,
    },
    {
      done: hasAnyTransactions,
      label: 'Registrar a primeira despesa',
      action: { to: 'despesas/nova', text: 'Registrar' },
    },
  ];
  return (
    <Card title="Primeiros passos" description="O painel ganha vida com as despesas da casa.">
      <ol className="space-y-2" aria-label="Passos">
        {steps.map((step) => (
          <li key={step.label} className="flex min-h-11 items-center justify-between gap-3">
            <span className={cn('flex items-center gap-2', step.done && 'text-muted-foreground')}>
              <span aria-hidden="true">{step.done ? '✓' : '○'}</span>
              <span>
                {step.label}
                {step.done && <span className="sr-only"> (concluído)</span>}
              </span>
            </span>
            {!step.done && step.action && (
              <Link
                to={step.action.to}
                className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary hover:bg-muted"
              >
                {step.action.text}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
