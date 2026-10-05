import type { HouseholdMemberView } from '@couple-finance/shared';
import { SPLIT_TYPE_LABELS } from '@/features/ledger/labels';
import { FormField } from '@/shared/ui/form-field';
import { Select } from '@/shared/ui/select';
import type { TemplateSplitMode, TemplateSplitValue } from './split-rule';

interface SplitFieldProps {
  value: TemplateSplitValue;
  onChange: (value: TemplateSplitValue) => void;
  members: HouseholdMemberView[];
  defaultLabel: string;
  canKeep: boolean;
  error?: string | undefined;
}

export function SplitField({
  value,
  onChange,
  members,
  defaultLabel,
  canKeep,
  error,
}: SplitFieldProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="Divisão" error={error}>
        <Select
          value={value.mode}
          onChange={(event) => {
            onChange({ ...value, mode: event.target.value as TemplateSplitMode });
          }}
        >
          {canKeep && <option value="KEEP">Manter percentuais atuais</option>}
          <option value="DEFAULT">Padrão da casa ({defaultLabel.toLowerCase()})</option>
          <option value="EQUAL">{SPLIT_TYPE_LABELS.EQUAL}</option>
          <option value="INCOME_PROPORTIONAL">{SPLIT_TYPE_LABELS.INCOME_PROPORTIONAL}</option>
          <option value="INDIVIDUAL">{SPLIT_TYPE_LABELS.INDIVIDUAL}</option>
        </Select>
      </FormField>
      {value.mode === 'INDIVIDUAL' && (
        <FormField label="De quem é a despesa">
          <Select
            value={value.responsibleMemberId}
            onChange={(event) => {
              onChange({ ...value, responsibleMemberId: event.target.value });
            }}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
        </FormField>
      )}
    </div>
  );
}
