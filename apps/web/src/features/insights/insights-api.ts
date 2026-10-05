import type { InsightsView } from '@couple-finance/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardKeys } from '@/features/dashboard/dashboard-api';
import { apiFetch } from '@/shared/api/http';

const base = (householdId: string) => `/v1/households/${householdId}/insights`;

/** Under the dashboard key: any expense, budget or commitment change invalidates insights too. */
export const insightKeys = {
  all: (h: string) => [...dashboardKeys.all(h), 'insights'] as const,
  month: (h: string, month: string) => [...dashboardKeys.all(h), 'insights', month] as const,
};

export function useInsights(householdId: string, month: string) {
  return useQuery({
    queryKey: insightKeys.month(householdId, month),
    queryFn: () => apiFetch<InsightsView>(`${base(householdId)}?month=${month}`),
    placeholderData: keepPreviousData,
    enabled: month !== '',
  });
}

export function useInsightDismissals(householdId: string) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: insightKeys.all(householdId) });
  return {
    dismiss: useMutation({
      mutationFn: (fingerprint: string) =>
        apiFetch<undefined>(`${base(householdId)}/dismissals`, {
          method: 'POST',
          json: { fingerprint },
        }),
      onSettled: invalidate,
    }),
    undo: useMutation({
      mutationFn: (fingerprint: string) =>
        apiFetch<undefined>(`${base(householdId)}/dismissals/${encodeURIComponent(fingerprint)}`, {
          method: 'DELETE',
        }),
      onSettled: invalidate,
    }),
  };
}
