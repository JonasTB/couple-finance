import { type ValueTransformer } from 'typeorm';
import { assertSafeCents, centsFromDatabase } from './cents';

/**
 * TypeORM transformer for `bigint` money columns (ADR-002).
 * Usage: `@Column({ type: 'bigint', transformer: bigintCentsTransformer })`.
 */
export const bigintCentsTransformer = {
  to: (value: unknown): string | null | undefined => {
    // Explicit returns (not `return value`): Vercel's function compiler may not apply our strict
    // tsconfig, and this must type-check either way.
    if (value === null) return null;
    if (value === undefined) return undefined;
    return String(assertSafeCents(value));
  },
  from: (value: unknown): number | null => {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
      throw new TypeError('Unexpected database value for a cents column');
    }
    return centsFromDatabase(value);
  },
} satisfies ValueTransformer;
