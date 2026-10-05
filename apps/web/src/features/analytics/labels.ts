import type { AnalyticsMonth, CurrencyCode } from '@couple-finance/shared';
import { formatCents } from '@/shared/lib/money';

/** "2026-09" → "setembro". */
export function monthName(month: string): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

/** Neutral change wording: "R$ 300,00 a menos que" / "a mais que" / "Mesmo valor que". */
export function changeSentence(changeCents: number, currency: CurrencyCode): string {
  if (changeCents === 0) return 'Mesmo valor que';
  return `${formatCents(Math.abs(changeCents), currency)} ${changeCents > 0 ? 'a mais' : 'a menos'} que`;
}

/** Spend kinds, fixed first (CALCULATIONS §11): colors are the ordered `--kind-*` tokens. */
export const SPEND_KINDS = [
  { key: 'recurringCents', label: 'Recorrentes', color: 'var(--kind-1)' },
  { key: 'installmentCents', label: 'Parcelas', color: 'var(--kind-2)' },
  { key: 'otherCents', label: 'Avulsas', color: 'var(--kind-3)' },
] as const satisfies readonly { key: keyof AnalyticsMonth; label: string; color: string }[];
