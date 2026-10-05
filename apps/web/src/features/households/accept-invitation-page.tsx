import type { InvitationPreview } from '@couple-finance/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { useSession } from '@/shared/auth/session';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { activeHousehold, pendingInvitation } from './browser-storage';
import { acceptInvitation, previewInvitation } from './households-api';

/** Moves the token out of the address bar (`#t=…`) into tab-scoped storage. */
function takeTokenFromLocation(): string | null {
  const match = /(?:^|[#&])t=([A-Za-z0-9_-]+)/.exec(window.location.hash);
  if (match?.[1]) {
    pendingInvitation.set(match[1]);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
  return pendingInvitation.get();
}

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; token: string; preview: InvitationPreview };

const INVALID_MESSAGE =
  'Este convite não é mais válido: pode ter expirado, sido cancelado ou já usado. Peça um novo link a quem convidou você.';

export function AcceptInvitationPage() {
  const session = useSession();
  const navigate = useNavigate();
  // Read once on mount: moves the token out of the address bar into tab storage.
  const [token] = useState(takeTokenFromLocation);
  const [state, setState] = useState<State>(() =>
    token ? { kind: 'loading' } : { kind: 'missing' },
  );
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string>();

  useEffect(() => {
    if (!token) {
      return;
    }
    previewInvitation(token)
      .then((preview) => {
        setState({ kind: 'ready', token, preview });
      })
      .catch((error: unknown) => {
        pendingInvitation.set(null);
        const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
        setState({
          kind: 'invalid',
          message:
            code === 'INVITATION_INVALID' || code === 'VALIDATION_FAILED'
              ? INVALID_MESSAGE
              : errorMessage(code),
        });
      });
  }, [token]);

  const onAccept = async (token: string) => {
    setAccepting(true);
    setAcceptError(undefined);
    try {
      const { householdId } = await acceptInvitation(token);
      pendingInvitation.set(null);
      activeHousehold.set(householdId);
      await navigate(`/casas/${householdId}`, { replace: true });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
      if (code === 'INVITATION_EMAIL_MISMATCH') {
        setAcceptError(
          'Este convite foi enviado para outro e-mail. Entre com a conta desse e-mail para aceitar.',
        );
      } else if (code === 'INVITATION_INVALID') {
        pendingInvitation.set(null);
        setAcceptError(INVALID_MESSAGE);
      } else if (code === 'HOUSEHOLD_FULL') {
        setAcceptError('Esta casa já está completa.');
      } else if (code === 'ALREADY_MEMBER') {
        pendingInvitation.set(null);
        setAcceptError('Você já faz parte desta casa.');
      } else {
        setAcceptError(errorMessage(code));
      }
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Convite</h1>
      {state.kind === 'loading' && (
        <p role="status" className="text-muted-foreground">
          Verificando convite…
        </p>
      )}
      {state.kind === 'missing' && <FormAlert message="Nenhum convite encontrado neste link." />}
      {state.kind === 'invalid' && <FormAlert message={state.message} />}
      {state.kind === 'ready' && (
        <Card>
          <p className="text-lg">
            <strong>{state.preview.inviterDisplayName || 'Alguém'}</strong> convidou você para
            participar da casa <strong>{state.preview.householdName}</strong>.
          </p>
          <p className="text-sm text-muted-foreground">
            O convite foi enviado para {state.preview.emailHint}.
          </p>
          <FormAlert message={acceptError} />
          {session.status === 'authenticated' ? (
            <Button
              className="w-full"
              disabled={accepting}
              onClick={() => void onAccept(state.token)}
            >
              {accepting ? 'Entrando na casa…' : 'Aceitar convite'}
            </Button>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild>
                <Link to="/criar-conta?redirect=%2Fconvite">Criar conta</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/entrar?redirect=%2Fconvite">Já tenho conta</Link>
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
