import type { CurrencyCode, DashboardMember } from '@couple-finance/shared';
import { formatCents } from '@/shared/lib/money';

/** Categorical slots in fixed order (index.css). Color follows the member's stable position. */
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];

export function memberColor(index: number): string {
  return SERIES[index] ?? 'var(--muted-foreground)';
}

export function personName(names: ReadonlyMap<string, string>, member: DashboardMember): string {
  return names.get(member.memberId) ?? 'Ex-membro';
}

/**
 * Neutral wording for a contribution balance (CLAUDE.md: explain, never shame).
 * Positive → contributed beyond their part; negative → below it.
 */
export function balanceText(cents: number, currency: CurrencyCode): string {
  if (cents === 0) {
    return 'em dia';
  }
  return `${formatCents(Math.abs(cents), currency)} ${cents > 0 ? 'além' : 'abaixo'} da sua parte`;
}
