import type { CreatedInvitation } from '@couple-finance/shared';
import { useState } from 'react';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { useCreateInvitation, useInvitations, useRevokeInvitation } from './households-api';
import { invitationLink } from './invitation-link';

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });

function CreatedLink({ created }: { created: CreatedInvitation }) {
  const [copied, setCopied] = useState(false);
  const link = invitationLink(created.token);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <p className="text-sm">
        Envie este link para <strong>{created.invitation.email}</strong> pelo canal que preferir.
        Ele vale até {dateFormat.format(new Date(created.invitation.expiresAt))} e só funciona uma
        vez.
      </p>
      <Input
        readOnly
        value={link}
        aria-label="Link do convite"
        onFocus={(e) => {
          e.target.select();
        }}
      />
      <Button type="button" variant="outline" onClick={() => void copy()}>
        {copied ? 'Link copiado' : 'Copiar link'}
      </Button>
      <p className="text-sm text-muted-foreground">
        Por segurança, o link não é mostrado de novo. Se perder, gere um novo.
      </p>
    </div>
  );
}

export function InviteCard({
  householdId,
  canInvite,
}: {
  householdId: string;
  canInvite: boolean;
}) {
  const invitations = useInvitations(householdId, true);
  const createInvitation = useCreateInvitation(householdId);
  const revokeInvitation = useRevokeInvitation(householdId);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [created, setCreated] = useState<CreatedInvitation>();

  const send = async (target: string) => {
    const value = target.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError('Informe um e-mail válido.');
      return;
    }
    setEmailError(undefined);
    try {
      setCreated(await createInvitation.mutateAsync(value));
      setEmail('');
    } catch {
      // Shown via mutation state.
    }
  };

  const error = createInvitation.error ?? revokeInvitation.error;
  const pending = invitations.data ?? [];

  return (
    <Card
      title="Convidar parceiro(a)"
      description="Quem for convidado precisa criar a conta com o mesmo e-mail do convite."
    >
      {error && (
        <FormAlert
          message={errorMessage(error instanceof ApiError ? error.code : 'INTERNAL_ERROR')}
        />
      )}
      {created && <CreatedLink created={created} />}
      {canInvite && pending.length === 0 && (
        <form
          className="space-y-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void send(email);
          }}
        >
          <FormField label="E-mail do(a) parceiro(a)" error={emailError}>
            <Input
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </FormField>
          <Button type="submit" disabled={createInvitation.isPending}>
            {createInvitation.isPending ? 'Gerando link…' : 'Gerar link de convite'}
          </Button>
        </form>
      )}
      {pending.length > 0 && (
        <ul className="space-y-2" aria-label="Convites pendentes">
          {pending.map((invitation) => (
            <li
              key={invitation.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
            >
              <span>
                <span className="block font-medium">{invitation.email}</span>
                <span className="block text-sm text-muted-foreground">
                  {invitation.status === 'EXPIRED'
                    ? 'Convite expirado'
                    : `Aguardando resposta · vale até ${dateFormat.format(new Date(invitation.expiresAt))}`}
                </span>
              </span>
              <span className="flex gap-2">
                <Button variant="outline" onClick={() => void send(invitation.email)}>
                  Gerar novo link
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    revokeInvitation.mutate(invitation.id);
                  }}
                >
                  Cancelar
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
