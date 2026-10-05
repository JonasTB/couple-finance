import type { IncomeVisibility } from '@couple-finance/shared';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useHousehold, useMembers } from '@/features/households/households-api';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { formatDate, monthOf, todayIn } from '@/shared/lib/dates';
import { formatBps, formatCents, parseMoneyInput } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { LoadState } from '@/shared/ui/load-state';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { useIncomeMutations, useIncomeOverview, useMyIncomeHistory } from './ledger-api';

const VISIBILITY_OPTIONS: { value: IncomeVisibility; title: string; description: string }[] = [
  {
    value: 'RATIO_ONLY',
    title: 'Mostrar só a proporção',
    description:
      'Quem divide a casa com você vê apenas a porcentagem (ex.: 60% / 40%), não o valor. Atenção: com duas pessoas, quem sabe a própria renda consegue deduzir a sua pela proporção.',
  },
  {
    value: 'EXACT',
    title: 'Mostrar o valor',
    description: 'Quem divide a casa com você vê o valor exato da sua renda.',
  },
];

/** Income per member with per-member visibility (FR-INC-01..04, ADR-005). */
export function IncomePage() {
  const { householdId = '' } = useParams();
  const household = useHousehold(householdId);
  const members = useMembers(householdId);
  const overview = useIncomeOverview(householdId);
  const history = useMyIncomeHistory(householdId);
  const mutations = useIncomeMutations(householdId);
  const [amount, setAmount] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();

  const currency = household.data?.currency ?? 'BRL';
  const defaultStart = household.data ? `${monthOf(todayIn(household.data.timezone))}-01` : '';
  const me = members.data?.find((member) => member.isMe);
  const names = new Map((members.data ?? []).map((member) => [member.id, member.displayName]));
  const current = history.data?.[0];

  const run = async (action: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await action();
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'VALIDATION_FAILED') {
        setError(
          'A data de início precisa ser igual ou posterior à do registro mais recente. Para corrigir o histórico, remova o último registro.',
        );
      } else {
        setError(errorMessage(failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR'));
      }
      return false;
    }
  };

  const onAdd = async () => {
    const cents = parseMoneyInput(amount);
    if (cents === null || cents === 0) {
      setFieldError('Informe o valor mensal (ex.: 6.500,00).');
      return;
    }
    setFieldError(undefined);
    if (
      await run(() =>
        mutations.add.mutateAsync({
          monthlyAmountCents: cents,
          effectiveFrom: effectiveFrom || defaultStart,
        }),
      )
    ) {
      setAmount('');
    }
  };

  return (
    <div className="space-y-6">
      <Card
        title="Sua renda mensal"
        description="Usada para dividir despesas proporcionalmente. Quando a renda muda, registre o novo valor a partir da data da mudança — despesas antigas mantêm a proporção da época."
      >
        <FormAlert message={error} />
        {current ? (
          <p>
            Atual: <strong>{formatCents(current.monthlyAmountCents, currency)}</strong> desde{' '}
            {formatDate(current.effectiveFrom)}
          </p>
        ) : (
          <p className="text-muted-foreground">Você ainda não cadastrou sua renda.</p>
        )}
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void onAdd();
          }}
        >
          <FormField label={current ? 'Novo valor mensal' : 'Valor mensal'} error={fieldError}>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
              }}
            />
          </FormField>
          <FormField label="A partir de">
            <Input
              type="date"
              value={effectiveFrom || defaultStart}
              onChange={(event) => {
                setEffectiveFrom(event.target.value);
              }}
            />
          </FormField>
          <Button type="submit" disabled={mutations.add.isPending}>
            Salvar
          </Button>
        </form>
        {history.data && history.data.length > 0 && (
          <ul className="divide-y divide-border text-sm" aria-label="Histórico da sua renda">
            {history.data.map((record, index) => (
              <li key={record.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {formatCents(record.monthlyAmountCents, currency)} · de{' '}
                  {formatDate(record.effectiveFrom)}
                  {record.effectiveTo
                    ? ` até a véspera de ${formatDate(record.effectiveTo)}`
                    : ' em diante'}
                </span>
                {index === 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm('Remover este registro? O anterior volta a valer.')) {
                        void run(() => mutations.remove.mutateAsync(record.id));
                      }
                    }}
                  >
                    Remover
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Quem vê o valor da sua renda">
        <fieldset className="space-y-2">
          <legend className="sr-only">Visibilidade da renda</legend>
          {VISIBILITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer gap-3 rounded-lg border border-border p-3"
            >
              <input
                type="radio"
                name="incomeVisibility"
                className="mt-1"
                checked={me?.incomeVisibility === option.value}
                onChange={() => void run(() => mutations.setVisibility.mutateAsync(option.value))}
              />
              <span>
                <span className="block font-medium">{option.title}</span>
                <span className="block text-sm text-muted-foreground">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </Card>

      <Card title="Renda da casa hoje">
        <LoadState isPending={overview.isPending} error={overview.error} />
        {overview.data && (
          <ul className="divide-y divide-border">
            {overview.data.members.map((member) => (
              <li key={member.memberId} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {names.get(member.memberId) ?? 'Membro'}
                  {member.isMe ? ' (você)' : ''}
                </span>
                <span className="text-right text-sm">
                  {!member.hasIncome
                    ? 'Sem renda cadastrada'
                    : member.monthlyAmountCents !== null
                      ? formatCents(member.monthlyAmountCents, currency)
                      : 'Valor oculto'}
                  {member.shareBps !== null && (
                    <span className="block font-medium">
                      {formatBps(member.shareBps)} da renda da casa
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {overview.data?.members.some((member) => !member.hasIncome) && (
          <p className="text-sm text-muted-foreground">
            A divisão proporcional à renda só funciona quando todos cadastram a renda.
          </p>
        )}
      </Card>
    </div>
  );
}
