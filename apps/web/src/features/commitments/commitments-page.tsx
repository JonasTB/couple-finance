import type {
  CurrencyCode,
  HouseholdMemberView,
  InstallmentSummary,
  OccurrenceView,
} from '@couple-finance/shared';
import { type SyntheticEvent, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useHousehold, useMembers } from '@/features/households/households-api';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import {
  addMonths,
  capitalizeFirst,
  formatDate,
  formatMonth,
  monthOf,
  monthRange,
  todayIn,
} from '@/shared/lib/dates';
import { centsToInput, formatCents, parseMoneyInput } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import {
  useInstallmentMutations,
  useInstallmentPlans,
  useInstallmentSummary,
  useOccurrences,
  useRecurringExpenses,
  useRecurringMutations,
} from './commitments-api';
import { PLAN_STATUS_LABELS, RECURRING_STATUS_LABELS, scheduleText } from './labels';

/** Overdue occurrences are looked up a year back; upcoming ones until the end of next month. */
const LOOKBACK_MONTHS = 12;

function OccurrenceRow({
  householdId,
  occurrence,
  members,
  payerMemberId,
  currency,
}: {
  householdId: string;
  occurrence: OccurrenceView;
  members: HouseholdMemberView[];
  payerMemberId: string;
  currency: CurrencyCode;
}) {
  const mutations = useRecurringMutations(householdId);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(centsToInput(occurrence.expectedAmountCents));
  const [date, setDate] = useState(occurrence.occurrenceDate);
  const [payer, setPayer] = useState('');
  // The template's payer may arrive after the first render; an explicit choice wins.
  const effectivePayer = payer || payerMemberId || members[0]?.id || '';
  const [error, setError] = useState<string>();
  const key = { id: occurrence.recurringExpenseId, occurrenceDate: occurrence.occurrenceDate };

  const confirm = async (event: SyntheticEvent) => {
    event.preventDefault();
    const amountCents = parseMoneyInput(amount);
    if (!amountCents) {
      setError('Informe o valor pago (ex.: 120,00).');
      return;
    }
    setError(undefined);
    try {
      await mutations.confirm.mutateAsync({
        ...key,
        amountCents,
        date,
        payerMemberId: effectivePayer,
      });
    } catch (failure) {
      setError(errorMessage(failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR'));
    }
  };

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-medium">{occurrence.description}</span>
          <span className="block text-sm text-muted-foreground">
            {capitalizeFirst(formatDate(occurrence.occurrenceDate))} ·{' '}
            {occurrence.amountType === 'VARIABLE' ? 'cerca de ' : ''}
            {formatCents(occurrence.expectedAmountCents, currency)}
          </span>
        </span>
        {!open && (
          <span className="flex gap-1">
            <Button
              variant="outline"
              aria-label={`Registrar ${occurrence.description} de ${formatDate(occurrence.occurrenceDate, 'short')}`}
              onClick={() => {
                setOpen(true);
              }}
            >
              Registrar
            </Button>
            <Button
              variant="ghost"
              aria-label={`Pular ${occurrence.description} de ${formatDate(occurrence.occurrenceDate, 'short')}`}
              disabled={mutations.skip.isPending}
              onClick={() => {
                mutations.skip.mutate(key);
              }}
            >
              Pular
            </Button>
          </span>
        )}
      </div>
      {open && (
        <form
          aria-label={`Registrar ${occurrence.description}`}
          className="space-y-3 rounded-lg border border-border p-3"
          onSubmit={(event) => void confirm(event)}
        >
          <FormAlert message={error} />
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Valor pago">
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                }}
              />
            </FormField>
            <FormField label="Data do pagamento">
              <Input
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                }}
              />
            </FormField>
            <FormField label="Quem pagou">
              <Select
                value={effectivePayer}
                onChange={(event) => {
                  setPayer(event.target.value);
                }}
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={mutations.confirm.isPending}>
              Confirmar despesa
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

/** Installment load per month (single series: one hue, direct labels, scaled to the largest). */
function CommitmentChart({
  summary,
  currency,
}: {
  summary: InstallmentSummary;
  currency: CurrencyCode;
}) {
  const largest = Math.max(...summary.months.map((m) => m.installmentsCents));
  if (largest === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma parcela nos próximos 12 meses.</p>;
  }
  return (
    <ul className="space-y-1.5" aria-label="Parcelas por mês">
      {summary.months.map((month) => (
        <li key={month.month} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {capitalizeFirst(formatMonth(month.month).replace(' de ', '/'))}
          </span>
          <span aria-hidden="true" className="h-2.5 rounded-sm bg-muted">
            <span
              className="block h-full rounded-r bg-primary"
              style={{ width: `${String((month.installmentsCents / largest) * 100)}%` }}
            />
          </span>
          <span className="text-sm tabular-nums">
            {formatCents(month.installmentsCents, currency)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Upcoming and overdue commitments (FR-REC-05, FR-INST-03). */
export function CommitmentsPage() {
  const { householdId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const household = useHousehold(householdId);
  const members = useMembers(householdId);
  const today = household.data ? todayIn(household.data.timezone) : '';
  const range = today
    ? {
        from: `${addMonths(monthOf(today), -LOOKBACK_MONTHS)}-01`,
        to: monthRange(addMonths(monthOf(today), 1)).to,
      }
    : null;
  const occurrences = useOccurrences(householdId, range);
  const recurring = useRecurringExpenses(householdId);
  const plans = useInstallmentPlans(householdId);
  const summary = useInstallmentSummary(householdId);
  const recurringMutations = useRecurringMutations(householdId);
  const planMutations = useInstallmentMutations(householdId);
  const state = location.state as { deletedRecurringId?: string; deletedPlanId?: string } | null;

  const currency = household.data?.currency ?? 'BRL';
  const loadError = occurrences.error ?? recurring.error ?? plans.error ?? summary.error;
  const payerOf = new Map((recurring.data ?? []).map((r) => [r.id, r.payerMemberId]));
  const overdue = (occurrences.data ?? []).filter((o) => o.status === 'OVERDUE');
  const upcoming = (occurrences.data ?? []).filter((o) => o.status === 'UPCOMING');

  const undo = async () => {
    if (state?.deletedRecurringId) {
      await recurringMutations.restore.mutateAsync(state.deletedRecurringId);
    } else if (state?.deletedPlanId) {
      await planMutations.restore.mutateAsync(state.deletedPlanId);
    }
    await navigate('.', { replace: true, state: null });
  };

  const occurrenceList = (items: OccurrenceView[]) => (
    <ul className="divide-y divide-border">
      {items.map((occurrence) => (
        <OccurrenceRow
          key={`${occurrence.recurringExpenseId}-${occurrence.occurrenceDate}`}
          householdId={householdId}
          occurrence={occurrence}
          members={members.data ?? []}
          payerMemberId={payerOf.get(occurrence.recurringExpenseId) ?? ''}
          currency={currency}
        />
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      {(state?.deletedRecurringId ?? state?.deletedPlanId) && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
        >
          <span>
            {state.deletedPlanId ? 'Compra parcelada excluída.' : 'Despesa recorrente excluída.'}
          </span>
          <Button variant="outline" onClick={() => void undo()}>
            Desfazer
          </Button>
        </div>
      )}
      {loadError && (
        <FormAlert
          message={errorMessage(loadError instanceof ApiError ? loadError.code : 'INTERNAL_ERROR')}
        />
      )}

      {overdue.length > 0 && (
        <Card
          aria-label={`Pendentes (${String(overdue.length)})`}
          title={`Pendentes (${String(overdue.length)})`}
          description="Já venceram e ainda não foram registradas. Registre o valor pago ou pule."
        >
          {occurrenceList(overdue)}
        </Card>
      )}

      <Card
        aria-label="Próximas contas"
        title="Próximas contas"
        description="Até o fim do próximo mês. Só viram despesa quando você registra."
      >
        {occurrences.isSuccess && upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada previsto.</p>
        ) : (
          occurrenceList(upcoming)
        )}
      </Card>

      <section className="space-y-2" aria-label="Despesas recorrentes">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Despesas recorrentes</h2>
          <Button asChild variant="outline">
            <Link to="recorrentes/nova">Nova recorrente</Link>
          </Button>
        </div>
        {recurring.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Cadastre contas que se repetem, como aluguel, internet ou academia.
          </p>
        )}
        <ul className="divide-y divide-border rounded-lg border border-border bg-card px-4">
          {recurring.data?.map((item) => (
            <li key={item.id}>
              <Link
                to={`recorrentes/${item.id}`}
                className="flex items-center justify-between gap-3 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.description}</span>
                  <span className="block text-sm text-muted-foreground">
                    {scheduleText(item.frequency, item.interval, item.startDate)}
                    {item.status !== 'ACTIVE' && ` · ${RECURRING_STATUS_LABELS[item.status]}`}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatCents(item.expectedAmountCents, currency)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2" aria-label="Compras parceladas">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Compras parceladas</h2>
          <Button asChild variant="outline">
            <Link to="parcelados/novo">Nova compra parcelada</Link>
          </Button>
        </div>
        {plans.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Registre uma compra parcelada e todas as parcelas entram nas despesas de cada mês.
          </p>
        )}
        <ul className="divide-y divide-border rounded-lg border border-border bg-card px-4">
          {plans.data?.map((plan) => (
            <li key={plan.id}>
              <Link to={`parcelados/${plan.id}`} className="block space-y-1.5 py-3">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{plan.description}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatCents(plan.installmentAmountCents, currency)}/mês
                  </span>
                </span>
                <span
                  role="img"
                  aria-label={`${String(plan.paidCount)} de ${String(plan.installmentCount)} parcelas pagas`}
                  className="block h-2 rounded-sm bg-muted"
                >
                  <span
                    className="block h-full rounded-r bg-primary"
                    style={{ width: `${String((plan.paidCount / plan.installmentCount) * 100)}%` }}
                  />
                </span>
                <span className="block text-sm text-muted-foreground">
                  {plan.paidCount} de {plan.installmentCount} pagas
                  {plan.status === 'ACTIVE'
                    ? ` · falta ${formatCents(plan.remainingCents, currency)}`
                    : ` · ${PLAN_STATUS_LABELS[plan.status]}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {summary.data && (plans.data?.length ?? 0) > 0 && (
        <Card title="Parcelas nos próximos meses">
          <CommitmentChart summary={summary.data} currency={currency} />
          {summary.data.releases.length > 0 && (
            <ul className="space-y-1 text-sm" aria-label="Liberações">
              {summary.data.releases.map((release) => (
                <li key={release.month}>
                  <strong>{formatCents(release.releasedCents, currency)}/mês</strong> liberados em{' '}
                  {formatMonth(release.month)} (
                  {release.plans.map((plan) => plan.description).join(', ')})
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
