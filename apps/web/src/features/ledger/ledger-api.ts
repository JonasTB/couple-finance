import type {
  CategoryView,
  HouseholdIncomeOverview,
  IncomeRecordView,
  IncomeVisibility,
  PaymentMethod,
  SplitInput,
  SplitPreview,
  TransactionHistoryEntry,
  TransactionPage,
  TransactionView,
} from '@couple-finance/shared';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/http';

const base = (householdId: string) => `/v1/households/${householdId}`;

export const ledgerKeys = {
  categories: (h: string, includeArchived = false) =>
    ['households', h, 'categories', includeArchived] as const,
  incomes: (h: string) => ['households', h, 'incomes'] as const,
  transactions: (h: string) => ['households', h, 'transactions'] as const,
  transactionList: (h: string, filters: TransactionFilters) =>
    ['households', h, 'transactions', 'list', filters] as const,
  transaction: (h: string, id: string) => ['households', h, 'transactions', 'item', id] as const,
  history: (h: string, id: string) => ['households', h, 'transactions', 'history', id] as const,
};

// --- categories --------------------------------------------------------------------------------

export function useCategories(householdId: string, includeArchived = false) {
  return useQuery({
    queryKey: ledgerKeys.categories(householdId, includeArchived),
    queryFn: () =>
      apiFetch<CategoryView[]>(
        `${base(householdId)}/categories${includeArchived ? '?includeArchived=true' : ''}`,
      ),
  });
}

export function useCategoryMutations(householdId: string) {
  const client = useQueryClient();
  const invalidate = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['households', householdId, 'categories'] }),
      // Category names appear on the dashboard.
      client.invalidateQueries({ queryKey: ['households', householdId, 'dashboard'] }),
    ]);
  return {
    create: useMutation({
      mutationFn: (input: { name: string; parentId?: string }) =>
        apiFetch<CategoryView>(`${base(householdId)}/categories`, { method: 'POST', json: input }),
      onSettled: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...changes }: { id: string; name?: string; archived?: boolean }) =>
        apiFetch<undefined>(`${base(householdId)}/categories/${id}`, {
          method: 'PATCH',
          json: changes,
        }),
      onSettled: invalidate,
    }),
  };
}

// --- incomes -----------------------------------------------------------------------------------

export function useIncomeOverview(householdId: string) {
  return useQuery({
    queryKey: [...ledgerKeys.incomes(householdId), 'overview'],
    queryFn: () => apiFetch<HouseholdIncomeOverview>(`${base(householdId)}/incomes`),
  });
}

export function useMyIncomeHistory(householdId: string) {
  return useQuery({
    queryKey: [...ledgerKeys.incomes(householdId), 'me'],
    queryFn: () => apiFetch<IncomeRecordView[]>(`${base(householdId)}/incomes/me`),
  });
}

export function useIncomeMutations(householdId: string) {
  const client = useQueryClient();
  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ledgerKeys.incomes(householdId) });
    await client.invalidateQueries({ queryKey: ['households', householdId, 'members'] });
  };
  return {
    add: useMutation({
      mutationFn: (input: { monthlyAmountCents: number; effectiveFrom: string }) =>
        apiFetch<IncomeRecordView>(`${base(householdId)}/incomes/me`, {
          method: 'POST',
          json: input,
        }),
      onSettled: invalidate,
    }),
    remove: useMutation({
      mutationFn: (recordId: string) =>
        apiFetch<undefined>(`${base(householdId)}/incomes/me/${recordId}`, { method: 'DELETE' }),
      onSettled: invalidate,
    }),
    setVisibility: useMutation({
      mutationFn: (incomeVisibility: IncomeVisibility) =>
        apiFetch<undefined>(`${base(householdId)}/members/me`, {
          method: 'PATCH',
          json: { incomeVisibility },
        }),
      onSettled: invalidate,
    }),
  };
}

// --- transactions ------------------------------------------------------------------------------

export interface TransactionFilters {
  from?: string;
  to?: string;
  categoryId?: string;
  payerMemberId?: string;
  q?: string;
  deleted?: 'only';
}

export function useTransactions(householdId: string, filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: ledgerKeys.transactionList(householdId, filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters) as [string, string | undefined][]) {
        if (value) params.set(key, value);
      }
      if (pageParam) params.set('cursor', pageParam);
      params.set('limit', '50');
      return apiFetch<TransactionPage>(`${base(householdId)}/transactions?${params.toString()}`);
    },
    getNextPageParam: (last) => last.page.nextCursor,
    placeholderData: keepPreviousData,
  });
}

export function useTransaction(householdId: string, id: string | undefined) {
  return useQuery({
    queryKey: ledgerKeys.transaction(householdId, id ?? ''),
    queryFn: () => apiFetch<TransactionView>(`${base(householdId)}/transactions/${id ?? ''}`),
    enabled: Boolean(id),
  });
}

export function useTransactionHistory(householdId: string, id: string) {
  return useQuery({
    queryKey: ledgerKeys.history(householdId, id),
    queryFn: () =>
      apiFetch<TransactionHistoryEntry[]>(`${base(householdId)}/transactions/${id}/history`),
  });
}

export interface TransactionInput {
  description: string;
  amountCents: number;
  date: string;
  categoryId: string;
  payerMemberId: string;
  paymentMethod: PaymentMethod;
  notes: string | null;
  tags: string[];
  split?: SplitInput;
}

export function useTransactionMutations(householdId: string) {
  const client = useQueryClient();
  // Totals, balances and the explanation on the dashboard derive from expenses.
  const invalidate = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ledgerKeys.transactions(householdId) }),
      client.invalidateQueries({ queryKey: ['households', householdId, 'dashboard'] }),
    ]);
  const path = `${base(householdId)}/transactions`;
  return {
    create: useMutation({
      mutationFn: (input: TransactionInput) =>
        apiFetch<TransactionView>(path, { method: 'POST', json: input }),
      onSettled: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: Partial<TransactionInput> & { id: string; version: number }) =>
        apiFetch<TransactionView>(`${path}/${id}`, { method: 'PATCH', json: input }),
      onSettled: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => apiFetch<undefined>(`${path}/${id}`, { method: 'DELETE' }),
      onSettled: invalidate,
    }),
    restore: useMutation({
      mutationFn: (id: string) =>
        apiFetch<TransactionView>(`${path}/${id}/restore`, { method: 'POST' }),
      onSettled: invalidate,
    }),
    recalculate: useMutation({
      mutationFn: (id: string) =>
        apiFetch<TransactionView>(`${path}/${id}/recalculate-split`, { method: 'POST' }),
      onSettled: invalidate,
    }),
  };
}

export function previewSplit(
  householdId: string,
  input: { amountCents: number; date: string; split?: SplitInput },
): Promise<SplitPreview> {
  return apiFetch<SplitPreview>(`${base(householdId)}/transactions/preview-split`, {
    method: 'POST',
    json: input,
  });
}
