import type { HouseholdMemberView } from '@couple-finance/shared';
import { type SyntheticEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useHousehold, useMembers } from '@/features/households/households-api';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { formatBps, formatCents, parseMoneyInput } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { forecastLines } from './labels';
import { ProgressBar } from './progress-bar';
import {
  useGoalMutations,
  useGoals,
  usePurchasePlanMutations,
  usePurchasePlans,
} from './planning-api';

function NewGoalForm({
  householdId,
  members,
  onDone,
}: {
  householdId: string;
  members: HouseholdMemberView[];
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const mutations = useGoalMutations(householdId);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [participants, setParticipants] = useState(() => members.map((m) => m.id));
  const [error, setError] = useState<string>();

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const targetAmountCents = parseMoneyInput(target);
    const problem = !name.trim()
      ? 'Dê um nome para a meta.'
      : !targetAmountCents
        ? 'Informe o valor da meta (ex.: 12.000,00).'
        : participants.length === 0
          ? 'Escolha quem participa.'
          : null;
    if (problem || !targetAmountCents) {
      setError(problem ?? undefined);
      return;
    }
    try {
      const goal = await mutations.create.mutateAsync({
        name: name.trim(),
        targetAmountCents,
        targetDate: deadline || null,
        participantMemberIds: participants,
      });
      onDone();
      await navigate(goal.id);
    } catch (failure) {
      setError(errorMessage(failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR'));
    }
  };

  return (
    <form
      aria-label="Nova meta"
      className="space-y-3 rounded-lg border border-border p-3"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <FormAlert message={error} />
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Nome da meta">
          <Input
            maxLength={60}
            placeholder="Ex.: Reserva de emergência"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </FormField>
        <FormField label="Valor da meta">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={target}
            onChange={(event) => {
              setTarget(event.target.value);
            }}
          />
        </FormField>
        <FormField label="Prazo (opcional)">
          <Input
            type="date"
            value={deadline}
            onChange={(event) => {
              setDeadline(event.target.value);
            }}
          />
        </FormField>
      </div>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-sm font-medium">Quem participa</legend>
        {members.map((member) => (
          <label key={member.id} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={participants.includes(member.id)}
              onChange={(event) => {
                setParticipants((current) =>
                  event.target.checked
                    ? [...current, member.id]
                    : current.filter((id) => id !== member.id),
                );
              }}
            />
            {member.displayName}
          </label>
        ))}
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" disabled={mutations.create.isPending}>
          Criar meta
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function NewPlanForm({ householdId, onDone }: { householdId: string; onDone: () => void }) {
  const navigate = useNavigate();
  const goals = useGoals(householdId);
  const mutations = usePurchasePlanMutations(householdId);
  const [name, setName] = useState('');
  const [goalId, setGoalId] = useState('');
  const [error, setError] = useState<string>();

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Dê um nome para o plano.');
      return;
    }
    try {
      const plan = await mutations.create.mutateAsync({
        name: name.trim(),
        goalId: goalId || null,
      });
      onDone();
      await navigate(`planos/${plan.id}`);
    } catch (failure) {
      setError(errorMessage(failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR'));
    }
  };

  return (
    <form
      aria-label="Novo plano de compras"
      className="space-y-3 rounded-lg border border-border p-3"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <FormAlert message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Nome do plano">
          <Input
            maxLength={60}
            placeholder="Ex.: Casita"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </FormField>
        <FormField label="Meta que financia (opcional)">
          <Select
            value={goalId}
            onChange={(event) => {
              setGoalId(event.target.value);
            }}
          >
            <option value="">Nenhuma</option>
            {(goals.data ?? [])
              .filter((goal) => goal.status !== 'ARCHIVED')
              .map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.name}
                </option>
              ))}
          </Select>
        </FormField>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={mutations.create.isPending}>
          Criar plano
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Goals and purchase plans (FR-GOAL, FR-PP). Every number comes from the API. */
export function PlanningPage() {
  const { householdId = '' } = useParams();
  const household = useHousehold(householdId);
  const members = useMembers(householdId);
  const goals = useGoals(householdId);
  const plans = usePurchasePlans(householdId);
  const [creating, setCreating] = useState<'goal' | 'plan' | null>(null);
  const currency = household.data?.currency ?? 'BRL';
  const loadError = goals.error ?? plans.error;
  const visibleGoals = (goals.data ?? []).filter((g) => g.status !== 'ARCHIVED');
  const visiblePlans = (plans.data ?? []).filter((p) => p.status !== 'ARCHIVED');
  const archivedGoals = (goals.data ?? []).filter((g) => g.status === 'ARCHIVED');
  const archivedPlans = (plans.data ?? []).filter((p) => p.status === 'ARCHIVED');

  return (
    <div className="space-y-4">
      {loadError && (
        <FormAlert
          message={errorMessage(loadError instanceof ApiError ? loadError.code : 'INTERNAL_ERROR')}
        />
      )}
      <Card
        aria-label="Metas"
        title="Metas"
        description="Registro do que vocês estão guardando. O app não movimenta dinheiro."
      >
        {goals.isSuccess && visibleGoals.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Crie uma meta, como uma reserva de emergência ou uma viagem.
          </p>
        )}
        <ul className="divide-y divide-border">
          {visibleGoals.map((goal) => (
            <li key={goal.id}>
              <Link to={goal.id} className="block space-y-1.5 py-3">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{goal.name}</span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {formatCents(goal.savedCents, currency)} de{' '}
                    {formatCents(goal.targetAmountCents, currency)}
                  </span>
                </span>
                <ProgressBar
                  bps={goal.progressBps}
                  label={`${goal.name}: ${formatBps(goal.progressBps)}`}
                />
                <span className="block text-sm text-muted-foreground">
                  {forecastLines(goal, currency)[0]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {creating === 'goal' && members.data ? (
          <NewGoalForm
            householdId={householdId}
            members={members.data}
            onDone={() => {
              setCreating(null);
            }}
          />
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setCreating('goal');
            }}
          >
            Nova meta
          </Button>
        )}
      </Card>

      <Card
        aria-label="Planos de compras"
        title="Planos de compras"
        description="Listas de itens para um projeto, como montar a casa, com estimativa e valor pago."
      >
        {plans.isSuccess && visiblePlans.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Crie um plano e adicione o que vocês pretendem comprar.
          </p>
        )}
        <ul className="divide-y divide-border">
          {visiblePlans.map((plan) => {
            const total = plan.totals.pendingCount + plan.totals.purchasedCount;
            return (
              <li key={plan.id}>
                <Link to={`planos/${plan.id}`} className="block space-y-1.5 py-3">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">{plan.name}</span>
                    <span className="shrink-0 text-sm tabular-nums">
                      falta {formatCents(plan.totals.remainingNeedCents, currency)}
                    </span>
                  </span>
                  <ProgressBar
                    bps={total > 0 ? Math.floor((plan.totals.purchasedCount * 10000) / total) : 0}
                    label={`${String(plan.totals.purchasedCount)} de ${String(total)} itens comprados`}
                  />
                  <span className="block text-sm text-muted-foreground">
                    {plan.totals.purchasedCount} de {total} itens comprados
                    {plan.status === 'COMPLETED' && ' · concluído'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {creating === 'plan' ? (
          <NewPlanForm
            householdId={householdId}
            onDone={() => {
              setCreating(null);
            }}
          />
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setCreating('plan');
            }}
          >
            Novo plano de compras
          </Button>
        )}
      </Card>

      {archivedGoals.length + archivedPlans.length > 0 && (
        <details className="rounded-lg border border-border bg-card p-4">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">
            Arquivados ({archivedGoals.length + archivedPlans.length})
          </summary>
          <ul className="divide-y divide-border">
            {archivedGoals.map((goal) => (
              <li key={goal.id}>
                <Link to={goal.id} className="block py-2 hover:underline">
                  Meta: {goal.name}
                </Link>
              </li>
            ))}
            {archivedPlans.map((plan) => (
              <li key={plan.id}>
                <Link to={`planos/${plan.id}`} className="block py-2 hover:underline">
                  Plano: {plan.name}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
