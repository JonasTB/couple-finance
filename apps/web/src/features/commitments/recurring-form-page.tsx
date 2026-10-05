import {
  type CategoryView,
  type CurrencyCode,
  type HouseholdMemberView,
  PAYMENT_METHODS,
  type PaymentMethod,
  RECURRENCE_FREQUENCIES,
  type RecurrenceFrequency,
  type RecurringAmountType,
  type RecurringExpenseInput,
  type RecurringExpenseView,
} from '@couple-finance/shared';
import { type SyntheticEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useHousehold, useMembers } from '@/features/households/households-api';
import { CategorySelect } from '@/features/ledger/category-select';
import { PAYMENT_METHOD_LABELS, SPLIT_TYPE_LABELS } from '@/features/ledger/labels';
import { useCategories } from '@/features/ledger/ledger-api';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { formatDate, todayIn } from '@/shared/lib/dates';
import { centsToInput, parseMoneyInput } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { useRecurringExpense, useRecurringMutations } from './commitments-api';
import { RECURRING_STATUS_LABELS, scheduleText } from './labels';
import { SplitField } from './split-field';
import { splitInputOf, type TemplateSplitValue, splitValueOf } from './split-rule';

const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
};

interface Draft {
  description: string;
  amount: string;
  amountType: RecurringAmountType;
  frequency: RecurrenceFrequency;
  interval: string;
  startDate: string;
  endDate: string;
  categoryId: string;
  payerMemberId: string;
  paymentMethod: PaymentMethod;
  split: TemplateSplitValue;
  notes: string;
}

function draftOf(existing: RecurringExpenseView | undefined, today: string, me: string): Draft {
  return {
    description: existing?.description ?? '',
    amount: existing ? centsToInput(existing.expectedAmountCents) : '',
    amountType: existing?.amountType ?? 'FIXED',
    frequency: existing?.frequency ?? 'MONTHLY',
    interval: String(existing?.interval ?? 1),
    startDate: existing?.startDate ?? today,
    endDate: existing?.endDate ?? '',
    categoryId: existing?.categoryId ?? '',
    payerMemberId: existing?.payerMemberId ?? me,
    paymentMethod: existing?.paymentMethod ?? 'BOLETO',
    split: splitValueOf(existing?.split, me),
    notes: existing?.notes ?? '',
  };
}

/** Create (`compromissos/recorrentes/nova`) and edit a recurring expense (FR-REC-01/04). */
export function RecurringFormPage() {
  const { householdId = '', recurringId } = useParams();
  const household = useHousehold(householdId);
  const members = useMembers(householdId);
  const categories = useCategories(householdId);
  const existing = useRecurringExpense(householdId, recurringId);

  if (existing.isError) {
    return <FormAlert message="Não encontramos esta despesa recorrente." />;
  }
  if (!household.data || !members.data || !categories.data || (recurringId && !existing.data)) {
    return (
      <p role="status" className="py-12 text-center text-muted-foreground">
        Carregando…
      </p>
    );
  }
  return (
    <RecurringForm
      key={existing.data ? `${existing.data.id}-${String(existing.data.version)}` : 'new'}
      householdId={householdId}
      currency={household.data.currency}
      today={todayIn(household.data.timezone)}
      myMemberId={household.data.me.memberId}
      defaultSplitLabel={SPLIT_TYPE_LABELS[household.data.defaultSplit.type]}
      members={members.data}
      categories={categories.data}
      existing={existing.data}
    />
  );
}

interface RecurringFormProps {
  householdId: string;
  currency: CurrencyCode;
  today: string;
  myMemberId: string;
  defaultSplitLabel: string;
  members: HouseholdMemberView[];
  categories: CategoryView[];
  existing: RecurringExpenseView | undefined;
}

function RecurringForm({
  householdId,
  today,
  myMemberId,
  defaultSplitLabel,
  members,
  categories,
  existing,
}: RecurringFormProps) {
  const navigate = useNavigate();
  const mutations = useRecurringMutations(householdId);
  const [draft, setDraft] = useState(() => draftOf(existing, today, myMemberId));
  const [error, setError] = useState<string>();
  const [endDate, setEndDate] = useState(today);
  const locked = existing?.scheduleLocked ?? false;
  const back = `/casas/${householdId}/compromissos`;
  const set = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const run = async (action: () => Promise<unknown>, after?: () => Promise<void> | void) => {
    setError(undefined);
    try {
      await action();
      await after?.();
    } catch (failure) {
      setError(errorMessage(failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR'));
    }
  };

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const amountCents = parseMoneyInput(draft.amount);
    const interval = Number(draft.interval);
    const problem = !draft.description.trim()
      ? 'Descreva a despesa.'
      : !amountCents
        ? 'Informe o valor esperado (ex.: 120,00).'
        : !Number.isInteger(interval) || interval < 1 || interval > 12
          ? 'O intervalo vai de 1 a 12.'
          : !draft.categoryId
            ? 'Escolha a categoria.'
            : draft.endDate && draft.endDate < draft.startDate
              ? 'A data final precisa ser igual ou posterior ao primeiro vencimento.'
              : null;
    if (problem || !amountCents) {
      setError(problem ?? undefined);
      return;
    }
    const split = splitInputOf(draft.split);
    const input: RecurringExpenseInput = {
      description: draft.description.trim(),
      expectedAmountCents: amountCents,
      amountType: draft.amountType,
      frequency: draft.frequency,
      interval,
      startDate: draft.startDate,
      endDate: draft.endDate || null,
      categoryId: draft.categoryId,
      payerMemberId: draft.payerMemberId,
      paymentMethod: draft.paymentMethod,
      notes: draft.notes.trim() || null,
      ...(split !== undefined ? { split } : {}),
    };
    await run(
      () =>
        existing
          ? mutations.update.mutateAsync({
              id: existing.id,
              version: existing.version,
              ...input,
              // Locked schedules are not sent, so they cannot conflict.
              ...(locked
                ? {
                    frequency: existing.frequency,
                    interval: existing.interval,
                    startDate: existing.startDate,
                  }
                : {}),
            })
          : mutations.create.mutateAsync(input),
      () => navigate(back, { replace: true }),
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">
        {existing ? 'Editar despesa recorrente' : 'Nova despesa recorrente'}
      </h2>
      {existing && (
        <Card
          title={`${RECURRING_STATUS_LABELS[existing.status]} · ${scheduleText(existing.frequency, existing.interval, existing.startDate)}`}
          description={
            existing.nextOccurrenceDate
              ? `Próxima ocorrência: ${formatDate(existing.nextOccurrenceDate)}`
              : 'Nenhuma ocorrência prevista.'
          }
        >
          <div className="flex flex-wrap gap-2">
            {existing.status === 'ACTIVE' && (
              <Button
                variant="outline"
                onClick={() => void run(() => mutations.pause.mutateAsync(existing.id))}
              >
                Pausar
              </Button>
            )}
            {existing.status === 'PAUSED' && (
              <Button
                variant="outline"
                onClick={() => void run(() => mutations.resume.mutateAsync(existing.id))}
              >
                Retomar
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                if (
                  window.confirm(
                    'Excluir esta despesa recorrente? As despesas já registradas continuam.',
                  )
                ) {
                  void run(
                    () => mutations.remove.mutateAsync(existing.id),
                    () =>
                      navigate(back, { replace: true, state: { deletedRecurringId: existing.id } }),
                  );
                }
              }}
            >
              Excluir
            </Button>
          </div>
          {existing.status !== 'ENDED' && (
            <form
              aria-label="Encerrar despesa recorrente"
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => mutations.end.mutateAsync({ id: existing.id, lastDate: endDate }));
              }}
            >
              <FormField label="Última ocorrência até">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                  }}
                />
              </FormField>
              <Button type="submit" variant="outline">
                Encerrar
              </Button>
            </form>
          )}
        </Card>
      )}

      <form className="space-y-4" onSubmit={(event) => void submit(event)} noValidate>
        <FormAlert message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Descrição">
            <Input
              maxLength={120}
              value={draft.description}
              onChange={(event) => {
                set({ description: event.target.value });
              }}
            />
          </FormField>
          <FormField
            label="Valor esperado"
            hint={
              draft.amountType === 'VARIABLE' ? 'Você confirma o valor real a cada vez.' : undefined
            }
          >
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={draft.amount}
              onChange={(event) => {
                set({ amount: event.target.value });
              }}
            />
          </FormField>
          <FormField label="Tipo de valor">
            <Select
              value={draft.amountType}
              onChange={(event) => {
                set({ amountType: event.target.value as RecurringAmountType });
              }}
            >
              <option value="FIXED">Fixo (ex.: aluguel, streaming)</option>
              <option value="VARIABLE">Variável (ex.: energia, água)</option>
            </Select>
          </FormField>
          <FormField label="Categoria">
            <CategorySelect
              categories={categories}
              value={draft.categoryId}
              onChange={(event) => {
                set({ categoryId: event.target.value });
              }}
            />
          </FormField>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-border p-3" disabled={locked}>
          <legend className="px-1 text-sm font-medium">Quando se repete</legend>
          {locked && (
            <p className="text-sm text-muted-foreground">
              Já há ocorrências registradas: para mudar a frequência ou a data, encerre esta e crie
              outra.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Frequência">
              <Select
                value={draft.frequency}
                onChange={(event) => {
                  set({ frequency: event.target.value as RecurrenceFrequency });
                }}
              >
                {RECURRENCE_FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {FREQUENCY_LABELS[frequency]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="A cada">
              <Input
                type="number"
                min={1}
                max={12}
                value={draft.interval}
                onChange={(event) => {
                  set({ interval: event.target.value });
                }}
              />
            </FormField>
            <FormField label="Primeiro vencimento" hint="Define o dia das próximas.">
              <Input
                type="date"
                value={draft.startDate}
                onChange={(event) => {
                  set({ startDate: event.target.value });
                }}
              />
            </FormField>
          </div>
        </fieldset>
        <FormField label="Termina em (opcional)">
          <Input
            type="date"
            value={draft.endDate}
            onChange={(event) => {
              set({ endDate: event.target.value });
            }}
          />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Quem costuma pagar">
            <Select
              value={draft.payerMemberId}
              onChange={(event) => {
                set({ payerMemberId: event.target.value });
              }}
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Forma de pagamento">
            <Select
              value={draft.paymentMethod}
              onChange={(event) => {
                set({ paymentMethod: event.target.value as PaymentMethod });
              }}
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <SplitField
          value={draft.split}
          onChange={(split) => {
            set({ split });
          }}
          members={members}
          defaultLabel={defaultSplitLabel}
          canKeep={draft.split.mode === 'KEEP'}
        />
        <FormField label="Observações (opcional)">
          <Input
            maxLength={500}
            value={draft.notes}
            onChange={(event) => {
              set({ notes: event.target.value });
            }}
          />
        </FormField>
        <div className="flex gap-2">
          <Button type="submit" disabled={mutations.create.isPending || mutations.update.isPending}>
            Salvar
          </Button>
          <Button type="button" variant="ghost" onClick={() => void navigate(back)}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
