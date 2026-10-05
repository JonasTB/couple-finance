import type { DashboardView, HouseholdMemberView, SettlementInput } from '@couple-finance/shared';
import { type SyntheticEvent, useState } from 'react';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { formatDate } from '@/shared/lib/dates';
import { centsToInput, formatCents, parseMoneyInput } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { useSettlementMutations, useSettlements } from './dashboard-api';
import { balanceText, personName } from './people';

interface BalanceCardProps {
  householdId: string;
  dashboard: DashboardView;
  names: ReadonlyMap<string, string>;
  activeMembers: HouseholdMemberView[];
  /** Default date for a new settlement (today if it falls in the month, else its last day). */
  defaultDate: string;
}

interface Draft {
  fromMemberId: string;
  toMemberId: string;
  amount: string;
  date: string;
  notes: string;
}

/**
 * Contribution balance for the month and since the start (FR-DASH-04) plus settlements
 * (FR-DASH-06). A settlement only records a transfer made outside the app.
 */
export function BalanceCard({
  householdId,
  dashboard,
  names,
  activeMembers,
  defaultDate,
}: BalanceCardProps) {
  const { currency, members, settlementSuggestion: suggestion } = dashboard;
  const settlements = useSettlements(householdId, { from: dashboard.from, to: dashboard.to });
  const mutations = useSettlementMutations(householdId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string>();
  const [deletedId, setDeletedId] = useState<string | null>(null);
  const nameOf = (memberId: string) => names.get(memberId) ?? 'Ex-membro';

  const startDraft = (prefill: Partial<SettlementInput> = {}) => {
    setError(undefined);
    setDraft({
      fromMemberId: prefill.fromMemberId ?? activeMembers[0]?.id ?? '',
      toMemberId: prefill.toMemberId ?? activeMembers[1]?.id ?? '',
      amount: prefill.amountCents ? centsToInput(prefill.amountCents) : '',
      date: defaultDate,
      notes: '',
    });
  };

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!draft) return;
    const amountCents = parseMoneyInput(draft.amount);
    if (!amountCents) {
      setError('Informe um valor válido, por exemplo 350,00.');
      return;
    }
    if (draft.fromMemberId === draft.toMemberId) {
      setError('Escolha pessoas diferentes para quem transferiu e quem recebeu.');
      return;
    }
    try {
      await mutations.create.mutateAsync({
        fromMemberId: draft.fromMemberId,
        toMemberId: draft.toMemberId,
        amountCents,
        date: draft.date,
        notes: draft.notes.trim() || null,
      });
      setDraft(null);
    } catch (failure) {
      setError(errorMessage(failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR'));
    }
  };

  const remove = async (id: string) => {
    await mutations.remove.mutateAsync(id);
    setDeletedId(id);
  };

  // Candidates include a former member referenced by the suggestion (settling after leaving).
  const options = [
    ...activeMembers.map((member) => ({ id: member.id, name: member.displayName })),
    ...[suggestion?.fromMemberId, suggestion?.toMemberId]
      .filter((id): id is string => Boolean(id) && !activeMembers.some((m) => m.id === id))
      .map((id) => ({ id, name: nameOf(id) })),
  ];

  return (
    <Card
      title="Saldo de contribuição"
      description="O que cada pessoa pagou menos a parte dela nas despesas (inclusive as individuais), considerando os acertos registrados."
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        {members.map((member) => (
          <div key={member.memberId} className="rounded-lg border border-border p-3">
            <dt className="font-medium">{personName(names, member)}</dt>
            <dd className="text-sm">
              Neste mês: {balanceText(member.periodBalanceCents, currency)}
            </dd>
            <dd className="text-sm text-muted-foreground">
              Desde o início: {balanceText(member.cumulativeBalanceCents, currency)}
            </dd>
          </div>
        ))}
      </dl>

      {suggestion ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/60 p-3">
          <p>
            Para equilibrar o acumulado, {nameOf(suggestion.fromMemberId)} pode transferir{' '}
            <strong>{formatCents(suggestion.amountCents, currency)}</strong> para{' '}
            {nameOf(suggestion.toMemberId)}.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              startDraft(suggestion);
            }}
          >
            Registrar acerto
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">O acumulado está equilibrado.</p>
      )}

      <section aria-label="Acertos do mês" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Acertos do mês</h3>
          {!draft && activeMembers.length > 1 && (
            <Button
              variant="ghost"
              onClick={() => {
                startDraft();
              }}
            >
              Novo acerto
            </Button>
          )}
        </div>
        {deletedId && (
          <div
            role="status"
            className="flex items-center justify-between gap-2 rounded-lg border border-border p-3"
          >
            <span>Acerto excluído.</span>
            <Button
              variant="outline"
              onClick={() => {
                mutations.restore.mutate(deletedId);
                setDeletedId(null);
              }}
            >
              Desfazer
            </Button>
          </div>
        )}
        {settlements.data?.length === 0 && !draft && (
          <p className="text-sm text-muted-foreground">Nenhum acerto registrado neste mês.</p>
        )}
        <ul className="divide-y divide-border">
          {settlements.data?.map((settlement) => (
            <li key={settlement.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block">
                  {nameOf(settlement.fromMemberId)} → {nameOf(settlement.toMemberId)}:{' '}
                  <span className="tabular-nums">
                    {formatCents(settlement.amountCents, currency)}
                  </span>
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  {formatDate(settlement.date, 'short')}
                  {settlement.notes ? ` · ${settlement.notes}` : ''}
                </span>
              </span>
              <Button
                variant="ghost"
                aria-label={`Excluir acerto de ${formatCents(settlement.amountCents, currency)}`}
                disabled={mutations.remove.isPending}
                onClick={() => void remove(settlement.id)}
              >
                Excluir
              </Button>
            </li>
          ))}
        </ul>

        {draft && (
          <form
            aria-label="Registrar acerto"
            className="space-y-3 rounded-lg border border-border p-3"
            onSubmit={(event) => void submit(event)}
          >
            <p className="text-sm text-muted-foreground">
              Registre uma transferência feita fora do app. Ela ajusta só o saldo, não entra como
              gasto.
            </p>
            <FormAlert message={error} />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Quem transferiu">
                <Select
                  value={draft.fromMemberId}
                  onChange={(event) => {
                    setDraft({ ...draft, fromMemberId: event.target.value });
                  }}
                >
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Quem recebeu">
                <Select
                  value={draft.toMemberId}
                  onChange={(event) => {
                    setDraft({ ...draft, toMemberId: event.target.value });
                  }}
                >
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Valor">
                <Input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={draft.amount}
                  onChange={(event) => {
                    setDraft({ ...draft, amount: event.target.value });
                  }}
                />
              </FormField>
              <FormField label="Data">
                <Input
                  type="date"
                  required
                  value={draft.date}
                  onChange={(event) => {
                    setDraft({ ...draft, date: event.target.value });
                  }}
                />
              </FormField>
            </div>
            <FormField label="Observação (opcional)">
              <Input
                maxLength={200}
                value={draft.notes}
                onChange={(event) => {
                  setDraft({ ...draft, notes: event.target.value });
                }}
              />
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" disabled={mutations.create.isPending}>
                {mutations.create.isPending ? 'Salvando…' : 'Salvar acerto'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </section>
    </Card>
  );
}
