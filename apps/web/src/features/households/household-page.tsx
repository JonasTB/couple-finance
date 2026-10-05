import { MAX_ACTIVE_MEMBERS } from '@couple-finance/shared';
import { useNavigate, useParams } from 'react-router';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { activeHousehold } from './browser-storage';
import { useHousehold, useLeaveHousehold, useMembers } from './households-api';
import { InviteCard } from './invite-card';
import { MembersCard } from './members-card';
import { SettingsCard } from './settings-card';
import { SPLIT_LABELS } from './split-labels';

export function HouseholdPage() {
  const { householdId = '' } = useParams();
  const navigate = useNavigate();
  const household = useHousehold(householdId);
  const members = useMembers(householdId);
  const leave = useLeaveHousehold(householdId);

  const loadError = household.error ?? members.error;
  if (loadError) {
    const code = loadError instanceof ApiError ? loadError.code : 'INTERNAL_ERROR';
    return (
      <div className="space-y-4">
        <FormAlert message={errorMessage(code)} />
        <Button
          variant="outline"
          onClick={() => {
            activeHousehold.set(null);
            void navigate('/', { replace: true });
          }}
        >
          Voltar ao início
        </Button>
      </div>
    );
  }
  if (!household.data || !members.data) {
    return (
      <p role="status" className="py-12 text-center text-muted-foreground">
        Carregando…
      </p>
    );
  }

  const detail = household.data;
  const isOwner = detail.me.role === 'OWNER';
  const isFull = members.data.length >= MAX_ACTIVE_MEMBERS;
  const isLastMember = members.data.length === 1;

  const onLeave = async () => {
    const message = isLastMember
      ? 'Você é a única pessoa na casa. Sair arquiva a casa. Continuar?'
      : 'Sair da casa? Você perde o acesso, mas o histórico é mantido.';
    if (!window.confirm(message)) {
      return;
    }
    try {
      await leave.mutateAsync(undefined);
      activeHousehold.set(null);
      await navigate('/', { replace: true });
    } catch {
      // Shown via mutation state.
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Divisão padrão: {SPLIT_LABELS[detail.defaultSplit.type].title.toLowerCase()}
      </p>

      {isOwner && !isFull && <InviteCard householdId={detail.id} canInvite />}
      <MembersCard householdId={detail.id} members={members.data} isOwner={isOwner} />
      {isOwner && <SettingsCard key={detail.version} household={detail} members={members.data} />}

      <Card title="Sair da casa">
        {leave.error && (
          <FormAlert
            message={
              leave.error instanceof ApiError && leave.error.code === 'OWNERSHIP_TRANSFER_REQUIRED'
                ? 'Antes de sair, passe a administração da casa para outra pessoa.'
                : errorMessage(
                    leave.error instanceof ApiError ? leave.error.code : 'INTERNAL_ERROR',
                  )
            }
          />
        )}
        <Button variant="ghost" onClick={() => void onLeave()}>
          Sair da casa
        </Button>
      </Card>
    </div>
  );
}
