import { type DefaultSplitRule } from '@couple-finance/shared';

const TOTAL_BPS = 10_000;

export type DefaultSplitViolation =
  | 'WEIGHTS_NOT_ALLOWED'
  | 'WEIGHTS_REQUIRED'
  | 'WEIGHTS_MUST_COVER_ACTIVE_MEMBERS'
  | 'WEIGHT_OUT_OF_RANGE'
  | 'WEIGHTS_MUST_SUM_TO_10000';

/**
 * A household default split (BUSINESS_RULES 7, ADR-006). CUSTOM_PERCENT needs exactly one
 * integer bps weight per active member, summing to 10000.
 */
export function validateDefaultSplit(
  rule: DefaultSplitRule,
  activeMemberIds: readonly string[],
): DefaultSplitViolation[] {
  if (rule.type !== 'CUSTOM_PERCENT') {
    return rule.weights === undefined ? [] : ['WEIGHTS_NOT_ALLOWED'];
  }
  const weights = rule.weights ?? [];
  if (weights.length === 0) {
    return ['WEIGHTS_REQUIRED'];
  }
  const violations: DefaultSplitViolation[] = [];
  const ids = weights.map((weight) => weight.memberId);
  const coversExactly =
    new Set(ids).size === ids.length &&
    ids.length === activeMemberIds.length &&
    activeMemberIds.every((id) => ids.includes(id));
  if (!coversExactly) {
    violations.push('WEIGHTS_MUST_COVER_ACTIVE_MEMBERS');
  }
  if (weights.some(({ bps }) => !Number.isInteger(bps) || bps < 0 || bps > TOTAL_BPS)) {
    violations.push('WEIGHT_OUT_OF_RANGE');
  } else if (weights.reduce((sum, { bps }) => sum + bps, 0) !== TOTAL_BPS) {
    violations.push('WEIGHTS_MUST_SUM_TO_10000');
  }
  return violations;
}

/**
 * After someone joins or leaves, custom weights no longer match the members. The default falls
 * back to EQUAL (recorded in the audit trail) instead of leaving an invalid rule behind.
 */
export function reconcileDefaultSplit(
  rule: DefaultSplitRule,
  activeMemberIds: readonly string[],
): DefaultSplitRule {
  if (rule.type === 'CUSTOM_PERCENT' && validateDefaultSplit(rule, activeMemberIds).length > 0) {
    return { type: 'EQUAL' };
  }
  return rule;
}
