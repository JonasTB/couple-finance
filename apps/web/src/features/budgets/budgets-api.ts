import type { BudgetChangeInput, BudgetMonthView } from '@couple-finance/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/http';

const base = (householdId: string) => `/v1/households/${householdId}/budgets`;

/**
 * Budget status derives from expenses, so it lives under the dashboard key: every expense,
 * commitment or category change already invalidates it.
 */
export const budgetKeys = {
  month: (h: string, month: string | null) =>
    ['households', h, 'dashboard', 'budgets', month] as const,
};

/** `month` null → the current month in the household time zone. */
export function useBudgetMonth(householdId: string, month: string | null) {
  return useQuery({
    queryKey: budgetKeys.month(householdId, month),
    queryFn: () =>
      apiFetch<BudgetMonthView>(`${base(householdId)}${month ? `?month=${month}` : ''}`),
    placeholderData: keepPreviousData,
  });
}

export function useBudgetChange(householdId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BudgetChangeInput) =>
      apiFetch<BudgetMonthView>(`${base(householdId)}/changes`, { method: 'POST', json: input }),
    onSettled: () =>
      client.invalidateQueries({ queryKey: ['households', householdId, 'dashboard'] }),
  });
}
