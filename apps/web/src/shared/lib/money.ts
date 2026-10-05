import type { CurrencyCode } from '@couple-finance/shared';
import { MAX_AMOUNT_CENTS } from '@couple-finance/shared';

/**
 * The only place where the web app turns typed text into money (ADR-002). Accepts pt-BR input:
 * "1.234,56", "1234,5", "1234", "R$ 12,30". A dot is a thousands separator only in groups of
 * three; "12.5" is rejected rather than guessed. Returns integer cents, or null if invalid.
 */
export function parseMoneyInput(text: string): number | null {
  const cleaned = text.replace(/R\$|\s/g, '');
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(cleaned);
  if (!match) {
    return null;
  }
  const integerPart = (match[1] ?? '').replace(/\./g, '');
  const decimals = (match[2] ?? '').padEnd(2, '0');
  const cents = Number(integerPart) * 100 + Number(decimals);
  return Number.isSafeInteger(cents) && cents <= MAX_AMOUNT_CENTS ? cents : null;
}

/** Plain text for an input field: 123456 → "1.234,56". */
export function centsToInput(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

const formatters = new Map<CurrencyCode, Intl.NumberFormat>();

/** Display only (cents / 100 is exact for display; never used for arithmetic). */
export function formatCents(cents: number, currency: CurrencyCode = 'BRL'): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency });
    formatters.set(currency, formatter);
  }
  return formatter.format(cents / 100);
}

/** 6000 → "60%"; 3333 → "33,33%". */
export function formatBps(bps: number): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(bps / 100)}%`;
}

/** Difference between two shares: 900 → "9 p.p."; 399 → "3,99 p.p." (unsigned). */
export function formatPoints(bps: number): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Math.abs(bps) / 100)} p.p.`;
}

/** "60" or "33,33" (percent typed by the user) → bps, or null. */
export function parsePercentInput(text: string): number | null {
  const match = /^(\d{1,3})(?:,(\d{1,2}))?$/.exec(text.trim().replace('.', ','));
  if (!match) {
    return null;
  }
  const bps = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return bps <= 10_000 ? bps : null;
}

const compactFormatters = new Map<CurrencyCode, Intl.NumberFormat>();

/** Chart axes only: 123456 → "R$ 1,2 mil". */
export function formatCompactCents(cents: number, currency: CurrencyCode = 'BRL'): string {
  let formatter = compactFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    compactFormatters.set(currency, formatter);
  }
  return formatter.format(cents / 100);
}

/** Signed percentage for changes: 1250 → "+12,5%", −574 → "−5,74%". */
export function formatSignedBps(bps: number): string {
  return `${bps > 0 ? '+' : bps < 0 ? '−' : ''}${formatBps(Math.abs(bps))}`;
}
