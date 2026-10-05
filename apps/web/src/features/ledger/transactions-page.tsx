import type {
  CategoryView,
  CurrencyCode,
  HouseholdMemberView,
  TransactionView,
} from '@couple-finance/shared';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useHousehold, useMembers } from '@/features/households/households-api';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { capitalizeFirst, formatDate, monthOf, monthRange, todayIn } from '@/shared/lib/dates';
import { formatCents } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { FormAlert } from '@/shared/ui/form-alert';
import { Input } from '@/shared/ui/input';
import { MonthSwitcher } from '@/shared/ui/month-switcher';
import { Select } from '@/shared/ui/select';
import { originLabel, SPLIT_TYPE_LABELS } from './labels';
import {
  type TransactionFilters,
  useCategories,
  useTransactionMutations,
  useTransactions,
} from './ledger-api';

function categoryNames(categories: CategoryView[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const category of categories) {
    names.set(category.id, category.name);
    for (const child of category.children) {
      names.set(child.id, `${category.name} › ${child.name}`);
    }
  }
  return names;
}

function splitSummary(transaction: TransactionView, names: Map<string, string>): string {
  if (transaction.split.type === 'INDIVIDUAL') {
    return `Despesa de ${names.get(transaction.split.weights[0]?.memberId ?? '') ?? 'Ex-membro'}`;
  }
  return SPLIT_TYPE_LABELS[transaction.split.type];
}

interface RowProps {
  transaction: TransactionView;
  householdId: string;
  currency: CurrencyCode;
  categories: Map<string, string>;
  people: Map<string, string>;
  onRestore?: (id: string) => void;
}

function TransactionRow({
  transaction,
  householdId,
  currency,
  categories,
  people,
  onRestore,
}: RowProps) {
  const content = (
    <>
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {transaction.description}
          {transaction.origin && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {originLabel(transaction.origin)}
            </span>
          )}
        </span>
        <span className="block truncate text-sm text-muted-foreground">
          {categories.get(transaction.categoryId) ?? 'Categoria'} · Pago por{' '}
          {people.get(transaction.payerMemberId) ?? 'Ex-membro'} ·{' '}
          {splitSummary(transaction, people)}
        </span>
      </span>
      <span className="shrink-0 font-medium tabular-nums">
        {formatCents(transaction.amountCents, currency)}
      </span>
    </>
  );
  if (onRestore) {
    return (
      <li className="flex items-center justify-between gap-3 py-3">
        {content}
        <Button
          variant="outline"
          onClick={() => {
            onRestore(transaction.id);
          }}
        >
          Restaurar
        </Button>
      </li>
    );
  }
  return (
    <li>
      <Link
        to={`/casas/${householdId}/despesas/${transaction.id}`}
        className="flex items-center justify-between gap-3 py-3 hover:bg-muted/50"
      >
        {content}
      </Link>
    </li>
  );
}

/** Monthly list of expenses with filters, newest first (FR-TX-05). */
export function TransactionsPage() {
  const { householdId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const household = useHousehold(householdId);
  const members = useMembers(householdId);
  const categories = useCategories(householdId, true);
  const mutations = useTransactionMutations(householdId);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const deletedId = (location.state as { deletedId?: string } | null)?.deletedId;

  const month =
    params.get('mes') ?? (household.data ? monthOf(todayIn(household.data.timezone)) : '');
  const showDeleted = params.get('excluidas') === '1';
  const filters: TransactionFilters = {
    ...(month ? monthRange(month) : {}),
    ...(params.get('categoria') ? { categoryId: params.get('categoria') ?? '' } : {}),
    ...(params.get('pagador') ? { payerMemberId: params.get('pagador') ?? '' } : {}),
    ...(params.get('q') ? { q: params.get('q') ?? '' } : {}),
    ...(showDeleted ? { deleted: 'only' as const } : {}),
  };
  const transactions = useTransactions(householdId, filters);

  const names = useMemo(() => categoryNames(categories.data ?? []), [categories.data]);
  const people = useMemo(
    () =>
      new Map(
        (members.data ?? []).map((member: HouseholdMemberView) => [member.id, member.displayName]),
      ),
    [members.data],
  );

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const undoDelete = async (id: string) => {
    await mutations.restore.mutateAsync(id);
    await navigate('.', { replace: true, state: null });
  };

  const rows = transactions.data?.pages.flatMap((page) => page.data) ?? [];
  const byDate = new Map<string, TransactionView[]>();
  for (const row of rows) {
    byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
  }
  const currency = household.data?.currency ?? 'BRL';
  const loadError = transactions.error ?? categories.error;

  return (
    <div className="space-y-4">
      {deletedId && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
        >
          <span>Despesa excluída.</span>
          <Button variant="outline" onClick={() => void undoDelete(deletedId)}>
            Desfazer
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthSwitcher
          month={month}
          onChange={(next) => {
            update('mes', next);
          }}
        />
        <Button asChild>
          <Link to="nova">Nova despesa</Link>
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Select
          aria-label="Filtrar por categoria"
          value={params.get('categoria') ?? ''}
          onChange={(event) => {
            update('categoria', event.target.value || null);
          }}
        >
          <option value="">Todas as categorias</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filtrar por quem pagou"
          value={params.get('pagador') ?? ''}
          onChange={(event) => {
            update('pagador', event.target.value || null);
          }}
        >
          <option value="">Pago por qualquer pessoa</option>
          {(members.data ?? []).map((member) => (
            <option key={member.id} value={member.id}>
              Pago por {member.displayName}
            </option>
          ))}
        </Select>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            update('q', search.trim() || null);
          }}
        >
          <Input
            type="search"
            aria-label="Buscar despesas"
            placeholder="Buscar descrição ou etiqueta"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </form>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={showDeleted}
          onChange={(event) => {
            update('excluidas', event.target.checked ? '1' : null);
          }}
        />
        Mostrar só as excluídas
      </label>

      {loadError && (
        <FormAlert
          message={errorMessage(loadError instanceof ApiError ? loadError.code : 'INTERNAL_ERROR')}
        />
      )}
      {transactions.isPending && (
        <p role="status" className="py-8 text-center text-muted-foreground">
          Carregando…
        </p>
      )}
      {transactions.isSuccess && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-medium">
            {showDeleted ? 'Nenhuma despesa excluída neste mês.' : 'Nenhuma despesa neste mês.'}
          </p>
          {!showDeleted && (
            <p className="text-sm text-muted-foreground">
              Registre a primeira — leva só alguns segundos.
            </p>
          )}
        </div>
      )}

      {[...byDate.entries()].map(([date, items]) => (
        <section key={date} aria-label={formatDate(date, 'weekday')}>
          <h3 className="text-sm font-medium text-muted-foreground">
            {capitalizeFirst(formatDate(date, 'weekday'))}
          </h3>
          <ul className="divide-y divide-border">
            {items.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                householdId={householdId}
                currency={currency}
                categories={names}
                people={people}
                {...(showDeleted
                  ? {
                      onRestore: (id: string) => {
                        mutations.restore.mutate(id);
                      },
                    }
                  : {})}
              />
            ))}
          </ul>
        </section>
      ))}
      {transactions.hasNextPage && (
        <Button
          variant="outline"
          className="w-full"
          disabled={transactions.isFetchingNextPage}
          onClick={() => void transactions.fetchNextPage()}
        >
          {transactions.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
        </Button>
      )}
    </div>
  );
}
