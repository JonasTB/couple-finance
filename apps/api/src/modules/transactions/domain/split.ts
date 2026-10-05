import type { DefaultSplitRule, SplitInput, SplitType } from '@couple-finance/shared';
import { allocateLargestRemainder } from '../../../common/money/allocation';

/**
 * Split rules (CALCULATIONS.md §1–2, ADR-006). Pure: no I/O, no framework.
 * Member ids passed in `eligibleMemberIds` must already be in stable member order
 * (joinedAt, id); every output follows that order, which makes the tie-break deterministic.
 */

export const TOTAL_BPS = 10_000;

export interface SplitWeight {
  memberId: string;
  /** bps (percent/proportional), 1 (equal/individual) or cents (custom amount). */
  weight: number;
}

export interface SplitSnapshot {
  type: SplitType;
  weights: SplitWeight[];
  incomeBasisDate?: string;
}

export interface Allocation {
  memberId: string;
  amountCents: number;
}

export interface ResolvedSplit {
  snapshot: SplitSnapshot;
  allocations: Allocation[];
}

/** Validation failure of a split request; mapped to an HTTP error by the application layer. */
export class SplitError extends Error {
  constructor(
    readonly kind: 'INVALID' | 'SUM_MISMATCH',
    readonly field: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface SplitContext {
  /** Members that may take part, in stable member order. */
  eligibleMemberIds: readonly string[];
  /** Default participants for EQUAL/INCOME_PROPORTIONAL (the active members), stable order. */
  defaultParticipantIds: readonly string[];
}

/** A validated request; INCOME_PROPORTIONAL still needs the income bps of its participants. */
export type SplitPlan =
  | { type: 'EQUAL' | 'INDIVIDUAL'; participantIds: string[] }
  | { type: 'INCOME_PROPORTIONAL'; participantIds: string[] }
  | { type: 'CUSTOM_PERCENT' | 'CUSTOM_AMOUNT'; weights: SplitWeight[] };

function inStableOrder(ids: readonly string[], context: SplitContext): string[] {
  return context.eligibleMemberIds.filter((id) => ids.includes(id));
}

function assertMembers(field: string, ids: readonly string[], context: SplitContext): void {
  if (new Set(ids).size !== ids.length) {
    throw new SplitError('INVALID', field, 'a member appears more than once');
  }
  const unknown = ids.filter((id) => !context.eligibleMemberIds.includes(id));
  if (unknown.length > 0) {
    throw new SplitError(
      'INVALID',
      field,
      'contains members who cannot take part in this expense',
      {
        memberIds: unknown,
      },
    );
  }
}

function assertOnly(input: SplitInput, allowed: readonly (keyof SplitInput)[]): void {
  for (const key of ['participants', 'weights', 'amounts', 'responsibleMemberId'] as const) {
    if (input[key] !== undefined && !allowed.includes(key)) {
      throw new SplitError('INVALID', `split.${key}`, `not allowed for ${input.type}`);
    }
  }
}

export function planSplit(
  input: SplitInput,
  amountCents: number,
  context: SplitContext,
): SplitPlan {
  switch (input.type) {
    case 'EQUAL':
    case 'INCOME_PROPORTIONAL': {
      assertOnly(input, ['participants']);
      const requested = input.participants ?? context.defaultParticipantIds;
      assertMembers('split.participants', requested, context);
      if (requested.length === 0) {
        throw new SplitError(
          'INVALID',
          'split.participants',
          'at least one participant is required',
        );
      }
      return { type: input.type, participantIds: inStableOrder(requested, context) };
    }
    case 'INDIVIDUAL': {
      assertOnly(input, ['responsibleMemberId']);
      if (!input.responsibleMemberId) {
        throw new SplitError('INVALID', 'split.responsibleMemberId', 'required for INDIVIDUAL');
      }
      assertMembers('split.responsibleMemberId', [input.responsibleMemberId], context);
      return { type: 'INDIVIDUAL', participantIds: [input.responsibleMemberId] };
    }
    case 'CUSTOM_PERCENT': {
      assertOnly(input, ['weights']);
      const weights = input.weights ?? [];
      if (weights.length === 0) {
        throw new SplitError('INVALID', 'split.weights', 'required for CUSTOM_PERCENT');
      }
      assertMembers(
        'split.weights',
        weights.map((w) => w.memberId),
        context,
      );
      if (weights.some((w) => !Number.isInteger(w.bps) || w.bps < 0 || w.bps > TOTAL_BPS)) {
        throw new SplitError(
          'INVALID',
          'split.weights',
          'each weight must be an integer between 0 and 10000 bps',
        );
      }
      const sum = weights.reduce((total, w) => total + w.bps, 0);
      if (sum !== TOTAL_BPS) {
        throw new SplitError(
          'INVALID',
          'split.weights',
          'percentages must add up to 100% (10000 bps)',
          {
            sumBps: sum,
          },
        );
      }
      const byMember = new Map(weights.map((w) => [w.memberId, w.bps]));
      return {
        type: 'CUSTOM_PERCENT',
        weights: inStableOrder([...byMember.keys()], context).map((memberId) => ({
          memberId,
          weight: byMember.get(memberId) ?? 0,
        })),
      };
    }
    case 'CUSTOM_AMOUNT': {
      assertOnly(input, ['amounts']);
      const amounts = input.amounts ?? [];
      if (amounts.length === 0) {
        throw new SplitError('INVALID', 'split.amounts', 'required for CUSTOM_AMOUNT');
      }
      assertMembers(
        'split.amounts',
        amounts.map((a) => a.memberId),
        context,
      );
      if (amounts.some((a) => !Number.isSafeInteger(a.amountCents) || a.amountCents < 0)) {
        throw new SplitError(
          'INVALID',
          'split.amounts',
          'amounts must be non-negative integers (cents)',
        );
      }
      const sum = amounts.reduce((total, a) => total + a.amountCents, 0);
      if (sum !== amountCents) {
        throw new SplitError(
          'SUM_MISMATCH',
          'split.amounts',
          'amounts must add up to the transaction amount',
          {
            expectedCents: amountCents,
            actualCents: sum,
          },
        );
      }
      const byMember = new Map(amounts.map((a) => [a.memberId, a.amountCents]));
      return {
        type: 'CUSTOM_AMOUNT',
        weights: inStableOrder([...byMember.keys()], context).map((memberId) => ({
          memberId,
          weight: byMember.get(memberId) ?? 0,
        })),
      };
    }
  }
}

/** Turns a plan into stored weights + allocations. `incomeBps` is required for INCOME_PROPORTIONAL. */
export function allocateSplit(
  amountCents: number,
  plan: SplitPlan,
  income?: { bps: readonly number[]; basisDate: string },
): ResolvedSplit {
  let snapshot: SplitSnapshot;
  if ('weights' in plan) {
    snapshot = { type: plan.type, weights: plan.weights };
  } else if (plan.type === 'INCOME_PROPORTIONAL') {
    if (income?.bps.length !== plan.participantIds.length) {
      throw new Error('income bps are required for every participant');
    }
    snapshot = {
      type: plan.type,
      weights: plan.participantIds.map((memberId, i) => ({ memberId, weight: income.bps[i] ?? 0 })),
      incomeBasisDate: income.basisDate,
    };
  } else {
    snapshot = {
      type: plan.type,
      weights: plan.participantIds.map((memberId) => ({ memberId, weight: 1 })),
    };
  }
  return { snapshot, allocations: reallocate(amountCents, snapshot) };
}

/**
 * Allocates an amount with stored weights (amount edits keep the original basis — ADR-006).
 * CUSTOM_AMOUNT weights are the amounts themselves, so a different amount needs a new split.
 */
export function reallocate(amountCents: number, snapshot: SplitSnapshot): Allocation[] {
  if (snapshot.type === 'CUSTOM_AMOUNT') {
    const sum = snapshot.weights.reduce((total, w) => total + w.weight, 0);
    if (sum !== amountCents) {
      throw new SplitError(
        'SUM_MISMATCH',
        'split.amounts',
        'the amount changed: send the new per-person amounts',
        { expectedCents: amountCents, actualCents: sum },
      );
    }
    return snapshot.weights.map((w) => ({ memberId: w.memberId, amountCents: w.weight }));
  }
  const parts = allocateLargestRemainder(
    amountCents,
    snapshot.weights.map((w) => w.weight),
  );
  return snapshot.weights.map((w, i) => ({ memberId: w.memberId, amountCents: parts[i] ?? 0 }));
}

/** The household default rule (ADR-005) as a transaction split request. */
export function splitFromDefault(rule: DefaultSplitRule): SplitInput {
  if (rule.type === 'CUSTOM_PERCENT') {
    return { type: 'CUSTOM_PERCENT', weights: rule.weights ?? [] };
  }
  return { type: rule.type };
}
