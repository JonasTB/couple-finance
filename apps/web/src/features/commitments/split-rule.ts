import type { SplitInput } from '@couple-finance/shared';

/**
 * Split rule of a commitment. Amount-specific rules (CUSTOM_AMOUNT) do not exist for templates;
 * custom percentages set through the API are kept as they are (`KEEP`).
 */
export type TemplateSplitMode = 'DEFAULT' | 'EQUAL' | 'INCOME_PROPORTIONAL' | 'INDIVIDUAL' | 'KEEP';

export interface TemplateSplitValue {
  mode: TemplateSplitMode;
  responsibleMemberId: string;
}

export function splitValueOf(split: SplitInput | null | undefined, fallbackMemberId: string) {
  if (!split) return { mode: 'DEFAULT' as const, responsibleMemberId: fallbackMemberId };
  if (split.type === 'INDIVIDUAL') {
    return {
      mode: 'INDIVIDUAL' as const,
      responsibleMemberId: split.responsibleMemberId ?? fallbackMemberId,
    };
  }
  if (split.type === 'EQUAL' || split.type === 'INCOME_PROPORTIONAL') {
    return { mode: split.type, responsibleMemberId: fallbackMemberId };
  }
  return { mode: 'KEEP' as const, responsibleMemberId: fallbackMemberId };
}

/** null = household default; undefined = keep the stored rule. */
export function splitInputOf(value: TemplateSplitValue): SplitInput | null | undefined {
  switch (value.mode) {
    case 'DEFAULT':
      return null;
    case 'KEEP':
      return undefined;
    case 'INDIVIDUAL':
      return { type: 'INDIVIDUAL', responsibleMemberId: value.responsibleMemberId };
    default:
      return { type: value.mode };
  }
}
