import fc from 'fast-check';
import { allocateLargestRemainder } from './allocation';

describe('allocateLargestRemainder', () => {
  it.each([
    [10000, [1, 1, 1], [3334, 3333, 3333]],
    [10001, [6000, 4000], [6001, 4000]],
    [100, [1, 1], [50, 50]],
    [1, [1, 1], [1, 0]],
    [999, [5000, 5000], [500, 499]],
    [10000, [600000, 400000], [6000, 4000]],
    [7, [0, 1], [0, 7]],
    [0, [1, 2], [0, 0]],
  ])('allocates %i over %j as %j', (total, weights, expected) => {
    expect(allocateLargestRemainder(total, weights)).toEqual(expected);
  });

  it('breaks ties by input order (stable member order)', () => {
    expect(allocateLargestRemainder(2, [1, 1, 1])).toEqual([1, 1, 0]);
    expect(allocateLargestRemainder(5, [3, 3])).toEqual([3, 2]);
  });

  it('gives the leftover to the larger fractional remainder, not the larger weight', () => {
    // 10 × 1/3 = 3.33 (r .33), 10 × 2/3 = 6.67 (r .67) → the second gets the extra unit.
    expect(allocateLargestRemainder(10, [1, 2])).toEqual([3, 7]);
  });

  it('handles products beyond 2^53 exactly (amount × income in cents)', () => {
    const total = 99_999_999_999;
    const weights = [987_654_321_00, 123_456_789_00];
    const parts = allocateLargestRemainder(total, weights);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    const exact0 =
      (BigInt(total) * BigInt(weights[0] ?? 0)) / BigInt((weights[0] ?? 0) + (weights[1] ?? 0));
    expect(BigInt(parts[0] ?? 0) - exact0).toBeLessThanOrEqual(1n);
  });

  it.each([
    [-1, [1]],
    [1.5, [1]],
    [10, []],
    [10, [0, 0]],
    [10, [-1, 2]],
    [10, [0.5, 1]],
  ])('rejects invalid input total=%p weights=%j', (total, weights) => {
    expect(() => allocateLargestRemainder(total, weights)).toThrow(RangeError);
  });

  describe('properties', () => {
    const input = fc
      .tuple(
        fc.integer({ min: 0, max: 99_999_999_999 }),
        fc.array(fc.integer({ min: 0, max: 1_000_000_000 }), { minLength: 1, maxLength: 6 }),
      )
      .filter(([, weights]) => weights.some((weight) => weight > 0));

    it('always sums exactly to the total (BUSINESS_RULES 2)', () => {
      fc.assert(
        fc.property(input, ([total, weights]) => {
          const parts = allocateLargestRemainder(total, weights);
          expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
          expect(parts.every((part) => Number.isSafeInteger(part) && part >= 0)).toBe(true);
        }),
        { numRuns: 2000 },
      );
    });

    it('stays within one unit of the exact proportional share', () => {
      fc.assert(
        fc.property(input, ([total, weights]) => {
          const parts = allocateLargestRemainder(total, weights);
          const sum = weights.reduce((a, b) => a + BigInt(b), 0n);
          parts.forEach((part, i) => {
            const scaledExact = BigInt(total) * BigInt(weights[i] ?? 0); // exact × sum
            const scaledPart = BigInt(part) * sum;
            const diff =
              scaledPart > scaledExact ? scaledPart - scaledExact : scaledExact - scaledPart;
            expect(diff < sum).toBe(true); // |part − exact| < 1
          });
        }),
        { numRuns: 2000 },
      );
    });

    it('gives zero to zero weights and is deterministic', () => {
      fc.assert(
        fc.property(input, ([total, weights]) => {
          const first = allocateLargestRemainder(total, weights);
          expect(allocateLargestRemainder(total, weights)).toEqual(first);
          weights.forEach((weight, i) => {
            if (weight === 0) expect(first[i]).toBe(0);
          });
        }),
      );
    });
  });
});
