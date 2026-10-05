import type { CurrencyCode, InstallmentPlanView } from '@couple-finance/shared';
import { type SyntheticEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useHousehold } from '@/features/households/households-api';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { capitalizeFirst, formatDate, formatMonth, todayIn } from '@/shared/lib/dates';
import { formatCents, parseMoneyInput } from '@/shared/lib/money';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { useInstallmentMutations, useInstallmentPlan } from './commitments-api';
import { PLAN_STATUS_LABELS } from './labels';

/** One installment purchase: progress, installments and early end (FR-INST-03/04). */
export function InstallmentPlanPage() {
  const { householdId = '', planId = '' } = useParams();
  const household = useHousehold(householdId);
  const plan = useInstallmentPlan(householdId, planId);

  if (plan.isError) {
    return <FormAlert message="Não encontramos esta compra parcelada." />;
  }
  if (!plan.data || !household.data) {
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
      currency={household.data.currency}
      today={todayIn(household.data.timezone)}
    />
  );
}

function PlanDetail({
  householdId,
  plan,
  currency,
  today,
}: {
  householdId: string;
  plan: InstallmentPlanView;
  currency: CurrencyCode;
  today: string;
}) {
  const navigate = useNavigate();
  const mutations = useInstallmentMutations(householdId);
  const [closing, setClosing] = useState<'CANCEL' | 'PAY_OFF' | null>(null);
  const [date, setDate] = useState(today);
  const [payoff, setPayoff] = useState('');
  const [error, setError] = useState<string>();
  const money = (cents: number) => formatCents(cents, currency);
  const back = `/casas/${householdId}/compromissos`;
  const canClose = plan.status === 'ACTIVE' && plan.deletedAt === null;

  const close = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!closing) return;
    setError(undefined);
    const payoffCents = closing === 'PAY_OFF' ? parseMoneyInput(payoff) : null;
    if (closing === 'PAY_OFF' && !payoffCents) {
      setError('Informe o valor pago na quitação.');
      return;
    }
    try {
      await mutations.close.mutateAsync({
        id: plan.id,
        kind: closing,
        date,
        ...(payoffCents ? { payoffAmountCents: payoffCents } : {}),
      });
      setClosing(null);
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'VALIDATION_FAILED') {
        setError('Não há parcelas depois desta data.');
        return;
      }
      setError(errorMessage(failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR'));
    }
  };

  const remove = async () => {
    if (!window.confirm('Excluir esta compra e todas as parcelas? Dá para desfazer em seguida.')) {
      return;
    }
    try {
      await mutations.remove.mutateAsync(plan.id);
      await navigate(back, { replace: true, state: { deletedPlanId: plan.id } });
    } catch (failure) {
      setError(errorMessage(failure instanceof ApiError ? failure.code : 'INTERNAL_ERROR'));
    }
  };

  return (
    <div className="space-y-4">
      <Link
        to={back}
        className="inline-flex min-h-11 items-center text-sm text-primary hover:underline"
      >
        ‹ Compromissos
      </Link>
      <Card title={plan.description} description={PLAN_STATUS_LABELS[plan.status]}>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-muted-foreground">Pagas</dt>
            <dd className="font-medium tabular-nums">
              {plan.paidCount} de {plan.installmentCount}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Já pago</dt>
            <dd className="font-medium tabular-nums">{money(plan.paidCents)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Falta</dt>
            <dd className="font-medium tabular-nums">{money(plan.remainingCents)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Total</dt>
            <dd className="font-medium tabular-nums">{money(plan.totalCents)}</dd>
          </div>
        </dl>
        {plan.releaseMonth && plan.status === 'ACTIVE' && (
          <p className="text-sm">
            {money(plan.installmentAmountCents)}/mês liberados em {formatMonth(plan.releaseMonth)}.
          </p>
        )}
        {plan.totalCents !== plan.originalTotalCents && (
          <p className="text-sm text-muted-foreground">
            Valor original da compra: {money(plan.originalTotalCents)}.
          </p>
        )}
      </Card>

      <FormAlert message={error} />

      <Card title="Parcelas">
        <ul className="divide-y divide-border">
          {plan.installments?.map((installment) => (
            <li key={installment.transactionId}>
              <Link
                to={`/casas/${householdId}/despesas/${installment.transactionId}`}
                className="flex items-center justify-between gap-3 py-2 hover:bg-muted/50"
              >
                <span>
                  {installment.payoff
                    ? `Quitação (parcelas ${String(installment.number)} a ${String(plan.installmentCount)})`
                    : `Parcela ${String(installment.number)}/${String(plan.installmentCount)}`}
                  <span className="block text-sm text-muted-foreground">
                    {capitalizeFirst(formatDate(installment.date))} ·{' '}
                    {installment.status === 'PAID' ? 'paga' : 'a vencer'}
                  </span>
                </span>
                <span className="tabular-nums">{money(installment.amountCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {canClose && (
        <Card
          title="Encerrar antes do fim"
          description="Parcelas com data depois do corte são excluídas (podem ser vistas em Despesas › excluídas)."
        >
          {!closing ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setClosing('PAY_OFF');
                }}
              >
                Quitar antecipadamente
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setClosing('CANCEL');
                }}
              >
                Cancelar parcelas restantes
              </Button>
            </div>
          ) : (
            <form
              aria-label="Encerrar compra parcelada"
              className="space-y-3"
              onSubmit={(event) => void close(event)}
            >
              <p className="text-sm">
                {closing === 'PAY_OFF'
                  ? 'Registra uma despesa com o valor pago e remove as parcelas seguintes.'
                  : 'Remove as parcelas seguintes, sem registrar pagamento (ex.: compra devolvida).'}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={closing === 'PAY_OFF' ? 'Data da quitação' : 'Data de corte'}>
                  <Input
                    type="date"
                    value={date}
                    onChange={(event) => {
                      setDate(event.target.value);
                    }}
                  />
                </FormField>
                {closing === 'PAY_OFF' && (
                  <FormField
                    label="Valor pago"
                    hint={`Restante sem desconto: ${money(plan.remainingCents)}`}
                  >
                    <Input
                      inputMode="decimal"
                      placeholder="0,00"
                      value={payoff}
                      onChange={(event) => {
                        setPayoff(event.target.value);
                      }}
                    />
                  </FormField>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={mutations.close.isPending}>
                  Confirmar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setClosing(null);
                  }}
                >
                  Voltar
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      <Button variant="ghost" onClick={() => void remove()}>
        Excluir compra
      </Button>
    </div>
  );
}
