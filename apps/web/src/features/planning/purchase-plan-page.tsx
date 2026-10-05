import {
  type CurrencyCode,
  type HouseholdMemberView,
  PURCHASE_ITEM_STATUSES,
  PURCHASE_PRIORITIES,
  type PurchaseItemView,
  type PurchasePlanView,
  type PurchasePriority,
} from '@couple-finance/shared';
import { type SyntheticEvent, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useHousehold, useMembers } from '@/features/households/households-api';
import { useTransactions } from '@/features/ledger/ledger-api';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { addMonths, formatDate, monthOf, todayIn } from '@/shared/lib/dates';
import { centsToInput, formatBps, formatCents, parseMoneyInput } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { ITEM_STATUS_LABELS, PRIORITY_LABELS } from './labels';
import { usePurchasePlan, usePurchasePlanMutations } from './planning-api';
import { ProgressBar } from './progress-bar';

/** One purchase plan (FR-PP-01..04). Totals come from the API; the page only formats. */
export function PurchasePlanPage() {
  const { householdId = '', planId = '' } = useParams();
  const household = useHousehold(householdId);
  const members = useMembers(householdId);
  const plan = usePurchasePlan(householdId, planId);

  if (plan.isError) {
    return <FormAlert message="Não encontramos este plano." />;
  }
  if (!plan.data || !household.data || !members.data) {
    return (
      <p role="status" className="py-12 text-center text-muted-foreground">
        Carregando…
      </p>
    );
  }
  return (
    <PlanDetail
      householdId={householdId}
      plan={plan.data}
      members={members.data}
      currency={household.data.currency}
      today={todayIn(household.data.timezone)}
    />
  );
}

/** Recent expenses to link a purchase to (this month and the two before). */
function useRecentExpenses(householdId: string, today: string) {
  const month = monthOf(today);
  const expenses = useTransactions(householdId, {
    from: `${addMonths(month, -2)}-01`,
    to: today,
  });
  return expenses.data?.pages.flatMap((page) => page.data) ?? [];
}

function PurchaseForm({
  householdId,
  planId,
  item,
  currency,
  today,
  onDone,
}: {
  householdId: string;
  planId: string;
  item: PurchaseItemView;
  currency: CurrencyCode;
  today: string;
  onDone: () => void;
}) {
  const mutations = usePurchasePlanMutations(householdId);
  const expenses = useRecentExpenses(householdId, today);
  const [paid, setPaid] = useState(centsToInput(item.estimatedTotalCents));
  const [date, setDate] = useState(today);
  const [transactionId, setTransactionId] = useState('');
  const [error, setError] = useState<string>();

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const paidPriceCents = parseMoneyInput(paid);
    if (paidPriceCents === null) {
      setError('Informe o valor pago (ex.: 3.799,00).');
      return;
    }
    try {
      await mutations.purchase.mutateAsync({
        planId,
        itemId: item.id,
        paidPriceCents,
        purchasedAt: date,
        transactionId: transactionId || null,
      });
      onDone();
    } catch (failure) {
      setError(errorMessage(failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR'));
    }
  };

  return (
    <form
      aria-label={`Comprar ${item.name}`}
      className="space-y-3 rounded-lg border border-border p-3"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <FormAlert message={error} />
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Valor pago (total)">
          <Input
            inputMode="decimal"
            value={paid}
            onChange={(event) => {
              setPaid(event.target.value);
            }}
          />
        </FormField>
        <FormField label="Data da compra">
          <Input
            type="date"
            max={today}
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
            }}
          />
        </FormField>
        <FormField
          label="Despesa registrada (opcional)"
          hint="Ligue à despesa já lançada; nada é criado aqui."
        >
          <Select
            value={transactionId}
            onChange={(event) => {
              setTransactionId(event.target.value);
            }}
          >
            <option value="">Nenhuma</option>
            {expenses.map((expense) => (
              <option key={expense.id} value={expense.id}>
                {expense.description} · {formatCents(expense.amountCents, currency)} ·{' '}
                {formatDate(expense.date, 'short')}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={mutations.purchase.isPending}>
          Marcar como comprado
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function NewItemForm({
  householdId,
  planId,
  members,
}: {
  householdId: string;
  planId: string;
  members: HouseholdMemberView[];
}) {
  const mutations = usePurchasePlanMutations(householdId);
  const [name, setName] = useState('');
  const [estimate, setEstimate] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [priority, setPriority] = useState<PurchasePriority>('MEDIUM');
  const [later, setLater] = useState(false);
  const [responsible, setResponsible] = useState('');
  const [error, setError] = useState<string>();

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const estimatedPriceCents = parseMoneyInput(estimate);
    const units = Number(quantity);
    if (!name.trim() || !estimatedPriceCents || !Number.isInteger(units) || units < 1) {
      setError('Informe o nome, o preço estimado e a quantidade.');
      return;
    }
    setError(undefined);
    try {
      await mutations.addItem.mutateAsync({
        planId,
        name: name.trim(),
        estimatedPriceCents,
        quantity: units,
        priority,
        status: later ? 'FUTURE' : 'PENDING',
        responsibleMemberId: responsible || null,
      });
      setName('');
      setEstimate('');
      setQuantity('1');
    } catch (failure) {
      setError(errorMessage(failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR'));
    }
  };

  return (
    <form
      aria-label="Adicionar item"
      className="space-y-3"
      onSubmit={(event) => void submit(event)}
      noValidate
    >
      <FormAlert message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Item">
          <Input
            maxLength={80}
            placeholder="Ex.: Sofá"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </FormField>
        <FormField label="Preço estimado (unidade)">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={estimate}
            onChange={(event) => {
              setEstimate(event.target.value);
            }}
          />
        </FormField>
        <FormField label="Quantidade">
          <Input
            type="number"
            min={1}
            max={999}
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value);
            }}
          />
        </FormField>
        <FormField label="Prioridade">
          <Select
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value as PurchasePriority);
            }}
          >
            {PURCHASE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Quem cuida (opcional)">
          <Select
            value={responsible}
            onChange={(event) => {
              setResponsible(event.target.value);
            }}
          >
            <option value="">Ninguém em especial</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
        </FormField>
        <label className="flex min-h-11 items-center gap-2 self-end">
          <input
            type="checkbox"
            checked={later}
            onChange={(event) => {
              setLater(event.target.checked);
            }}
          />
          Para o futuro (fora do total agora)
        </label>
      </div>
      <Button type="submit" disabled={mutations.addItem.isPending}>
        Adicionar item
      </Button>
    </form>
  );
}

function PlanDetail({
  householdId,
  plan,
  members,
  currency,
  today,
}: {
  householdId: string;
  plan: PurchasePlanView;
  members: HouseholdMemberView[];
  currency: CurrencyCode;
  today: string;
}) {
  const mutations = usePurchasePlanMutations(householdId);
  const [buying, setBuying] = useState<string | null>(null);
  const [removedId, setRemovedId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const money = (cents: number) => formatCents(cents, currency);
  const names = new Map(members.map((m) => [m.id, m.displayName]));
  const archived = plan.status === 'ARCHIVED';
  const { totals } = plan;

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

  const key = (item: PurchaseItemView) => ({ planId: plan.id, itemId: item.id });

  return (
    <div className="space-y-4">
      <Link
        to="../.."
        relative="path"
        className="inline-flex min-h-11 items-center text-sm text-primary hover:underline"
      >
        ‹ Metas e planos
      </Link>
      <Card
        title={plan.name}
        description={
          archived ? 'Arquivado' : plan.status === 'COMPLETED' ? 'Tudo comprado' : undefined
        }
      >
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-muted-foreground">Estimado</dt>
            <dd className="font-medium tabular-nums">{money(totals.estimatedCents)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Pago</dt>
            <dd className="font-medium tabular-nums">{money(totals.actualCents)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Falta comprar</dt>
            <dd className="font-medium tabular-nums">{money(totals.remainingNeedCents)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Diferença no que já foi comprado</dt>
            <dd className="font-medium tabular-nums">
              {totals.varianceCents === 0
                ? 'igual ao estimado'
                : `${money(Math.abs(totals.varianceCents))} ${totals.varianceCents > 0 ? 'acima' : 'abaixo'}`}
            </dd>
          </div>
        </dl>
        {totals.futureCount > 0 && (
          <p className="text-sm text-muted-foreground">
            Itens para o futuro somam {money(totals.futureCents)} e ficam fora do estimado.
          </p>
        )}
        {plan.goal && (
          <div className="space-y-1.5">
            <p className="text-sm">
              Meta{' '}
              <Link className="text-primary underline" to={`../../${plan.goal.id}`} relative="path">
                {plan.goal.name}
              </Link>
              : {money(plan.goal.savedCents)} guardados
              {plan.goal.coverageBps !== null &&
                ` · cobrem ${formatBps(plan.goal.coverageBps)} do que falta comprar`}
            </p>
            {plan.goal.coverageBps !== null && (
              <ProgressBar
                bps={plan.goal.coverageBps}
                label={`A meta cobre ${formatBps(plan.goal.coverageBps)} do que falta`}
              />
            )}
          </div>
        )}
      </Card>

      <FormAlert message={error} />
      {removedId && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-lg border border-border p-3"
        >
          <span>Item excluído.</span>
          <Button
            variant="outline"
            onClick={() => {
              void run(() =>
                mutations.restoreItem.mutateAsync({ planId: plan.id, itemId: removedId }),
              );
              setRemovedId(null);
            }}
          >
            Desfazer
          </Button>
        </div>
      )}

      {PURCHASE_ITEM_STATUSES.map((status) => {
        const items = (plan.items ?? []).filter((item) => item.status === status);
        if (items.length === 0) return null;
        return (
          <Card
            key={status}
            aria-label={ITEM_STATUS_LABELS[status]}
            title={ITEM_STATUS_LABELS[status]}
          >
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {item.name}
                        {item.quantity > 1 && ` × ${String(item.quantity)}`}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        Prioridade {PRIORITY_LABELS[item.priority].toLowerCase()}
                        {item.responsibleMemberId &&
                          ` · com ${names.get(item.responsibleMemberId) ?? 'Ex-membro'}`}
                        {item.status === 'PURCHASED' &&
                          item.purchasedAt &&
                          ` · comprado em ${formatDate(item.purchasedAt, 'short')}`}
                        {item.transaction && ` · despesa: ${item.transaction.description}`}
                      </span>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary underline"
                        >
                          Ver link
                        </a>
                      )}
                    </span>
                    <span className="text-right text-sm tabular-nums">
                      {item.status === 'PURCHASED' && item.paidPriceCents !== null ? (
                        <>
                          <span className="block font-medium">{money(item.paidPriceCents)}</span>
                          <span className="block text-muted-foreground">
                            estimado {money(item.estimatedTotalCents)}
                          </span>
                        </>
                      ) : (
                        <span className="font-medium">{money(item.estimatedTotalCents)}</span>
                      )}
                    </span>
                  </div>
                  {buying === item.id ? (
                    <PurchaseForm
                      householdId={householdId}
                      planId={plan.id}
                      item={item}
                      currency={currency}
                      today={today}
                      onDone={() => {
                        setBuying(null);
                      }}
                    />
                  ) : (
                    !archived && (
                      <div className="flex flex-wrap gap-1">
                        {item.status !== 'PURCHASED' && (
                          <Button
                            variant="outline"
                            aria-label={`Comprar ${item.name}`}
                            onClick={() => {
                              setBuying(item.id);
                            }}
                          >
                            Comprei
                          </Button>
                        )}
                        {item.status === 'PURCHASED' && (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              void run(() => mutations.unpurchase.mutateAsync(key(item)))
                            }
                          >
                            Desfazer compra
                          </Button>
                        )}
                        {item.status !== 'PURCHASED' && (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              void run(() =>
                                mutations.updateItem.mutateAsync({
                                  ...key(item),
                                  version: item.version,
                                  status: item.status === 'FUTURE' ? 'PENDING' : 'FUTURE',
                                }),
                              )
                            }
                          >
                            {item.status === 'FUTURE'
                              ? 'Trazer para agora'
                              : 'Deixar para o futuro'}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          aria-label={`Excluir ${item.name}`}
                          onClick={() => {
                            void run(() => mutations.removeItem.mutateAsync(key(item))).then(
                              (ok) => {
                                if (ok) setRemovedId(item.id);
                              },
                            );
                          }}
                        >
                          Excluir
                        </Button>
                      </div>
                    )
                  )}
                </li>
              ))}
            </ul>
          </Card>
        );
      })}

      {!archived && (
        <Card title="Adicionar item">
          <NewItemForm householdId={householdId} planId={plan.id} members={members} />
        </Card>
      )}

      <Button
        variant="ghost"
        onClick={() =>
          void run(() => mutations.setArchived.mutateAsync({ id: plan.id, archived: !archived }))
        }
      >
        {archived ? 'Restaurar plano' : 'Arquivar plano'}
      </Button>
    </div>
  );
}
