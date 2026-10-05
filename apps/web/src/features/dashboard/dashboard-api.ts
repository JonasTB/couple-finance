import type { DashboardView, SettlementInput, SettlementView } from '@couple-finance/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/http';

const base = (householdId: string) => `/v1/households/${householdId}`;

export const dashboardKeys = {
  /** Everything derived from the ledger; invalidated by any expense or settlement change. */
  all: (h: string) => ['households', h, 'dashboard'] as const,
  month: (h: string, month: string | null) => ['households', h, 'dashboard', month] as const,
  settlements: (h: string, from: string, to: string) =>
    ['households', h, 'dashboard', 'settlements', from, to] as const,
};

/** `month` null → the API picks the current month in the household time zone. */
export function useDashboard(householdId: string, month: string | null) {
  return useQuery({
    queryKey: dashboardKeys.month(householdId, month),
    queryFn: () =>
      apiFetch<DashboardView>(`${base(householdId)}/dashboard${month ? `?month=${month}` : ''}`),
    placeholderData: keepPreviousData,
  });
}

export function useSettlements(householdId: string, range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: dashboardKeys.settlements(householdId, range?.from ?? '', range?.to ?? ''),
    queryFn: () =>
      apiFetch<SettlementView[]>(
        `${base(householdId)}/settlements?from=${range?.from ?? ''}&to=${range?.to ?? ''}`,
      ),
    enabled: range !== null,
  });
}

export function useSettlementMutations(householdId: string) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: dashboardKeys.all(householdId) });
  const path = `${base(householdId)}/settlements`;
  return {
    create: useMutation({
      mutationFn: (input: SettlementInput) =>
        apiFetch<SettlementView>(path, { method: 'POST', json: input }),
      onSettled: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiFetch<undefined>(`${path}/${id}`, { method: 'DELETE' }),
      onSettled: invalidate,
    }),
    restore: useMutation({
      mutationFn: (id: string) =>
        apiFetch<SettlementView>(`${path}/${id}/restore`, { method: 'POST' }),
      onSettled: invalidate,
    }),
  };
}
