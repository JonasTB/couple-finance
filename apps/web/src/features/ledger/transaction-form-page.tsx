import {
  type CategoryView,
  type CurrencyCode,
  ErrorCode,
  type HouseholdMemberView,
  PAYMENT_METHODS,
  type PaymentMethod,
  type SplitInput,
  type SplitPreview,
  type SplitType,
  type TransactionView,
} from '@couple-finance/shared';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { useHousehold, useMembers } from '@/features/households/households-api';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { formatDate, todayIn } from '@/shared/lib/dates';
import { centsToInput, formatCents, parseMoneyInput, parsePercentInput } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { CategorySelect } from './category-select';
import { originLabel, PAYMENT_METHOD_LABELS, SPLIT_TYPE_LABELS } from './labels';
import {
  previewSplit,
  useCategories,
  useTransaction,
  useTransactionHistory,
  useTransactionMutations,
} from './ledger-api';

/** `KEEP` (edit only) keeps the stored basis; `DEFAULT` (create only) uses the household rule. */
type SplitMode = 'DEFAULT' | 'KEEP' | SplitType;

interface FormValues {
  amount: string;
  description: string;
  date: string;
  categoryId: string;
  payerMemberId: string;
  paymentMethod: PaymentMethod;
  splitMode: SplitMode;
  percents: Record<string, string>;
  amounts: Record<string, string>;
  responsibleMemberId: string;
  notes: string;
  tags: string;
}

type FieldErrors = Partial<
  Record<'amount' | 'description' | 'date' | 'categoryId' | 'payerMemberId' | 'split', string>
>;

const API_FIELD_TO_FORM: Record<string, keyof FieldErrors> = {
  amountCents: 'amount',
  description: 'description',
  date: 'date',
  categoryId: 'categoryId',
  payerMemberId: 'payerMemberId',
};

function splitErrorMessage(error: ApiError): string {
  if (error.code === ErrorCode.SPLIT_SUM_MISMATCH) {
    return 'Os valores de cada pessoa precisam somar exatamente o valor da despesa.';
  }
  if (error.code === ErrorCode.INCOME_BASIS_MISSING) {
    return 'Para dividir pela renda, cada pessoa precisa ter a renda cadastrada para esta data (aba Renda).';
  }
  return 'Revise a divisão: os percentuais precisam somar 100%.';
}

/** Builds the API split request from the form. Returns an error message for unparseable input. */
function buildSplit(
  values: FormValues,
  members: HouseholdMemberView[],
): SplitInput | undefined | string {
  switch (values.splitMode) {
    case 'DEFAULT':
    case 'KEEP':
      return undefined;
    case 'EQUAL':
    case 'INCOME_PROPORTIONAL':
      return { type: values.splitMode };
    case 'INDIVIDUAL':
      return values.responsibleMemberId
        ? { type: 'INDIVIDUAL', responsibleMemberId: values.responsibleMemberId }
        : 'Escolha de quem é a despesa.';
    case 'CUSTOM_PERCENT': {
      const weights = members.map((member) => ({
        memberId: member.id,
        bps: parsePercentInput(values.percents[member.id] ?? ''),
      }));
      if (weights.some((weight) => weight.bps === null)) {
        return 'Informe um percentual válido para cada pessoa (ex.: 60 ou 33,33).';
      }
      return {
        type: 'CUSTOM_PERCENT',
        weights: weights.map((w) => ({ memberId: w.memberId, bps: w.bps ?? 0 })),
      };
    }
    case 'CUSTOM_AMOUNT': {
      const amounts = members.map((member) => ({
        memberId: member.id,
        amountCents: parseMoneyInput(values.amounts[member.id] ?? ''),
      }));
      if (amounts.some((amount) => amount.amountCents === null)) {
        return 'Informe um valor válido para cada pessoa (ex.: 25,50).';
      }
      return {
        type: 'CUSTOM_AMOUNT',
        amounts: amounts.map((a) => ({ memberId: a.memberId, amountCents: a.amountCents ?? 0 })),
      };
    }
  }
}

function initialValues(
  existing: TransactionView | undefined,
  today: string,
  myMemberId: string,
): FormValues {
  if (existing) {
    return {
      amount: centsToInput(existing.amountCents),
      description: existing.description,
      date: existing.date,
      categoryId: existing.categoryId,
      payerMemberId: existing.payerMemberId,
      paymentMethod: existing.paymentMethod,
      splitMode: 'KEEP',
      percents: {},
      amounts: {},
      responsibleMemberId:
        existing.split.type === 'INDIVIDUAL' ? (existing.split.weights[0]?.memberId ?? '') : '',
      notes: existing.notes ?? '',
      tags: existing.tags.join(', '),
    };
  }
  return {
    amount: '',
    description: '',
    date: today,
    categoryId: '',
    payerMemberId: myMemberId,
    paymentMethod: 'PIX',
    splitMode: 'DEFAULT',
    percents: {},
    amounts: {},
    responsibleMemberId: myMemberId,
    notes: '',
    tags: '',
  };
}

function AllocationList({
  preview,
  members,
  currency,
}: {
  preview: Pick<SplitPreview, 'allocations'>;
  members: HouseholdMemberView[];
  currency: CurrencyCode;
}) {
  const names = new Map(members.map((member) => [member.id, member.displayName]));
  return (
    <ul className="space-y-1">
      {preview.allocations.map((allocation) => (
        <li key={allocation.memberId} className="flex justify-between gap-2">
          <span>{names.get(allocation.memberId) ?? 'Ex-membro'}</span>
          <span className="font-medium tabular-nums">
            {formatCents(allocation.amountCents, currency)}
          </span>
        </li>
      ))}
    </ul>
  );
}

const HISTORY_LABELS = {
  CREATE: 'criou',
  UPDATE: 'editou',
  DELETE: 'excluiu',
  RESTORE: 'restaurou',
  RECALCULATE: 'recalculou a divisão de',
} as const;

function TransactionHistory({
  householdId,
  transactionId,
}: {
  householdId: string;
  transactionId: string;
}) {
  const history = useTransactionHistory(householdId, transactionId);
  if (!history.data || history.data.length === 0) {
    return null;
  }
  return (
    <Card title="Histórico">
      <ul className="space-y-1 text-sm text-muted-foreground">
        {history.data.map((entry) => (
          <li key={`${entry.occurredAt}-${entry.action}`}>
            {entry.actorDisplayName} {HISTORY_LABELS[entry.action]} esta despesa em{' '}
            {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
              new Date(entry.occurredAt),
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Create (`despesas/nova`) and edit (`despesas/:transactionId`) an expense. */
export function TransactionFormPage() {
  const { householdId = '', transactionId } = useParams();
  const isEdit = Boolean(transactionId);
  const household = useHousehold(householdId);
  const members = useMembers(householdId);
  const categories = useCategories(householdId);
  const existing = useTransaction(householdId, transactionId);

  if (existing.isError) {
    return <FormAlert message="Não encontramos esta despesa." />;
  }
  if (!household.data || !members.data || !categories.data || (isEdit && !existing.data)) {
    return (
      <p role="status" className="py-12 text-center text-muted-foreground">
        Carregando…
      </p>
    );
  }
  return (
    <TransactionForm
      key={existing.data ? `${existing.data.id}-${existing.data.version}` : 'new'}
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

interface TransactionFormProps {
  householdId: string;
  currency: CurrencyCode;
  today: string;
  myMemberId: string;
  defaultSplitLabel: string;
  members: HouseholdMemberView[];
  categories: CategoryView[];
  existing: TransactionView | undefined;
}

function TransactionForm({
  householdId,
  currency,
  today,
  myMemberId,
  defaultSplitLabel,
  members,
  categories,
  existing,
}: TransactionFormProps) {
  const navigate = useNavigate();
  const mutations = useTransactionMutations(householdId);
  const { register, handleSubmit, control } = useForm<FormValues>({
    defaultValues: initialValues(existing, today, myMemberId),
  });
  const values = useWatch({ control }) as FormValues;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  // Each result remembers the input it was computed for, so stale previews are never shown.
  const [preview, setPreview] = useState<
    | { key: string; allocations: SplitPreview['allocations'] }
    | { key: string; error: string }
    | null
  >(null);

  // Members who may appear: active ones plus anyone already on this expense (former members).
  const people = useMemo(() => {
    const referenced = new Set([
      existing?.payerMemberId,
      ...(existing?.allocations.map((a) => a.memberId) ?? []),
    ]);
    const known = new Set(members.map((member) => member.id));
    const former = [...referenced]
      .filter((id): id is string => Boolean(id) && !known.has(id ?? ''))
      .map((id) => ({ id, displayName: 'Ex-membro' }) as HouseholdMemberView);
    return [...members, ...former];
  }, [members, existing]);

  // Live preview from the API (all split math stays on the server).
  const amountCents = parseMoneyInput(values.amount);
  const split = buildSplit(values, members);
  const previewInput =
    amountCents !== null && typeof split !== 'string' && values.splitMode !== 'KEEP'
      ? { amountCents, date: values.date, ...(split ? { split } : {}) }
      : null;
  const previewKey = previewInput ? JSON.stringify(previewInput) : null;
  useEffect(() => {
    if (!previewInput || !previewKey) {
      return;
    }
    const timer = setTimeout(() => {
      previewSplit(householdId, previewInput)
        .then((result) => {
          setPreview({ key: previewKey, allocations: result.allocations });
        })
        .catch((error: unknown) => {
          setPreview({
            key: previewKey,
            error:
              error instanceof ApiError ? splitErrorMessage(error) : errorMessage('INTERNAL_ERROR'),
          });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
    };
    // previewKey is the serialized previewInput: it changes exactly when the preview must.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);
  const currentPreview = previewKey && preview?.key === previewKey ? preview : null;

  const onSubmit = handleSubmit(async (form) => {
    setFormError(undefined);
    const nextErrors: FieldErrors = {};
    const cents = parseMoneyInput(form.amount);
    if (cents === null || cents === 0) nextErrors.amount = 'Informe o valor (ex.: 45,90).';
    if (form.description.trim().length === 0) nextErrors.description = 'Descreva a despesa.';
    if (!form.date) nextErrors.date = 'Informe a data.';
    if (!form.categoryId) nextErrors.categoryId = 'Escolha a categoria.';
    const splitInput = buildSplit(form, members);
    if (typeof splitInput === 'string') nextErrors.split = splitInput;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || cents === null || typeof splitInput === 'string') {
      return;
    }

    const input = {
      description: form.description.trim(),
      amountCents: cents,
      date: form.date,
      categoryId: form.categoryId,
      payerMemberId: form.payerMemberId,
      paymentMethod: form.paymentMethod,
      notes: form.notes.trim() || null,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      ...(splitInput ? { split: splitInput } : {}),
    };
    try {
      if (existing) {
        await mutations.update.mutateAsync({
          id: existing.id,
          version: existing.version,
          ...input,
        });
      } else {
        await mutations.create.mutateAsync(input);
      }
      await navigate(`/casas/${householdId}/despesas`, { replace: true });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError(errorMessage('INTERNAL_ERROR'));
        return;
      }
      if (
        error.code === ErrorCode.SPLIT_SUM_MISMATCH ||
        error.code === ErrorCode.INCOME_BASIS_MISSING
      ) {
        setErrors({ split: splitErrorMessage(error) });
        return;
      }
      if (error.code === ErrorCode.CATEGORY_ARCHIVED) {
        setErrors({ categoryId: 'Esta categoria foi arquivada. Escolha outra.' });
        return;
      }
      if (error.code === ErrorCode.VALIDATION_FAILED && Array.isArray(error.details?.fields)) {
        const mapped: FieldErrors = {};
        for (const entry of error.details.fields as { field?: string }[]) {
          const field = entry.field ?? '';
          if (field.startsWith('split')) mapped.split = 'Revise a divisão.';
          const formField = API_FIELD_TO_FORM[field];
          if (formField) mapped[formField] = 'Valor inválido.';
        }
        if (Object.keys(mapped).length > 0) {
          setErrors(mapped);
          return;
        }
      }
      setFormError(errorMessage(error.code));
    }
  });

  const onDelete = async () => {
    if (!existing || !window.confirm('Excluir esta despesa? Você poderá desfazer em seguida.'))
      return;
    try {
      await mutations.remove.mutateAsync(existing.id);
      await navigate(`/casas/${householdId}/despesas`, {
        replace: true,
        state: { deletedId: existing.id },
      });
    } catch (error) {
      setFormError(errorMessage(error instanceof ApiError ? error.code : 'INTERNAL_ERROR'));
    }
  };

  const onRecalculate = async () => {
    if (!existing) return;
    try {
      await mutations.recalculate.mutateAsync(existing.id);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? splitErrorMessage(error) : errorMessage('INTERNAL_ERROR'),
      );
    }
  };

  const submitting = mutations.create.isPending || mutations.update.isPending;
  const splitModes: SplitMode[] = [
    existing ? 'KEEP' : 'DEFAULT',
    'EQUAL',
    'INCOME_PROPORTIONAL',
    'CUSTOM_PERCENT',
    'CUSTOM_AMOUNT',
    'INDIVIDUAL',
  ];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{existing ? 'Editar despesa' : 'Nova despesa'}</h2>
        <Link
          to={`/casas/${householdId}/despesas`}
          className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline"
        >
          Voltar
        </Link>
      </div>
      {existing?.origin && (
        <p className="rounded-lg bg-muted/60 p-3 text-sm">
          {existing.origin.kind === 'INSTALLMENT' ? (
            <>
              {originLabel(existing.origin)} de uma compra parcelada.{' '}
              <Link
                className="text-primary underline"
                to={`/casas/${householdId}/compromissos/parcelados/${existing.origin.installmentPlanId}`}
              >
                Ver compra
              </Link>
            </>
          ) : (
            <>
              Registrada a partir de uma despesa recorrente (ocorrência de{' '}
              {formatDate(existing.origin.occurrenceDate)}).{' '}
              <Link
                className="text-primary underline"
                to={`/casas/${householdId}/compromissos/recorrentes/${existing.origin.recurringExpenseId}`}
              >
                Ver recorrente
              </Link>
            </>
          )}{' '}
          Alterações aqui valem só para esta despesa.
        </p>
      )}
      <form className="space-y-4" noValidate onSubmit={(event) => void onSubmit(event)}>
        <FormAlert message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Valor" error={errors.amount}>
            <Input
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              autoFocus={!existing}
              {...register('amount')}
            />
          </FormField>
          <FormField label="Data" error={errors.date}>
            <Input type="date" {...register('date')} />
          </FormField>
        </div>
        <FormField label="Descrição" error={errors.description}>
          <Input
            maxLength={120}
            placeholder="Ex.: Supermercado do mês"
            {...register('description')}
          />
        </FormField>
        <FormField label="Categoria" error={errors.categoryId}>
          <CategorySelect categories={categories} {...register('categoryId')} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Quem pagou" error={errors.payerMemberId}>
            <Select {...register('payerMemberId')}>
              {people.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                  {member.id === myMemberId ? ' (você)' : ''}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Forma de pagamento">
            <Select {...register('paymentMethod')}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <Card title="De quem é a despesa">
          <FormField label="Divisão" error={errors.split}>
            <Select {...register('splitMode')}>
              {splitModes.map((mode) => (
                <option key={mode} value={mode}>
                  {mode === 'DEFAULT'
                    ? `Padrão da casa (${defaultSplitLabel.toLowerCase()})`
                    : mode === 'KEEP'
                      ? `Manter a divisão atual (${existing ? SPLIT_TYPE_LABELS[existing.split.type].toLowerCase() : ''})`
                      : SPLIT_TYPE_LABELS[mode]}
                </option>
              ))}
            </Select>
          </FormField>

          {values.splitMode === 'INDIVIDUAL' && (
            <FormField label="Despesa de" hint="Quem pagou pode ser outra pessoa.">
              <Select {...register('responsibleMemberId')}>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          {values.splitMode === 'CUSTOM_PERCENT' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {members.map((member) => (
                <FormField key={member.id} label={`${member.displayName} (%)`}>
                  <Input
                    inputMode="decimal"
                    placeholder="50"
                    {...register(`percents.${member.id}`)}
                  />
                </FormField>
              ))}
            </div>
          )}
          {values.splitMode === 'CUSTOM_AMOUNT' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {members.map((member) => (
                <FormField key={member.id} label={`${member.displayName} (valor)`}>
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    {...register(`amounts.${member.id}`)}
                  />
                </FormField>
              ))}
            </div>
          )}

          {values.splitMode === 'KEEP' && existing && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                Divisão salva
                {existing.split.incomeBasisDate
                  ? `, com a renda de ${formatDate(existing.split.incomeBasisDate)}`
                  : ''}
                . Se o valor mudar, as proporções são mantidas.
              </p>
              <AllocationList preview={existing} members={people} currency={currency} />
              {existing.split.type === 'INCOME_PROPORTIONAL' && (
                <Button type="button" variant="outline" onClick={() => void onRecalculate()}>
                  Recalcular com a renda cadastrada para esta data
                </Button>
              )}
            </div>
          )}
          {currentPreview && 'allocations' in currentPreview && (
            <div aria-live="polite" className="space-y-1 text-sm">
              <p className="text-muted-foreground">Cada pessoa fica responsável por:</p>
              <AllocationList preview={currentPreview} members={people} currency={currency} />
            </div>
          )}
          {currentPreview && 'error' in currentPreview && (
            <p aria-live="polite" className="text-sm text-warning-foreground">
              {currentPreview.error}
            </p>
          )}
        </Card>

        <details className="rounded-lg border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Mais detalhes (opcional)</summary>
          <div className="mt-4 space-y-4">
            <FormField label="Observações">
              <Input maxLength={500} {...register('notes')} />
            </FormField>
            <FormField label="Etiquetas" hint="Separe por vírgula. Ex.: viagem, presente">
              <Input {...register('tags')} />
            </FormField>
          </div>
        </details>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-w-40" disabled={submitting}>
            {submitting ? 'Salvando…' : existing ? 'Salvar alterações' : 'Salvar despesa'}
          </Button>
          {existing && (
            <Button type="button" variant="ghost" onClick={() => void onDelete()}>
              Excluir
            </Button>
          )}
        </div>
      </form>
      {existing && <TransactionHistory householdId={householdId} transactionId={existing.id} />}
    </div>
  );
}
