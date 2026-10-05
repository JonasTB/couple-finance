/**
 * Largest-remainder (Hamilton) allocation over integers (CALCULATIONS.md §1, ADR-006).
 *
 * Splits `total` into integer parts proportional to non-negative integer `weights`.
 * Leftover units go to the largest fractional remainders; ties go to the earlier entry, so the
 * caller's order (the stable member order: joinedAt, id) is the deterministic tie-break.
 * Intermediate products use BigInt: amount × income-cents can exceed 2^53.
 *
 * Guarantees: Σ parts = total; |part_i − total·w_i/W| < 1; same input → same output.
 */
export function allocateLargestRemainder(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new RangeError('total must be a non-negative safe integer');
  }
  if (weights.length === 0) {
    throw new RangeError('at least one weight is required');
  }
  if (weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0)) {
    throw new RangeError('weights must be non-negative safe integers');
  }
  const totalWeight = weights.reduce((sum, weight) => sum + BigInt(weight), 0n);
  if (totalWeight === 0n) {
    throw new RangeError('weights must not all be zero');
  }

  const bigTotal = BigInt(total);
  const shares = weights.map((weight, index) => {
    const product = bigTotal * BigInt(weight);
    return { index, quotient: product / totalWeight, remainder: product % totalWeight };
  });
  const distributed = shares.reduce((sum, share) => sum + share.quotient, 0n);
  let leftover = Number(bigTotal - distributed); // 0 <= leftover < weights.length

  const byRemainder = [...shares].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  const extra = new Set<number>();
  for (const share of byRemainder) {
    if (leftover === 0) break;
    extra.add(share.index);
    leftover -= 1;
  }
  return shares.map((share) => Number(share.quotient) + (extra.has(share.index) ? 1 : 0));
}
