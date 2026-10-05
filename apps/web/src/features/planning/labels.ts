import type {
  CurrencyCode,
  GoalView,
  PurchaseItemStatus,
  PurchasePriority,
} from '@couple-finance/shared';
import { formatDate, formatMonth } from '@/shared/lib/dates';
import { formatCents } from '@/shared/lib/money';

export const PRIORITY_LABELS: Record<PurchasePriority, string> = {
  HIGH: 'Alta',
  MEDIUM: 'Média',
  LOW: 'Baixa',
};

export const ITEM_STATUS_LABELS: Record<PurchaseItemStatus, string> = {
  PENDING: 'A comprar',
  PURCHASED: 'Comprados',
  FUTURE: 'Para o futuro',
};

/** Neutral, deterministic forecast sentences (CALCULATIONS §8); the numbers come from the API. */
export function forecastLines(goal: GoalView, currency: CurrencyCode): string[] {
  const money = (cents: number) => formatCents(cents, currency);
  if (goal.status === 'ACHIEVED') {
    return ['Meta atingida.'];
  }
  const lines: string[] = [];
  const { forecast } = goal;
  if (forecast.paceMonths === 0) {
    lines.push('A previsão aparece depois do primeiro mês completo de aportes.');
  } else if (forecast.forecastMonth && forecast.paceCents !== null) {
    lines.push(
      `No ritmo atual (${money(forecast.paceCents)}/mês), a meta é atingida em ${formatMonth(forecast.forecastMonth)}.`,
    );
  } else {
    lines.push('Sem previsão no ritmo atual: os últimos meses não somaram aportes.');
  }
  if (forecast.requiredMonthlyCents !== null && goal.targetDate) {
    lines.push(
      forecast.deadlinePassed
        ? `O prazo (${formatDate(goal.targetDate)}) passou; faltam ${money(goal.remainingCents)}.`
        : `Para chegar até ${formatDate(goal.targetDate)}: ${money(forecast.requiredMonthlyCents)} por mês.`,
    );
  }
  return lines;
}
