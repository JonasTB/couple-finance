import type {
  CloseInstallmentPlanInput,
  ConfirmOccurrenceInput,
  InstallmentPlanInput,
  InstallmentPlanView,
  InstallmentSummary,
  OccurrenceView,
  RecurringExpenseInput,
  RecurringExpenseView,
} from '@couple-finance/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/http';

const base = (householdId: string) => `/v1/households/${householdId}`;

export const commitmentKeys = {
  all: (h: string) => ['households', h, 'commitments'] as const,
  recurringList: (h: string) => ['households', h, 'commitments', 'recurring'] as const,
  recurring: (h: string, id: string) => ['households', h, 'commitments', 'recurring', id] as const,
  occurrences: (h: string, from: string, to: string) =>
    ['households', h, 'commitments', 'occurrences', from, to] as const,
  plans: (h: string) => ['households', h, 'commitments', 'plans'] as const,
  plan: (h: string, id: string) => ['households', h, 'commitments', 'plans', id] as const,
  summary: (h: string) => ['households', h, 'commitments', 'summary'] as const,
};

/** Commitments create and remove expenses: refresh the ledger-derived views too. */
function useInvalidateCommitments(householdId: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: commitmentKeys.all(householdId) }),
      client.invalidateQueries({ queryKey: ['households', householdId, 'transactions'] }),
      client.invalidateQueries({ queryKey: ['households', householdId, 'dashboard'] }),
    ]);
}

// --- recurring expenses ------------------------------------------------------------------------

export function useRecurringExpenses(householdId: string) {
  return useQuery({
    queryKey: commitmentKeys.recurringList(householdId),
    queryFn: () => apiFetch<RecurringExpenseView[]>(`${base(householdId)}/recurring-expenses`),
  });
}

export function useRecurringExpense(householdId: string, id: string | undefined) {
  return useQuery({
    queryKey: commitmentKeys.recurring(householdId, id ?? ''),
    queryFn: () =>
      apiFetch<RecurringExpenseView>(`${base(householdId)}/recurring-expenses/${id ?? ''}`),
    enabled: Boolean(id),
  });
}

export function useOccurrences(householdId: string, range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: commitmentKeys.occurrences(householdId, range?.from ?? '', range?.to ?? ''),
    queryFn: () =>
      apiFetch<OccurrenceView[]>(
        `${base(householdId)}/recurring-expenses/occurrences?from=${range?.from ?? ''}&to=${range?.to ?? ''}`,
      ),
    enabled: range !== null,
  });
}

export function useRecurringMutations(householdId: string) {
  const onSettled = useInvalidateCommitments(householdId);
  const path = `${base(householdId)}/recurring-expenses`;
  const action = (verb: string) => (id: string) =>
    apiFetch<RecurringExpenseView>(`${path}/${id}/${verb}`, { method: 'POST' });
  return {
    create: useMutation({
      mutationFn: (input: RecurringExpenseInput) =>
        apiFetch<RecurringExpenseView>(path, { method: 'POST', json: input }),
      onSettled,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        ...input
      }: Partial<RecurringExpenseInput> & { id: string; version: number }) =>
        apiFetch<RecurringExpenseView>(`${path}/${id}`, { method: 'PATCH', json: input }),
      onSettled,
    }),
    pause: useMutation({ mutationFn: action('pause'), onSettled }),
    resume: useMutation({ mutationFn: action('resume'), onSettled }),
    end: useMutation({
      mutationFn: ({ id, lastDate }: { id: string; lastDate: string }) =>
        apiFetch<RecurringExpenseView>(`${path}/${id}/end`, { method: 'POST', json: { lastDate } }),
      onSettled,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiFetch<undefined>(`${path}/${id}`, { method: 'DELETE' }),
      onSettled,
    }),
    restore: useMutation({ mutationFn: action('restore'), onSettled }),
    confirm: useMutation({
      // `occurrenceDate` goes in the path; `date` (payment date) in the body.
      mutationFn: ({
        id,
        occurrenceDate,
        ...input
      }: ConfirmOccurrenceInput & { id: string; occurrenceDate: string }) =>
        apiFetch<{ transactionId: string }>(`${path}/${id}/occurrences/${occurrenceDate}/confirm`, {
          method: 'POST',
          json: input,
        }),
      onSettled,
    }),
    skip: useMutation({
      mutationFn: ({ id, occurrenceDate }: { id: string; occurrenceDate: string }) =>
        apiFetch<undefined>(`${path}/${id}/occurrences/${occurrenceDate}/skip`, { method: 'POST' }),
      onSettled,
    }),
    unskip: useMutation({
      mutationFn: ({ id, occurrenceDate }: { id: string; occurrenceDate: string }) =>
        apiFetch<undefined>(`${path}/${id}/occurrences/${occurrenceDate}/skip`, {
          method: 'DELETE',
        }),
      onSettled,
    }),
  };
}

// --- installment plans -------------------------------------------------------------------------

export function useInstallmentPlans(householdId: string) {
  return useQuery({
    queryKey: commitmentKeys.plans(householdId),
    queryFn: () => apiFetch<InstallmentPlanView[]>(`${base(householdId)}/installment-plans`),
  });
}

export function useInstallmentPlan(householdId: string, id: string) {
  return useQuery({
    queryKey: commitmentKeys.plan(householdId, id),
    queryFn: () => apiFetch<InstallmentPlanView>(`${base(householdId)}/installment-plans/${id}`),
  });
}

export function useInstallmentSummary(householdId: string) {
  return useQuery({
    queryKey: commitmentKeys.summary(householdId),
    queryFn: () => apiFetch<InstallmentSummary>(`${base(householdId)}/installment-plans/summary`),
  });
}

export function useInstallmentMutations(householdId: string) {
  const onSettled = useInvalidateCommitments(householdId);
  const path = `${base(householdId)}/installment-plans`;
  return {
    create: useMutation({
      mutationFn: (input: InstallmentPlanInput) =>
        apiFetch<InstallmentPlanView>(path, { method: 'POST', json: input }),
      onSettled,
    }),
    close: useMutation({
      mutationFn: ({ id, ...input }: CloseInstallmentPlanInput & { id: string }) =>
        apiFetch<InstallmentPlanView>(`${path}/${id}/close`, { method: 'POST', json: input }),
      onSettled,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiFetch<undefined>(`${path}/${id}`, { method: 'DELETE' }),
      onSettled,
    }),
    restore: useMutation({
      mutationFn: (id: string) =>
        apiFetch<InstallmentPlanView>(`${path}/${id}/restore`, { method: 'POST' }),
      onSettled,
    }),
  };
}
