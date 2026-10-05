import type {
  AcceptedInvitation,
  CreatedInvitation,
  CurrencyCode,
  DefaultSplitRule,
  HouseholdDetail,
  HouseholdInvitationView,
  HouseholdMemberView,
  HouseholdSummary,
  InvitationPreview,
} from '@couple-finance/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/http';
import { request } from '@/shared/api/request';

export const householdKeys = {
  all: ['households'] as const,
  detail: (id: string) => ['households', id] as const,
  members: (id: string) => ['households', id, 'members'] as const,
  invitations: (id: string) => ['households', id, 'invitations'] as const,
};

export function useHouseholds() {
  return useQuery({
    queryKey: householdKeys.all,
    queryFn: () => apiFetch<HouseholdSummary[]>('/v1/households'),
  });
}

export function useHousehold(id: string) {
  return useQuery({
    queryKey: householdKeys.detail(id),
    queryFn: () => apiFetch<HouseholdDetail>(`/v1/households/${id}`),
  });
}

export function useMembers(id: string) {
  return useQuery({
    queryKey: householdKeys.members(id),
    queryFn: () => apiFetch<HouseholdMemberView[]>(`/v1/households/${id}/members`),
  });
}

export function useInvitations(id: string, enabled: boolean) {
  return useQuery({
    queryKey: householdKeys.invitations(id),
    queryFn: () => apiFetch<HouseholdInvitationView[]>(`/v1/households/${id}/invitations`),
    enabled,
  });
}

export interface CreateHouseholdInput {
  name: string;
  currency: CurrencyCode;
  timezone: string;
  defaultSplit: DefaultSplitRule;
}

export function useCreateHousehold() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHouseholdInput) =>
      apiFetch<HouseholdDetail>('/v1/households', { method: 'POST', json: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: householdKeys.all }),
  });
}

export interface UpdateHouseholdInput {
  version: number;
  name?: string;
  defaultSplit?: DefaultSplitRule;
}

/** Every mutation below refreshes the whole household subtree (detail, members, invitations). */
function useHouseholdMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: householdKeys.all });
    },
  });
}

export function useUpdateHousehold(id: string) {
  return useHouseholdMutation((input: UpdateHouseholdInput) =>
    apiFetch<HouseholdDetail>(`/v1/households/${id}`, { method: 'PATCH', json: input }),
  );
}

export function useCreateInvitation(id: string) {
  return useHouseholdMutation((email: string) =>
    apiFetch<CreatedInvitation>(`/v1/households/${id}/invitations`, {
      method: 'POST',
      json: { email },
    }),
  );
}

export function useRevokeInvitation(id: string) {
  return useHouseholdMutation((invitationId: string) =>
    apiFetch<undefined>(`/v1/households/${id}/invitations/${invitationId}`, { method: 'DELETE' }),
  );
}

export function useRemoveMember(id: string) {
  return useHouseholdMutation((memberId: string) =>
    apiFetch<undefined>(`/v1/households/${id}/members/${memberId}`, { method: 'DELETE' }),
  );
}

export function useTransferOwnership(id: string) {
  return useHouseholdMutation((memberId: string) =>
    apiFetch<undefined>(`/v1/households/${id}/transfer-ownership`, {
      method: 'POST',
      json: { memberId },
    }),
  );
}

export function useLeaveHousehold(id: string) {
  return useHouseholdMutation(() =>
    apiFetch<undefined>(`/v1/households/${id}/leave`, { method: 'POST' }),
  );
}

export function previewInvitation(token: string): Promise<InvitationPreview> {
  return request<InvitationPreview>('/v1/invitations/preview', { method: 'POST', json: { token } });
}

export function acceptInvitation(token: string): Promise<AcceptedInvitation> {
  return apiFetch<AcceptedInvitation>('/v1/invitations/accept', {
    method: 'POST',
    json: { token },
  });
}
