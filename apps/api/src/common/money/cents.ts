/**
 * Money is carried as integer minor units ("cents") — ADR-002.
 * These helpers guard the boundaries where cents enter or leave the domain.
 */

/** Largest single amount accepted by the API (< R$ 1 bilhão). Far below 2^53. */
export { MAX_AMOUNT_CENTS } from '@couple-finance/shared';

export function isSafeCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertSafeCents(value: unknown, field = 'amountCents'): number {
  if (!isSafeCents(value)) {
    throw new RangeError(`${field} must be a safe integer number of cents`);
  }
  return value;
}

/**
 * Converts a PostgreSQL BIGINT (returned by node-postgres as a string) into a number of cents,
 * throwing instead of silently losing precision.
 */
export function centsFromDatabase(raw: string | number | bigint, field = 'amountCents'): number {
  const asBigInt = typeof raw === 'bigint' ? raw : BigInt(raw);
  if (asBigInt > BigInt(Number.MAX_SAFE_INTEGER) || asBigInt < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`${field} from database exceeds the safe integer range`);
  }
  return Number(asBigInt);
}
