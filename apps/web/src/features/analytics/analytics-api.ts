import type { AnalyticsView } from '@couple-finance/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { dashboardKeys } from '@/features/dashboard/dashboard-api';
import { apiFetch } from '@/shared/api/http';

/**
 * Under the dashboard key, so any expense or settlement change invalidates it too. Goal entries
 * live elsewhere, hence no stale time: the page refetches whenever it opens.
 */
export const analyticsKeys = {
  window: (h: string, month: string | null, months: number) =>
    [...dashboardKeys.all(h), 'analytics', month, months] as const,
};

/** `month` null → the API ends the window at the current month (household time zone). */
export function useAnalytics(householdId: string, month: string | null, months: number) {
  const params = new URLSearchParams({ months: String(months) });
  if (month) params.set('month', month);
  return useQuery({
    queryKey: analyticsKeys.window(householdId, month, months),
    queryFn: () =>
      apiFetch<AnalyticsView>(`/v1/households/${householdId}/analytics?${params.toString()}`),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
}
