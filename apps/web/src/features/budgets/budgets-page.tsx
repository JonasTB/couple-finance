import type { BudgetStatusView, CategoryView, CurrencyCode } from '@couple-finance/shared';
import { type SyntheticEvent, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useHousehold } from '@/features/households/households-api';
import { useCategories } from '@/features/ledger/ledger-api';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { addMonths, capitalizeFirst, formatMonth } from '@/shared/lib/dates';
import { centsToInput, formatCents, parseMoneyInput } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { MonthSwitcher } from '@/shared/ui/month-switcher';
import { Select } from '@/shared/ui/select';
import { BudgetMeter } from './budget-meter';
import { useBudgetChange, useBudgetMonth } from './budgets-api';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Value of the "Total da casa" option (the API uses null). */
const TOTAL = 'TOTAL';

interface Draft {
  target: string;
  amount: string;
  fromMonth: string;
}

function BudgetForm({
  householdId,
  categories,
  months,
  initial,
  lockTarget,
  onDone,
}: {
  householdId: string;
  categories: CategoryView[];
  months: string[];
  initial: Draft;
  lockTarget: boolean;
  onDone: () => void;
}) {
  const change = useBudgetChange(householdId);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string>();

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const amountCents = parseMoneyInput(draft.amount);
    if (!draft.target) {
      setError('Escolha o total da casa ou uma categoria.');
      return;
    }
    if (!amountCents) {
      setError('Informe o valor do orçamento (ex.: 1.500,00).');
      return;
    }
    setError(undefined);
    try {
      await change.mutateAsync({
        categoryId: draft.target === TOTAL ? null : draft.target,
        amountCents,
        fromMonth: draft.fromMonth,
      });
      onDone();
    } catch (failure) {
      setError(errorMessage(failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR'));
    }
  };

  return (
    <form
      aria-label="Definir orçamento"
      className="space-y-3 rounded-lg border border-border p-3"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <FormAlert message={error} />
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Orçamento de">
          <Select
            disabled={lockTarget}
            value={draft.target}
            onChange={(event) => {
              setDraft({ ...draft, target: event.target.value });
            }}
          >
            <option value="">Escolha</option>
            <option value={TOTAL}>Total da casa</option>
            {categories.map((category) => (
              <optgroup key={category.id} label={category.name}>
                <option value={category.id}>{category.name} (com subcategorias)</option>
                {category.children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </FormField>
        <FormField label="Valor por mês">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={draft.amount}
            onChange={(event) => {
              setDraft({ ...draft, amount: event.target.value });
            }}
          />
        </FormField>
        <FormField label="A partir de">
          <Select
            value={draft.fromMonth}
            onChange={(event) => {
              setDraft({ ...draft, fromMonth: event.target.value });
            }}
          >
            {months.map((month) => (
              <option key={month} value={month}>
                {capitalizeFirst(formatMonth(month))}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={change.isPending}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function BudgetRow({
  householdId,
  budget,
  currency,
  editable,
  month,
  onEdit,
}: {
  householdId: string;
  budget: BudgetStatusView;
  currency: CurrencyCode;
  editable: boolean;
  month: string;
  onEdit: () => void;
}) {
  const change = useBudgetChange(householdId);
  const name = budget.categoryName ?? 'Total da casa';
  return (
    <li className="space-y-2 py-3">
      <BudgetMeter budget={budget} currency={currency} />
      {budget.next && (
        <p className="text-sm text-muted-foreground">
          {budget.next.amountCents === null
            ? `Termina depois de ${formatMonth(addMonths(budget.next.fromMonth, -1))}.`
            : `A partir de ${formatMonth(budget.next.fromMonth)}: ${formatCents(budget.next.amountCents, currency)}.`}
        </p>
      )}
      {editable && (
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" aria-label={`Alterar orçamento de ${name}`} onClick={onEdit}>
            Alterar
          </Button>
          <Button
            variant="ghost"
            aria-label={`Remover orçamento de ${name}`}
            disabled={change.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Remover o orçamento de ${name} a partir de ${formatMonth(month)}? Os meses anteriores continuam como estão.`,
                )
              ) {
                change.mutate({
                  categoryId: budget.categoryId,
                  amountCents: null,
                  fromMonth: month,
                });
              }
            }}
          >
            Remover
          </Button>
        </div>
      )}
    </li>
  );
}

/** Monthly budgets (FR-BUD-01..04): no rollover, shared spend only, changes from a month on. */
export function BudgetsPage() {
  const { householdId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const household = useHousehold(householdId);
  const categories = useCategories(householdId);
  const requested = params.get('mes');
  const view = useBudgetMonth(
    householdId,
    requested && MONTH_PATTERN.test(requested) ? requested : null,
  );
  const [editing, setEditing] = useState<Draft | 'new' | null>(null);

  const data = view.data;
  const currency = household.data?.currency ?? 'BRL';
  const months = data ? Array.from({ length: 12 }, (_, i) => addMonths(data.month, i)) : [];

  return (
    <div className="space-y-4">
      <MonthSwitcher
        month={data?.month ?? ''}
        onChange={(month) => {
          setEditing(null);
          setParams({ mes: month }, { replace: true });
        }}
      />
      {view.error && (
        <FormAlert
          message={errorMessage(
            view.error instanceof ApiError ? view.error.code : 'INTERNAL_ERROR',
          )}
        />
      )}
      {data && (
        <Card
          title="Orçamentos do mês"
          description="Contam só as despesas compartilhadas, incluindo subcategorias. Cada mês começa do zero: sobra e estouro não passam para o mês seguinte."
        >
          {!data.editable && (
            <p className="rounded-lg bg-muted/60 p-3 text-sm">
              Meses passados não mudam. Para ajustar, escolha o mês atual ou um mês futuro.
            </p>
          )}
          {data.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum orçamento neste mês.</p>
          ) : (
            <ul className="divide-y divide-border" aria-label="Orçamentos">
              {data.data.map((budget) =>
                editing !== null &&
                editing !== 'new' &&
                editing.target === (budget.categoryId ?? TOTAL) ? (
                  <li key={budget.id} className="py-3">
                    <BudgetForm
                      householdId={householdId}
                      categories={categories.data ?? []}
                      months={months}
                      initial={editing}
                      lockTarget
                      onDone={() => {
                        setEditing(null);
                      }}
                    />
                  </li>
                ) : (
                  <BudgetRow
                    key={budget.id}
                    householdId={householdId}
                    budget={budget}
                    currency={currency}
                    editable={data.editable}
                    month={data.month}
                    onEdit={() => {
                      setEditing({
                        target: budget.categoryId ?? TOTAL,
                        amount: centsToInput(budget.amountCents),
                        fromMonth: data.month,
                      });
                    }}
                  />
                ),
              )}
            </ul>
          )}
          {data.editable &&
            (editing === 'new' ? (
              <BudgetForm
                householdId={householdId}
                categories={categories.data ?? []}
                months={months}
                initial={{ target: '', amount: '', fromMonth: data.month }}
                lockTarget={false}
                onDone={() => {
                  setEditing(null);
                }}
              />
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing('new');
                }}
              >
                Novo orçamento
              </Button>
            ))}
        </Card>
      )}
    </div>
  );
}
