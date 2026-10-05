import type {
  CurrencyCode,
  GoalEntryType,
  GoalView,
  HouseholdMemberView,
} from '@couple-finance/shared';
import { type SyntheticEvent, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useHousehold, useMembers } from '@/features/households/households-api';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { formatDate, todayIn } from '@/shared/lib/dates';
import { centsToInput, formatBps, formatCents, parseMoneyInput } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { forecastLines } from './labels';
import { useGoal, useGoalMutations } from './planning-api';
import { ProgressBar } from './progress-bar';

/** One goal (FR-GOAL-01..03): progress, forecast, per-member totals and the entries log. */
export function GoalPage() {
  const { householdId = '', goalId = '' } = useParams();
  const household = useHousehold(householdId);
  const members = useMembers(householdId);
  const goal = useGoal(householdId, goalId);

  if (goal.isError) {
    return <FormAlert message="Não encontramos esta meta." />;
  }
  if (!goal.data || !household.data || !members.data) {
    return (
      <p role="status" className="py-12 text-center text-muted-foreground">
        Carregando…
      </p>
    );
  }
  return (
    <GoalDetail
      key={`${goal.data.id}-${String(goal.data.version)}`}
      householdId={householdId}
      goal={goal.data}
      members={members.data}
      currency={household.data.currency}
      today={todayIn(household.data.timezone)}
    />
  );
}

function GoalDetail({
  householdId,
  goal,
  members,
  currency,
  today,
}: {
  householdId: string;
  goal: GoalView;
  members: HouseholdMemberView[];
  currency: CurrencyCode;
  today: string;
}) {
  const mutations = useGoalMutations(householdId);
  const names = new Map(members.map((m) => [m.id, m.displayName]));
  const nameOf = (id: string) => names.get(id) ?? 'Ex-membro';
  const money = (cents: number) => formatCents(cents, currency);
  const archived = goal.status === 'ARCHIVED';
  const participants = goal.participantMemberIds.filter((id) => names.has(id));

  const [type, setType] = useState<GoalEntryType>('CONTRIBUTION');
  const [memberId, setMemberId] = useState(participants[0] ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string>();
  const [removedId, setRemovedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: goal.name,
    target: centsToInput(goal.targetAmountCents),
    deadline: goal.targetDate ?? '',
  });

  const run = async (action: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await action();
      return true;
    } catch (failure) {
      setError(errorMessage(failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR'));
      return false;
    }
  };

  const addEntry = async (event: SyntheticEvent) => {
    event.preventDefault();
    const amountCents = parseMoneyInput(amount);
    if (!amountCents) {
      setError('Informe o valor (ex.: 500,00).');
      return;
    }
    if (
      await run(() =>
        mutations.addEntry.mutateAsync({ id: goal.id, memberId, type, amountCents, date }),
      )
    ) {
      setAmount('');
    }
  };

  const saveGoal = async (event: SyntheticEvent) => {
    event.preventDefault();
    const targetAmountCents = parseMoneyInput(draft.target);
    if (!draft.name.trim() || !targetAmountCents) {
      setError('Informe o nome e o valor da meta.');
      return;
    }
    if (
      await run(() =>
        mutations.update.mutateAsync({
          id: goal.id,
          version: goal.version,
          name: draft.name.trim(),
          targetAmountCents,
          targetDate: draft.deadline || null,
        }),
      )
    ) {
      setEditing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Link
        to=".."
        relative="path"
        className="inline-flex min-h-11 items-center text-sm text-primary hover:underline"
      >
        ‹ Metas
      </Link>
      <Card title={goal.name} description={archived ? 'Arquivada' : undefined}>
        <p className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold tabular-nums">{money(goal.savedCents)}</span>
          <span className="text-sm text-muted-foreground">
            de {money(goal.targetAmountCents)} · {formatBps(goal.progressBps)}
          </span>
        </p>
        <ProgressBar bps={goal.progressBps} label={`Progresso: ${formatBps(goal.progressBps)}`} />
        <ul className="space-y-1 text-sm">
          {forecastLines(goal, currency).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {goal.byMember.map((entry) => (
            <div key={entry.memberId}>
              <dt className="text-muted-foreground">{nameOf(entry.memberId)} guardou</dt>
              <dd className="font-medium tabular-nums">{money(entry.savedCents)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <FormAlert message={error} />

      {!archived && (
        <Card title="Registrar movimento">
          <form
            aria-label="Registrar movimento"
            className="space-y-3"
            onSubmit={(event) => void addEntry(event)}
            noValidate
          >
            <div className="grid gap-3 sm:grid-cols-4">
              <FormField label="Tipo">
                <Select
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value as GoalEntryType);
                  }}
                >
                  <option value="CONTRIBUTION">Aporte</option>
                  <option value="WITHDRAWAL">Retirada</option>
                </Select>
              </FormField>
              <FormField label="Quem">
                <Select
                  value={memberId}
                  onChange={(event) => {
                    setMemberId(event.target.value);
                  }}
                >
                  {participants.map((id) => (
                    <option key={id} value={id}>
                      {nameOf(id)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Valor">
                <Input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                  }}
                />
              </FormField>
              <FormField label="Data">
                <Input
                  type="date"
                  max={today}
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                  }}
                />
              </FormField>
            </div>
            <Button type="submit" disabled={mutations.addEntry.isPending}>
              Registrar
            </Button>
          </form>
        </Card>
      )}

      <Card title="Histórico">
        {removedId && (
          <div
            role="status"
            className="flex items-center justify-between gap-2 rounded-lg border border-border p-3"
          >
            <span>Movimento excluído.</span>
            <Button
              variant="outline"
              onClick={() => {
                void run(() =>
                  mutations.restoreEntry.mutateAsync({ id: goal.id, entryId: removedId }),
                );
                setRemovedId(null);
              }}
            >
              Desfazer
            </Button>
          </div>
        )}
        {(goal.entries ?? []).filter((e) => !e.deletedAt).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum movimento ainda.</p>
        )}
        <ul className="divide-y divide-border" aria-label="Movimentos">
          {(goal.entries ?? [])
            .filter((entry) => !entry.deletedAt)
            .map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block">
                    {entry.type === 'CONTRIBUTION' ? 'Aporte' : 'Retirada'} de{' '}
                    {nameOf(entry.memberId)}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {formatDate(entry.date, 'short')}
                    {entry.notes ? ` · ${entry.notes}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="tabular-nums">
                    {entry.type === 'CONTRIBUTION' ? '+' : '−'}
                    {money(entry.amountCents)}
                  </span>
                  {!archived && (
                    <Button
                      variant="ghost"
                      aria-label={`Excluir movimento de ${money(entry.amountCents)}`}
                      onClick={() => {
                        void run(() =>
                          mutations.removeEntry.mutateAsync({ id: goal.id, entryId: entry.id }),
                        ).then((ok) => {
                          if (ok) setRemovedId(entry.id);
                        });
                      }}
                    >
                      Excluir
                    </Button>
                  )}
                </span>
              </li>
            ))}
        </ul>
      </Card>

      {editing ? (
        <form
          aria-label="Editar meta"
          className="space-y-3 rounded-lg border border-border p-3"
          onSubmit={(event) => void saveGoal(event)}
          noValidate
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Nome da meta">
              <Input
                maxLength={60}
                value={draft.name}
                onChange={(event) => {
                  setDraft({ ...draft, name: event.target.value });
                }}
              />
            </FormField>
            <FormField label="Valor da meta">
              <Input
                inputMode="decimal"
                value={draft.target}
                onChange={(event) => {
                  setDraft({ ...draft, target: event.target.value });
                }}
              />
            </FormField>
            <FormField label="Prazo (opcional)">
              <Input
                type="date"
                value={draft.deadline}
                onChange={(event) => {
                  setDraft({ ...draft, deadline: event.target.value });
                }}
              />
            </FormField>
          </div>
          <div className="flex gap-2">
            <Button type="submit">Salvar</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {!archived && (
            <Button
              variant="outline"
              onClick={() => {
                setEditing(true);
              }}
            >
              Editar meta
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() =>
              void run(() =>
                mutations.setArchived.mutateAsync({ id: goal.id, archived: !archived }),
              )
            }
          >
            {archived ? 'Restaurar meta' : 'Arquivar meta'}
          </Button>
        </div>
      )}
    </div>
  );
}
