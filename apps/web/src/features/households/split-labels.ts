import type { DefaultSplitType, HouseholdRole } from '@couple-finance/shared';

export const SPLIT_LABELS: Record<DefaultSplitType, { title: string; description: string }> = {
  EQUAL: {
    title: 'Dividir igualmente',
    description: 'Cada pessoa é responsável pela mesma parte das despesas da casa.',
  },
  INCOME_PROPORTIONAL: {
    title: 'Proporcional à renda',
    description:
      'Quem ganha mais assume uma parte maior. Cada um decide se mostra a própria renda.',
  },
  CUSTOM_PERCENT: {
    title: 'Percentuais combinados',
    description: 'Vocês definem a porcentagem de cada um.',
  },
};

export const ROLE_LABELS: Record<HouseholdRole, string> = {
  OWNER: 'Administra a casa',
  MEMBER: 'Membro',
};
