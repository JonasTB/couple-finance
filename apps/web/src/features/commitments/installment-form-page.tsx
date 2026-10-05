import {
  INSTALLMENT_MAX_COUNT,
  INSTALLMENT_MIN_COUNT,
  type InstallmentPlanInput,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '@couple-finance/shared';
import { type SyntheticEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useHousehold, useMembers } from '@/features/households/households-api';
import { CategorySelect } from '@/features/ledger/category-select';
import { PAYMENT_METHOD_LABELS, SPLIT_TYPE_LABELS } from '@/features/ledger/labels';
import { useCategories } from '@/features/ledger/ledger-api';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { todayIn } from '@/shared/lib/dates';
import { parseMoneyInput } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { useInstallmentMutations } from './commitments-api';
import { SplitField } from './split-field';
import { splitInputOf, type TemplateSplitValue, splitValueOf } from './split-rule';

type AmountMode = 'TOTAL' | 'INSTALLMENT';

/** New installment purchase (FR-INST-01): every installment is created as an expense. */
export function InstallmentFormPage() {
  const { householdId = '' } = useParams();
  const navigate = useNavigate();
  const household = useHousehold(householdId);
  const members = useMembers(householdId);
  const categories = useCategories(householdId);
  const mutations = useInstallmentMutations(householdId);
  const me = household.data?.me.memberId ?? '';
  const [description, setDescription] = useState('');
  const [amountMode, setAmountMode] = useState<AmountMode>('TOTAL');
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState('10');
  const [firstDate, setFirstDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [payer, setPayer] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CREDIT_CARD');
  const [split, setSplit] = useState<TemplateSplitValue | null>(null);
  const [error, setError] = useState<string>();

  if (!household.data || !members.data || !categories.data) {
    return (
      <p role="status" className="py-12 text-center text-muted-foreground">
        Carregando…
      </p>
    );
  }
  const today = todayIn(household.data.timezone);
  const splitValue = split ?? splitValueOf(null, me);
  const back = `/casas/${householdId}/compromissos`;

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setError(undefined);
    const cents = parseMoneyInput(amount);
    const installments = Number(count);
    const problem = !description.trim()
      ? 'Descreva a compra.'
      : !cents
        ? 'Informe o valor (ex.: 4.200,00).'
        : !Number.isInteger(installments) ||
            installments < INSTALLMENT_MIN_COUNT ||
            installments > INSTALLMENT_MAX_COUNT
          ? `O número de parcelas vai de ${String(INSTALLMENT_MIN_COUNT)} a ${String(INSTALLMENT_MAX_COUNT)}.`
          : !categoryId
            ? 'Escolha a categoria.'
            : null;
    if (problem || !cents) {
      setError(problem ?? undefined);
      return;
    }
    const splitInput = splitInputOf(splitValue);
    const input: InstallmentPlanInput = {
      description: description.trim(),
      ...(amountMode === 'TOTAL' ? { totalAmountCents: cents } : { installmentAmountCents: cents }),
      installmentCount: installments,
      firstInstallmentDate: firstDate || today,
      categoryId,
      payerMemberId: payer || me,
      paymentMethod,
      ...(splitInput ? { split: splitInput } : {}),
    };
    try {
      const plan = await mutations.create.mutateAsync(input);
      await navigate(`${back}/parcelados/${plan.id}`, { replace: true });
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'VALIDATION_FAILED') {
        setError('Confira o valor: são pelo menos R$ 0,01 por parcela.');
        return;
      }
      setError(errorMessage(failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR'));
    }
  };

  return (
    <form className="space-y-4" onSubmit={(event) => void submit(event)} noValidate>
      <h2 className="text-lg font-semibold">Nova compra parcelada</h2>
      <p className="text-sm text-muted-foreground">
        Todas as parcelas entram como despesas, uma por mês a partir da primeira. Se o total não
        dividir exato, os centavos que sobram ficam na 1ª parcela.
      </p>
      <FormAlert message={error} />
      <FormField label="Descrição">
        <Input
          maxLength={120}
          placeholder="Ex.: Geladeira"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
      </FormField>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Valor informado</legend>
        <div className="flex flex-wrap gap-4">
          {(
            [
              ['TOTAL', 'Total da compra'],
              ['INSTALLMENT', 'Valor de cada parcela'],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="amountMode"
                checked={amountMode === mode}
                onChange={() => {
                  setAmountMode(mode);
                }}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={amountMode === 'TOTAL' ? 'Valor total' : 'Valor da parcela'}>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
              }}
            />
          </FormField>
          <FormField label="Parcelas">
            <Input
              type="number"
              min={INSTALLMENT_MIN_COUNT}
              max={INSTALLMENT_MAX_COUNT}
              value={count}
              onChange={(event) => {
                setCount(event.target.value);
              }}
            />
          </FormField>
          <FormField label="Primeira parcela">
            <Input
              type="date"
              value={firstDate || today}
              onChange={(event) => {
                setFirstDate(event.target.value);
              }}
            />
          </FormField>
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Categoria">
          <CategorySelect
            categories={categories.data}
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
            }}
          />
        </FormField>
        <FormField label="Quem pagou">
          <Select
            value={payer || me}
            onChange={(event) => {
              setPayer(event.target.value);
            }}
          >
            {members.data.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Forma de pagamento">
          <Select
            value={paymentMethod}
            onChange={(event) => {
              setPaymentMethod(event.target.value as PaymentMethod);
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
        value={splitValue}
        onChange={setSplit}
        members={members.data}
        defaultLabel={SPLIT_TYPE_LABELS[household.data.defaultSplit.type]}
        canKeep={false}
      />
      <p className="text-sm text-muted-foreground">
        Na divisão pela renda, vale a renda da data da primeira parcela para todas as parcelas.
      </p>
      <div className="flex gap-2">
        <Button type="submit" disabled={mutations.create.isPending}>
          {mutations.create.isPending ? 'Criando parcelas…' : 'Criar compra parcelada'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void navigate(back)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
