import type {
  DefaultSplitType,
  HouseholdDetail,
  HouseholdMemberView,
} from '@couple-finance/shared';
import { useState } from 'react';
import { errorMessage } from '@/shared/api/error-messages';
import { ApiError } from '@/shared/api/http';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { FormAlert } from '@/shared/ui/form-alert';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { useUpdateHousehold } from './households-api';
import { SplitChoice } from './split-choice';

interface SettingsCardProps {
  household: HouseholdDetail;
  members: HouseholdMemberView[];
}

function initialPercents(household: HouseholdDetail, members: HouseholdMemberView[]) {
  const fromRule = new Map(household.defaultSplit.weights?.map((w) => [w.memberId, w.bps / 100]));
  const even = Math.floor(100 / Math.max(members.length, 1));
  return Object.fromEntries(
    members.map((member, index) => [
      member.id,
      String(fromRule.get(member.id) ?? (index === 0 ? 100 - even * (members.length - 1) : even)),
    ]),
  );
}

/** Owner-only settings: name and default split (CUSTOM_PERCENT in whole percents). */
export function SettingsCard({ household, members }: SettingsCardProps) {
  const update = useUpdateHousehold(household.id);
  const [name, setName] = useState(household.name);
  const [split, setSplit] = useState<DefaultSplitType>(household.defaultSplit.type);
  const [percents, setPercents] = useState(() => initialPercents(household, members));
  const [localError, setLocalError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const options: DefaultSplitType[] =
    members.length > 1
      ? ['EQUAL', 'INCOME_PROPORTIONAL', 'CUSTOM_PERCENT']
      : ['EQUAL', 'INCOME_PROPORTIONAL'];

  const onSave = async () => {
    setSaved(false);
    setLocalError(undefined);
    let weights: { memberId: string; bps: number }[] | undefined;
    if (split === 'CUSTOM_PERCENT') {
      weights = members.map((member) => ({
        memberId: member.id,
        bps: Math.round(Number(percents[member.id] ?? '0') * 100),
      }));
      const valid = weights.every((w) => Number.isInteger(w.bps) && w.bps >= 0 && w.bps <= 10_000);
      if (!valid || weights.reduce((sum, w) => sum + w.bps, 0) !== 10_000) {
        setLocalError('Os percentuais precisam somar 100%.');
        return;
      }
    }
    try {
      await update.mutateAsync({
        version: household.version,
        name: name.trim(),
        defaultSplit: weights ? { type: split, weights } : { type: split },
      });
      setSaved(true);
    } catch {
      // Shown via mutation state.
    }
  };

  const error = update.error;

  return (
    <Card title="Configurações da casa">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void onSave();
        }}
      >
        {error && (
          <FormAlert
            message={errorMessage(error instanceof ApiError ? error.code : 'INTERNAL_ERROR')}
          />
        )}
        <FormAlert message={localError} />
        <FormField label="Nome da casa">
          <Input
            value={name}
            maxLength={60}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </FormField>
        <SplitChoice name="settingsSplit" value={split} options={options} onChange={setSplit} />
        {split === 'CUSTOM_PERCENT' && (
          <div className="grid gap-3 sm:grid-cols-2">
            {members.map((member) => (
              <FormField key={member.id} label={`${member.displayName} (%)`}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={0.01}
                  value={percents[member.id] ?? ''}
                  onChange={(event) => {
                    setPercents({ ...percents, [member.id]: event.target.value });
                  }}
                />
              </FormField>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
          {saved && (
            <span role="status" className="text-sm text-muted-foreground">
              Configurações salvas.
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
