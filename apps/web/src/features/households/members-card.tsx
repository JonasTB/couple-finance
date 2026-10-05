import type { HouseholdMemberView } from '@couple-finance/shared';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { useRemoveMember, useTransferOwnership } from './households-api';
import { ROLE_LABELS } from './split-labels';

interface MembersCardProps {
  householdId: string;
  members: HouseholdMemberView[];
  isOwner: boolean;
}

export function MembersCard({ householdId, members, isOwner }: MembersCardProps) {
  const removeMember = useRemoveMember(householdId);
  const transferOwnership = useTransferOwnership(householdId);
  const error = removeMember.error ?? transferOwnership.error;

  return (
    <Card title="Quem faz parte">
      {error && (
        <FormAlert
          message={errorMessage(error instanceof ApiError ? error.code : 'INTERNAL_ERROR')}
        />
      )}
      <ul className="divide-y divide-border" aria-label="Membros">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span>
              <span className="block font-medium">
                {member.displayName}
                {member.isMe && <span className="text-muted-foreground"> (você)</span>}
              </span>
              <span className="block text-sm text-muted-foreground">
                {member.email} · {ROLE_LABELS[member.role]}
              </span>
            </span>
            {isOwner && !member.isMe && (
              <span className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      window.confirm(`Passar a administração da casa para ${member.displayName}?`)
                    ) {
                      transferOwnership.mutate(member.id);
                    }
                  }}
                >
                  Passar administração
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remover ${member.displayName} da casa? O histórico é mantido.`,
                      )
                    ) {
                      removeMember.mutate(member.id);
                    }
                  }}
                >
                  Remover
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
