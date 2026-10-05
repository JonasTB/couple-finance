import type {
  InstallmentPlanStatus,
  RecurrenceFrequency,
  RecurringStatus,
} from '@couple-finance/shared';
import { formatDate } from '@/shared/lib/dates';

export const RECURRING_STATUS_LABELS: Record<RecurringStatus, string> = {
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  ENDED: 'Encerrada',
};

export const PLAN_STATUS_LABELS: Record<InstallmentPlanStatus, string> = {
  ACTIVE: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Parcelas canceladas',
  PAID_OFF: 'Quitada antecipadamente',
};

const UNIT: Record<RecurrenceFrequency, [string, string]> = {
  WEEKLY: ['semana', 'semanas'],
  MONTHLY: ['mês', 'meses'],
  YEARLY: ['ano', 'anos'],
};

/** "Todo mês, dia 10" · "A cada 2 semanas (quinta-feira)" · "Todo ano, 10 de agosto". */
export function scheduleText(
  frequency: RecurrenceFrequency,
  interval: number,
  startDate: string,
): string {
  const [one, many] = UNIT[frequency];
  const every =
    interval === 1
      ? `${frequency === 'WEEKLY' ? 'Toda' : 'Todo'} ${one}`
      : `A cada ${String(interval)} ${many}`;
  if (frequency === 'WEEKLY') {
    const weekday = formatDate(startDate, 'weekday').split(',')[0] ?? '';
    return `${every} (${weekday})`;
  }
  if (frequency === 'YEARLY') {
    return `${every}, ${formatDate(startDate).replace(/ de \d{4}$/, '')}`;
  }
  return `${every}, dia ${String(Number(startDate.slice(8, 10)))}`;
}
