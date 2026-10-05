import type {
  GoalEntryInput,
  GoalInput,
  GoalView,
  PurchaseInput,
  PurchaseItemInput,
  PurchasePlanInput,
  PurchasePlanView,
} from '@couple-finance/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/http';

const base = (householdId: string) => `/v1/households/${householdId}`;

export const planningKeys = {
  all: (h: string) => ['households', h, 'planning'] as const,
  goals: (h: string) => ['households', h, 'planning', 'goals'] as const,
  goal: (h: string, id: string) => ['households', h, 'planning', 'goals', id] as const,
  plans: (h: string) => ['households', h, 'planning', 'plans'] as const,
  plan: (h: string, id: string) => ['households', h, 'planning', 'plans', id] as const,
};

function useInvalidatePlanning(householdId: string) {
  const client = useQueryClient();
  // Plans show their goal's saved amount, so goals and plans refresh together.
  return () => client.invalidateQueries({ queryKey: planningKeys.all(householdId) });
}

export function useGoals(householdId: string) {
  return useQuery({
    queryKey: planningKeys.goals(householdId),
    queryFn: () => apiFetch<GoalView[]>(`${base(householdId)}/goals`),
  });
}

export function useGoal(householdId: string, id: string) {
  return useQuery({
    queryKey: planningKeys.goal(householdId, id),
    queryFn: () => apiFetch<GoalView>(`${base(householdId)}/goals/${id}`),
  });
}

export function useGoalMutations(householdId: string) {
  const onSettled = useInvalidatePlanning(householdId);
  const path = `${base(householdId)}/goals`;
  return {
    create: useMutation({
      mutationFn: (input: GoalInput) => apiFetch<GoalView>(path, { method: 'POST', json: input }),
      onSettled,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: Partial<GoalInput> & { id: string; version: number }) =>
        apiFetch<GoalView>(`${path}/${id}`, { method: 'PATCH', json: input }),
      onSettled,
    }),
    setArchived: useMutation({
      mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
        apiFetch<GoalView>(`${path}/${id}/${archived ? 'archive' : 'restore'}`, { method: 'POST' }),
      onSettled,
    }),
    addEntry: useMutation({
      mutationFn: ({ id, ...input }: GoalEntryInput & { id: string }) =>
        apiFetch<GoalView>(`${path}/${id}/entries`, { method: 'POST', json: input }),
      onSettled,
    }),
    removeEntry: useMutation({
      mutationFn: ({ id, entryId }: { id: string; entryId: string }) =>
        apiFetch<GoalView>(`${path}/${id}/entries/${entryId}`, { method: 'DELETE' }),
      onSettled,
    }),
    restoreEntry: useMutation({
      mutationFn: ({ id, entryId }: { id: string; entryId: string }) =>
        apiFetch<GoalView>(`${path}/${id}/entries/${entryId}/restore`, { method: 'POST' }),
      onSettled,
    }),
  };
}

export function usePurchasePlans(householdId: string) {
  return useQuery({
    queryKey: planningKeys.plans(householdId),
    queryFn: () => apiFetch<PurchasePlanView[]>(`${base(householdId)}/purchase-plans`),
  });
}

export function usePurchasePlan(householdId: string, id: string) {
  return useQuery({
    queryKey: planningKeys.plan(householdId, id),
    queryFn: () => apiFetch<PurchasePlanView>(`${base(householdId)}/purchase-plans/${id}`),
  });
}

export function usePurchasePlanMutations(householdId: string) {
  const onSettled = useInvalidatePlanning(householdId);
  const path = `${base(householdId)}/purchase-plans`;
  const item = (planId: string, itemId: string, suffix = '') =>
    `${path}/${planId}/items/${itemId}${suffix}`;
  return {
    create: useMutation({
      mutationFn: (input: PurchasePlanInput) =>
        apiFetch<PurchasePlanView>(path, { method: 'POST', json: input }),
      onSettled,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        ...input
      }: Partial<PurchasePlanInput> & { id: string; version: number }) =>
        apiFetch<PurchasePlanView>(`${path}/${id}`, { method: 'PATCH', json: input }),
      onSettled,
    }),
    setArchived: useMutation({
      mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
        apiFetch<PurchasePlanView>(`${path}/${id}/${archived ? 'archive' : 'restore'}`, {
          method: 'POST',
        }),
      onSettled,
    }),
    addItem: useMutation({
      mutationFn: ({ planId, ...input }: PurchaseItemInput & { planId: string }) =>
        apiFetch<PurchasePlanView>(`${path}/${planId}/items`, { method: 'POST', json: input }),
      onSettled,
    }),
    updateItem: useMutation({
      mutationFn: ({
        planId,
        itemId,
        ...input
      }: Partial<PurchaseItemInput> & { planId: string; itemId: string; version: number }) =>
        apiFetch<PurchasePlanView>(item(planId, itemId), { method: 'PATCH', json: input }),
      onSettled,
    }),
    purchase: useMutation({
      mutationFn: ({
        planId,
        itemId,
        ...input
      }: PurchaseInput & { planId: string; itemId: string }) =>
        apiFetch<PurchasePlanView>(item(planId, itemId, '/purchase'), {
          method: 'POST',
          json: input,
        }),
      onSettled,
    }),
    unpurchase: useMutation({
      mutationFn: ({ planId, itemId }: { planId: string; itemId: string }) =>
        apiFetch<PurchasePlanView>(item(planId, itemId, '/unpurchase'), { method: 'POST' }),
      onSettled,
    }),
    removeItem: useMutation({
      mutationFn: ({ planId, itemId }: { planId: string; itemId: string }) =>
        apiFetch<PurchasePlanView>(item(planId, itemId), { method: 'DELETE' }),
      onSettled,
    }),
    restoreItem: useMutation({
      mutationFn: ({ planId, itemId }: { planId: string; itemId: string }) =>
        apiFetch<PurchasePlanView>(item(planId, itemId, '/restore'), { method: 'POST' }),
      onSettled,
    }),
  };
}
