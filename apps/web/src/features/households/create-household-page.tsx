import {
  DEFAULT_TIMEZONE,
  type DefaultSplitType,
  SUPPORTED_CURRENCIES,
} from '@couple-finance/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { Button } from '@/shared/ui/button';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { activeHousehold } from './browser-storage';
import { useCreateHousehold } from './households-api';
import { SplitChoice } from './split-choice';

const CURRENCY_LABELS = { BRL: 'Real (R$)', USD: 'Dólar americano (US$)', EUR: 'Euro (€)' };

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Onboarding step 1 (USER_JOURNEYS: create household → invite → split). */
export function CreateHouseholdPage() {
  const navigate = useNavigate();
  const createHousehold = useCreateHousehold();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [currency, setCurrency] = useState<(typeof SUPPORTED_CURRENCIES)[number]>('BRL');
  const [split, setSplit] = useState<DefaultSplitType>('EQUAL');
  const timezone = browserTimeZone();

  const onSubmit = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setNameError('Dê um nome para a casa.');
      return;
    }
    setNameError(undefined);
    try {
      const household = await createHousehold.mutateAsync({
        name: trimmed,
        currency,
        timezone,
        defaultSplit: { type: split },
      });
      activeHousehold.set(household.id);
      await navigate(`/casas/${household.id}`, { replace: true });
    } catch {
      // Shown below via mutation state.
    }
  };

  const submitError = createHousehold.error;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="space-y-1">
        <p className="text-sm font-medium text-primary">Passo 1 de 2</p>
        <h1 className="text-2xl font-semibold tracking-tight">Crie a sua casa</h1>
        <p className="text-muted-foreground">
          A casa é o espaço que vocês dois vão compartilhar. O dinheiro continua nas contas de cada
          um — aqui vocês só organizam e entendem os gastos.
        </p>
      </div>
      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
      >
        {submitError && (
          <FormAlert
            message={errorMessage(
              submitError instanceof ApiError ? submitError.code : 'INTERNAL_ERROR',
            )}
          />
        )}
        <FormField
          label="Nome da casa"
          error={nameError}
          hint="Por exemplo: “Casa da Ana e do Bruno”."
        >
          <Input
            value={name}
            maxLength={60}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </FormField>
        <SplitChoice
          name="defaultSplit"
          value={split}
          options={['EQUAL', 'INCOME_PROPORTIONAL']}
          onChange={setSplit}
        />
        <FormField label="Moeda" hint={`Fuso horário da casa: ${timezone}.`}>
          <Select
            value={currency}
            onChange={(event) => {
              setCurrency(event.target.value as typeof currency);
            }}
          >
            {SUPPORTED_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {CURRENCY_LABELS[code]}
              </option>
            ))}
          </Select>
        </FormField>
        <Button type="submit" className="w-full" disabled={createHousehold.isPending}>
          {createHousehold.isPending ? 'Criando…' : 'Criar casa'}
        </Button>
      </form>
    </div>
  );
}
